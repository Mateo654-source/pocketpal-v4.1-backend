/**
 * @file src/services/categoryService.js
 * @description Servicio de gestión de categorías de transacciones.
 *
 * Las categorías pueden ser:
 *   - Globales (user_id = NULL): visibles para todos los usuarios.
 *     Son creadas por el sistema en db/init.js y no se pueden editar ni eliminar.
 *   - Personalizadas (user_id = <id>): creadas por el usuario, solo visibles para él.
 *
 * El listado devuelve ambos tipos ordenados: globales primero, luego personalizadas.
 */

import { pool } from "../config/db.js";
import { NotFoundError, ConflictError } from "../errors/AppError.js";

export const categoryService = {
    /**
     * Lista todas las categorías disponibles para un usuario:
     * las globales (user_id IS NULL) más las propias del usuario.
     * Agrega un campo 'scope' que indica si es 'global' o 'custom'.
     *
     * @param {number} userId - ID del usuario autenticado.
     * @returns {Promise<Array>} Lista de categorías con scope.
     */
    async list(userId) {
        const [rows] = await pool.execute(
            `SELECT
         id,
         name,
         type,
         user_id,
         CASE WHEN user_id IS NULL THEN 'global' ELSE 'custom' END AS scope
       FROM categories
       WHERE user_id IS NULL OR user_id = ?
       ORDER BY
         (user_id IS NULL) DESC, -- globales primero (IS NULL = 1 = mayor orden DESC)
         name ASC`,
            [userId],
        );
        return rows;
    },

    /**
     * Obtiene una categoría por ID.
     * Solo devuelve categorías globales o propias del usuario.
     *
     * @param {number} id     - ID de la categoría.
     * @param {number} userId - ID del usuario autenticado.
     * @returns {Promise<object>} La categoría encontrada.
     * @throws {NotFoundError} Si no existe o el usuario no tiene acceso.
     */
    async getById(id, userId) {
        const [rows] = await pool.execute(
            `SELECT id, name, type, user_id,
              CASE WHEN user_id IS NULL THEN 'global' ELSE 'custom' END AS scope
       FROM categories
       WHERE id = ? AND (user_id IS NULL OR user_id = ?)`,
            [id, userId],
        );
        if (rows.length === 0)
            throw new NotFoundError("Categoría", "CATEGORY_NOT_FOUND");
        return rows[0];
    },

    /**
     * Crea una categoría personalizada para el usuario.
     * Verifica que no exista ya una categoría igual (mismo nombre y tipo) para ese usuario.
     *
     * @param {number} userId - ID del usuario autenticado.
     * @param {object} data
     * @param {string} data.name - Nombre de la categoría.
     * @param {string} data.type - Tipo: 'income' o 'expense'.
     * @returns {Promise<object>} La categoría recién creada.
     * @throws {ConflictError} Si ya existe una categoría igual para este usuario.
     */
    async create(userId, { name, type }) {
        // Verificar duplicado: mismo nombre + tipo para este usuario
        const [existing] = await pool.execute(
            "SELECT id FROM categories WHERE name = ? AND type = ? AND user_id = ?",
            [name.trim(), type, userId],
        );
        if (existing.length > 0)
            throw new ConflictError(
                "Ya tienes una categoría con ese nombre y tipo",
                "CATEGORY_DUPLICATE",
            );

        const [result] = await pool.execute(
            "INSERT INTO categories (name, type, user_id) VALUES (?, ?, ?)",
            [name.trim(), type, userId],
        );

        const [rows] = await pool.execute(
            `SELECT id, name, type, user_id,
              CASE WHEN user_id IS NULL THEN 'global' ELSE 'custom' END AS scope
       FROM categories WHERE id = ?`,
            [result.insertId],
        );
        return rows[0];
    },

    /**
     * Actualiza el nombre o tipo de una categoría personalizada del usuario.
     * Las categorías globales (user_id = NULL) no se pueden editar.
     *
     * @param {number} id     - ID de la categoría a actualizar.
     * @param {number} userId - ID del usuario autenticado.
     * @param {object} data
     * @param {string} data.name - Nuevo nombre.
     * @param {string} data.type - Nuevo tipo.
     * @returns {Promise<object>} La categoría actualizada.
     * @throws {NotFoundError} Si la categoría no existe o es global (no editable).
     */
    async update(id, userId, { name, type }) {
        // Solo categorías propias del usuario (no globales)
        const [existing] = await pool.execute(
            "SELECT id FROM categories WHERE id = ? AND user_id = ?",
            [id, userId],
        );
        if (existing.length === 0)
            throw new NotFoundError(
                "Categoría propia (las categorías globales no se pueden editar)",
                "CATEGORY_NOT_FOUND",
            );

        await pool.execute(
            "UPDATE categories SET name = ?, type = ?, updated_at = NOW() WHERE id = ? AND user_id = ?",
            [name.trim(), type, id, userId],
        );

        const [rows] = await pool.execute(
            `SELECT id, name, type, user_id,
              CASE WHEN user_id IS NULL THEN 'global' ELSE 'custom' END AS scope
       FROM categories WHERE id = ?`,
            [id],
        );
        return rows[0];
    },

    /**
     * Elimina una categoría personalizada del usuario.
     * No se puede eliminar si tiene transacciones asociadas.
     * Las categorías globales (user_id = NULL) no se pueden eliminar.
     *
     * @param {number} id     - ID de la categoría a eliminar.
     * @param {number} userId - ID del usuario autenticado.
     * @returns {Promise<{id: number}>} El ID de la categoría eliminada.
     * @throws {NotFoundError} Si la categoría no existe o es global.
     * @throws {ConflictError} Si tiene transacciones asociadas.
     */
    async delete(id, userId) {
        // Solo categorías propias del usuario
        const [existing] = await pool.execute(
            "SELECT id FROM categories WHERE id = ? AND user_id = ?",
            [id, userId],
        );
        if (existing.length === 0)
            throw new NotFoundError(
                "Categoría propia (las categorías globales no se pueden eliminar)",
                "CATEGORY_NOT_FOUND",
            );

        // Verificar que no tenga transacciones asociadas a este usuario
        const [[{ total }]] = await pool.execute(
            "SELECT COUNT(*) AS total FROM transactions WHERE category_id = ? AND user_id = ?",
            [id, userId],
        );
        if (total > 0)
            throw new ConflictError(
                "No se puede eliminar: esta categoría tiene transacciones asociadas",
                "CATEGORY_IN_USE",
            );

        await pool.execute(
            "DELETE FROM categories WHERE id = ? AND user_id = ?",
            [id, userId],
        );
        return { id: parseInt(id) };
    },
};
