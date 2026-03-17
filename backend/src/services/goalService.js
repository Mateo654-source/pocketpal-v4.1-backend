/**
 * @file src/services/goalService.js
 * @description Servicio de metas de ahorro.
 *
 * Gestiona el ciclo completo de una meta:
 *   1. Crear / listar / obtener / actualizar / eliminar metas.
 *   2. Registrar aportes (allocate): actualiza current_amount, crea una
 *      transacción de tipo 'saving' y registra en goal_allocations.
 *   3. Registrar la decisión final al completar (completeGoal).
 *
 * Todas las operaciones que modifican más de una tabla usan transacciones
 * de MySQL (BEGIN / COMMIT / ROLLBACK) para garantizar consistencia.
 */

import { pool } from "../config/db.js";
import { NotFoundError, ConflictError } from "../errors/AppError.js";

/**
 * Fragmento SQL reutilizable para calcular el porcentaje de progreso de una meta.
 * Evita división por cero con el CASE WHEN.
 */
const SQL = `
  CASE WHEN target_amount > 0
    THEN ROUND((current_amount / target_amount * 100), 2)
    ELSE 0
  END AS progress_percent`;

export const goalService = {
    /**
     * Lista todas las metas de un usuario, ordenadas: activas primero,
     * luego por fecha de creación descendente.
     *
     * @param {number} userId - ID del usuario autenticado.
     * @returns {Promise<Array>} Lista de metas con su porcentaje de progreso.
     */
    async list(userId) {
        const [rows] = await pool.execute(
            `SELECT id, title, target_amount, current_amount, is_completed,
              completed_at, created_at, updated_at, ${SQL}
       FROM goals WHERE user_id = ?
       ORDER BY is_completed ASC, created_at DESC`,
            [userId],
        );
        return rows;
    },

    /**
     * Obtiene una meta por ID junto con su historial de aportes.
     *
     * @param {number} id     - ID de la meta.
     * @param {number} userId - ID del usuario autenticado.
     * @returns {Promise<{goal: object, allocations: Array}>}
     * @throws {NotFoundError} Si la meta no existe o no pertenece al usuario.
     */
    async getById(id, userId) {
        // Ejecutar ambas queries en paralelo para mejor rendimiento
        const [[goalRows], [allocRows]] = await Promise.all([
            pool.execute(
                `SELECT id, title, target_amount, current_amount, is_completed,
                completed_at, created_at, updated_at, ${SQL}
         FROM goals WHERE id = ? AND user_id = ?`,
                [id, userId],
            ),
            pool.execute(
                `SELECT id, amount, created_at
         FROM goal_allocations
         WHERE goal_id = ? AND user_id = ?
         ORDER BY created_at DESC`,
                [id, userId],
            ),
        ]);

        if (goalRows.length === 0)
            throw new NotFoundError("Meta", "GOAL_NOT_FOUND");

        return { goal: goalRows[0], allocations: allocRows };
    },

    /**
     * Crea una nueva meta de ahorro.
     *
     * @param {number} userId - ID del usuario autenticado.
     * @param {object} data
     * @param {string} data.title         - Nombre de la meta.
     * @param {number} data.target_amount - Monto objetivo (> 0).
     * @returns {Promise<object>} La meta recién creada.
     */
    async create(userId, { title, target_amount }) {
        const [result] = await pool.execute(
            "INSERT INTO goals (user_id, title, target_amount) VALUES (?, ?, ?)",
            [userId, title.trim(), parseFloat(target_amount)],
        );
        const [[row]] = await pool.execute(
            `SELECT id, title, target_amount, current_amount, is_completed,
              created_at, ${SQL}
       FROM goals WHERE id = ?`,
            [result.insertId],
        );
        return row;
    },

    /**
     * Actualiza el título o monto objetivo de una meta.
     * No permite reducir el objetivo por debajo del monto ya ahorrado.
     *
     * @param {number} id     - ID de la meta a actualizar.
     * @param {number} userId - ID del usuario autenticado.
     * @param {object} data
     * @param {string} data.title         - Nuevo título.
     * @param {number} data.target_amount - Nuevo monto objetivo.
     * @returns {Promise<object>} La meta actualizada.
     * @throws {NotFoundError} Si la meta no existe o no pertenece al usuario.
     * @throws {ConflictError} Si el nuevo objetivo es menor al monto ya ahorrado.
     */
    async update(id, userId, { title, target_amount }) {
        const [existing] = await pool.execute(
            "SELECT id, current_amount FROM goals WHERE id = ? AND user_id = ?",
            [id, userId],
        );
        if (existing.length === 0)
            throw new NotFoundError("Meta", "GOAL_NOT_FOUND");

        const newTarget = parseFloat(target_amount);
        const saved = parseFloat(existing[0].current_amount);

        // Validar que el nuevo objetivo no sea menor a lo ya ahorrado
        if (newTarget < saved)
            throw new ConflictError(
                `El nuevo objetivo ($${newTarget}) no puede ser menor a lo ya ahorrado ($${saved})`,
                "GOAL_TARGET_TOO_LOW",
            );

        await pool.execute(
            "UPDATE goals SET title = ?, target_amount = ?, updated_at = NOW() WHERE id = ? AND user_id = ?",
            [title.trim(), newTarget, id, userId],
        );

        const [[row]] = await pool.execute(
            `SELECT id, title, target_amount, current_amount, is_completed,
              updated_at, ${SQL}
       FROM goals WHERE id = ?`,
            [id],
        );
        return row;
    },

    /**
     * Elimina una meta y todos sus aportes asociados.
     * Usa transacción MySQL para garantizar que no queden aportes huérfanos.
     *
     * @param {number} id     - ID de la meta a eliminar.
     * @param {number} userId - ID del usuario autenticado.
     * @returns {Promise<{id: number}>} El ID eliminado.
     * @throws {NotFoundError} Si la meta no existe o no pertenece al usuario.
     */
    async delete(id, userId) {
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();

            const [existing] = await conn.execute(
                "SELECT id FROM goals WHERE id = ? AND user_id = ?",
                [id, userId],
            );
            if (existing.length === 0) {
                await conn.rollback();
                throw new NotFoundError("Meta", "GOAL_NOT_FOUND");
            }

            // Primero eliminar aportes (FK) y luego la meta
            await conn.execute(
                "DELETE FROM goal_allocations WHERE goal_id = ? AND user_id = ?",
                [id, userId],
            );
            await conn.execute(
                "DELETE FROM goals WHERE id = ? AND user_id = ?",
                [id, userId],
            );

            await conn.commit();
            return { id: parseInt(id) };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    },

    /**
     * Registra un aporte a una meta de ahorro.
     *
     * Dentro de una transacción MySQL:
     *   1. Bloquea la fila de la meta (FOR UPDATE) para evitar concurrencia.
     *   2. Incrementa current_amount y marca como completada si alcanza el objetivo.
     *   3. Crea una transacción de tipo 'saving' que descuenta del balance.
     *   4. Registra el aporte en goal_allocations.
     *
     * @param {number} id     - ID de la meta.
     * @param {number} userId - ID del usuario autenticado.
     * @param {number} amount - Monto a abonar (> 0).
     * @returns {Promise<{goal: object, allocation: object, justCompleted: boolean}>}
     * @throws {NotFoundError} Si la meta no existe.
     * @throws {ConflictError} Si la meta ya está completada.
     */
    async allocate(id, userId, amount) {
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();

            // FOR UPDATE: bloquea la fila durante la transacción (previene doble-abono)
            const [goalRows] = await conn.execute(
                `SELECT id, title, target_amount, current_amount, is_completed
         FROM goals WHERE id = ? AND user_id = ? FOR UPDATE`,
                [id, userId],
            );

            if (goalRows.length === 0) {
                await conn.rollback();
                throw new NotFoundError("Meta", "GOAL_NOT_FOUND");
            }

            const goal = goalRows[0];
            if (goal.is_completed) {
                await conn.rollback();
                throw new ConflictError(
                    "Esta meta ya está completada",
                    "GOAL_ALREADY_COMPLETED",
                );
            }

            const newAmount =
                parseFloat(goal.current_amount) + parseFloat(amount);
            const isCompleted = newAmount >= parseFloat(goal.target_amount);

            // Actualizar meta
            await conn.execute(
                `UPDATE goals
         SET current_amount = ?, is_completed = ?, completed_at = ?, updated_at = NOW()
         WHERE id = ? AND user_id = ?`,
                [
                    newAmount,
                    isCompleted ? 1 : 0,
                    isCompleted ? new Date() : null,
                    id,
                    userId,
                ],
            );

            // Buscar (o crear) categoría global "Ahorro" para la transacción
            const [[savingCat]] = await conn.execute(
                "SELECT id FROM categories WHERE name = 'Ahorro' AND user_id IS NULL LIMIT 1",
            );

            // Si por alguna razón no existe la categoría Ahorro, crear una temporal para el usuario
            let savingCatId;
            if (!savingCat) {
                const [catResult] = await conn.execute(
                    "INSERT INTO categories (name, type, user_id) VALUES ('Ahorro', 'expense', ?) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)",
                    [userId],
                );
                savingCatId = catResult.insertId;
            } else {
                savingCatId = savingCat.id;
            }

            // Registrar como transacción tipo 'saving' para que afecte el balance
            await conn.execute(
                `INSERT INTO transactions
           (user_id, amount, type, category_id, description, date)
         VALUES (?, ?, 'saving', ?, ?, CURDATE())`,
                [
                    userId,
                    parseFloat(amount),
                    savingCatId,
                    `Aporte a meta: ${goal.title ?? ""}`,
                ],
            );

            // Registrar el aporte en goal_allocations
            const [allocResult] = await conn.execute(
                "INSERT INTO goal_allocations (user_id, goal_id, amount) VALUES (?, ?, ?)",
                [userId, id, parseFloat(amount)],
            );

            await conn.commit();

            // Leer datos actualizados fuera del bloqueo FOR UPDATE
            const [[updatedGoal]] = await pool.execute(
                `SELECT id, title, target_amount, current_amount, is_completed,
                completed_at, ${SQL}
         FROM goals WHERE id = ?`,
                [id],
            );
            const [[allocation]] = await pool.execute(
                "SELECT id, amount, created_at FROM goal_allocations WHERE id = ?",
                [allocResult.insertId],
            );

            return {
                goal: updatedGoal,
                allocation,
                justCompleted: isCompleted,
            };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    },

    /**
     * Registra la decisión final del usuario cuando una meta se completa.
     * El dinero ya salió del balance al hacer los aportes; aquí solo se
     * guarda el tipo de decisión ('saving', 'spend', etc.).
     *
     * @param {number} id             - ID de la meta completada.
     * @param {number} userId         - ID del usuario autenticado.
     * @param {string} completionType - Tipo de decisión del usuario.
     * @returns {Promise<{completionType: string, title: string}>}
     * @throws {NotFoundError} Si la meta no existe o no está completada.
     */
    async completeGoal(id, userId, completionType) {
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();

            const [goalRows] = await conn.execute(
                "SELECT * FROM goals WHERE id = ? AND user_id = ? AND is_completed = 1 FOR UPDATE",
                [id, userId],
            );

            if (goalRows.length === 0) {
                await conn.rollback();
                throw new NotFoundError("Meta completada", "GOAL_NOT_FOUND");
            }

            await conn.execute(
                "UPDATE goals SET completion_type = ? WHERE id = ?",
                [completionType, id],
            );

            await conn.commit();
            return { completionType, title: goalRows[0].title };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    },
};

export default goalService;
