/**
 * @file src/services/transactionService.js
 * @description Servicio de gestión de transacciones financieras.
 *
 * Provee operaciones CRUD completas más filtrado y paginación.
 * Los tipos de transacción son:
 *   - 'income'  → Ingreso (suma al balance).
 *   - 'expense' → Gasto (resta del balance).
 *   - 'saving'  → Aporte a meta (resta del balance; creado automáticamente por goalService).
 *
 * NOTA: El frontend solo crea/actualiza transacciones de tipo 'income' o 'expense'.
 * Las de tipo 'saving' las genera goalService.allocate() automáticamente.
 */

import { pool } from "../config/db.js";
import { NotFoundError } from "../errors/AppError.js";

/**
 * Construye la cláusula WHERE y los parámetros para filtrar transacciones.
 * Centralizado para no repetir la lógica en list() y en el conteo total.
 *
 * @param {number} userId - ID del usuario (siempre requerido).
 * @param {object} [filters={}] - Filtros opcionales.
 * @param {string} [filters.type]        - 'income', 'expense' o 'saving'.
 * @param {number} [filters.category_id] - ID de la categoría.
 * @param {string} [filters.start_date]  - Fecha inicio (YYYY-MM-DD).
 * @param {string} [filters.end_date]    - Fecha fin (YYYY-MM-DD).
 * @returns {{ where: string, params: Array }} Cláusula WHERE y parámetros para execute().
 */
const buildWhereClause = (userId, filters = {}) => {
    const { type, category_id, start_date, end_date } = filters;
    const conditions = ["t.user_id = ?"];
    const params = [userId];

    if (type) {
        conditions.push("t.type = ?");
        params.push(type);
    }
    if (category_id) {
        conditions.push("t.category_id = ?");
        params.push(category_id);
    }
    if (start_date) {
        conditions.push("t.date >= ?");
        params.push(start_date);
    }
    if (end_date) {
        conditions.push("t.date <= ?");
        params.push(end_date);
    }

    return { where: conditions.join(" AND "), params };
};

export const transactionService = {
    /**
     * Lista transacciones con paginación y filtros opcionales.
     *
     * Parámetros de paginación:
     *   - page:  número de página (mínimo 1, defecto 1).
     *   - limit: resultados por página (mínimo 1, máximo 100, defecto 20).
     *
     * @param {number} userId   - ID del usuario autenticado.
     * @param {object} [filters={}] - Filtros y parámetros de paginación.
     * @returns {Promise<{
     *   transactions: Array,
     *   pagination: {total: number, page: number, limit: number, totalPages: number}
     * }>}
     */
    async list(userId, filters = {}) {
        const page = Math.max(1, parseInt(filters.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(filters.limit) || 20));
        const offset = (page - 1) * limit;

        const { where, params } = buildWhereClause(userId, filters);

        // Consulta de conteo total (para calcular totalPages)
        const [countRows] = await pool.execute(
            `SELECT COUNT(*) AS total FROM transactions t WHERE ${where}`,
            params,
        );

        // Consulta de datos con JOIN a categorías para nombre y tipo
        // LIMIT/OFFSET van inline (no como parámetros) porque mysql2 no los admite como ?
        const [dataRows] = await pool.execute(
            `SELECT
         t.id, t.type, t.amount, t.description, t.date,
         t.created_at, t.updated_at, t.category_id,
         c.name  AS category_name,
         c.type  AS category_type
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       WHERE ${where}
       ORDER BY t.date DESC, t.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
            params,
        );

        const total = countRows[0].total;

        return {
            transactions: dataRows,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    },

    /**
     * Obtiene una transacción por ID junto con el nombre de su categoría.
     *
     * @param {number} id     - ID de la transacción.
     * @param {number} userId - ID del usuario autenticado.
     * @returns {Promise<object>} La transacción encontrada.
     * @throws {NotFoundError} Si no existe o no pertenece al usuario.
     */
    async getById(id, userId) {
        const [rows] = await pool.execute(
            `SELECT t.id, t.type, t.amount, t.description, t.date,
              t.created_at, t.updated_at, t.category_id,
              c.name AS category_name
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.id = ? AND t.user_id = ?`,
            [id, userId],
        );
        if (rows.length === 0)
            throw new NotFoundError("Transacción", "TRANSACTION_NOT_FOUND");
        return rows[0];
    },

    /**
     * Crea una nueva transacción.
     * Verifica que la categoría exista y sea accesible para el usuario
     * (global o propia) antes de insertar.
     *
     * @param {number} userId - ID del usuario autenticado.
     * @param {object} data
     * @param {string} data.type          - 'income' o 'expense'.
     * @param {number} data.amount        - Monto positivo.
     * @param {number} data.category_id   - ID de la categoría.
     * @param {string} [data.description] - Descripción opcional.
     * @param {string} [data.date]        - Fecha en formato YYYY-MM-DD (defecto: hoy).
     * @returns {Promise<object>} La transacción recién creada.
     * @throws {NotFoundError} Si la categoría no existe o no es accesible.
     */
    async create(userId, { type, amount, category_id, description, date }) {
        // Verificar que la categoría exista y sea accesible
        const [catRows] = await pool.execute(
            "SELECT id FROM categories WHERE id = ? AND (user_id IS NULL OR user_id = ?)",
            [category_id, userId],
        );
        if (catRows.length === 0)
            throw new NotFoundError("Categoría", "CATEGORY_NOT_FOUND");

        const txDate = date || new Date().toISOString().split("T")[0];

        const [result] = await pool.execute(
            `INSERT INTO transactions (user_id, type, amount, category_id, description, date)
       VALUES (?, ?, ?, ?, ?, ?)`,
            [
                userId,
                type,
                parseFloat(amount),
                category_id,
                description || null,
                txDate,
            ],
        );

        const [rows] = await pool.execute(
            `SELECT t.id, t.type, t.amount, t.description, t.date,
              t.created_at, t.category_id, c.name AS category_name
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.id = ?`,
            [result.insertId],
        );
        return rows[0];
    },

    /**
     * Actualiza una transacción existente.
     * Verifica propiedad del usuario y validez de la categoría antes de actualizar.
     *
     * @param {number} id     - ID de la transacción a actualizar.
     * @param {number} userId - ID del usuario autenticado.
     * @param {object} data   - Campos a actualizar (todos requeridos para update completo).
     * @returns {Promise<object>} La transacción actualizada.
     * @throws {NotFoundError} Si la transacción o la categoría no existen.
     */
    async update(id, userId, { type, amount, category_id, description, date }) {
        // Verificar propiedad
        const [existing] = await pool.execute(
            "SELECT id FROM transactions WHERE id = ? AND user_id = ?",
            [id, userId],
        );
        if (existing.length === 0)
            throw new NotFoundError("Transacción", "TRANSACTION_NOT_FOUND");

        // Verificar categoría
        const [catRows] = await pool.execute(
            "SELECT id FROM categories WHERE id = ? AND (user_id IS NULL OR user_id = ?)",
            [category_id, userId],
        );
        if (catRows.length === 0)
            throw new NotFoundError("Categoría", "CATEGORY_NOT_FOUND");

        await pool.execute(
            `UPDATE transactions
       SET type = ?, amount = ?, category_id = ?, description = ?, date = ?, updated_at = NOW()
       WHERE id = ? AND user_id = ?`,
            [
                type,
                parseFloat(amount),
                category_id,
                description || null,
                date,
                id,
                userId,
            ],
        );

        const [rows] = await pool.execute(
            `SELECT t.id, t.type, t.amount, t.category_id, t.description, t.date,
              t.updated_at, c.name AS category_name
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.id = ?`,
            [id],
        );
        return rows[0];
    },

    /**
     * Elimina una transacción.
     *
     * @param {number} id     - ID de la transacción a eliminar.
     * @param {number} userId - ID del usuario autenticado.
     * @returns {Promise<{id: number}>} El ID eliminado.
     * @throws {NotFoundError} Si la transacción no existe o no pertenece al usuario.
     */
    async delete(id, userId) {
        const [result] = await pool.execute(
            "DELETE FROM transactions WHERE id = ? AND user_id = ?",
            [id, userId],
        );
        if (result.affectedRows === 0)
            throw new NotFoundError("Transacción", "TRANSACTION_NOT_FOUND");
        return { id: parseInt(id) };
    },
};
