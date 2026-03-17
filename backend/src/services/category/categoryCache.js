/**
 * @file src/services/category/categoryCache.js
 * @description Caché de categorías por nombre de comercio (merchant).
 *
 * Almacena en la tabla `merchant_category_cache` el mapeo entre un merchant
 * y la categoría que se le asignó la última vez. Esto evita llamar a la IA
 * en cada sincronización para comercios que ya fueron clasificados antes.
 *
 * Flujo de categorización en gmailService.js:
 *   1. Reglas deterministas (categoryRules.js)
 *   2. Caché por merchant ← este módulo
 *   3. Similitud de texto (categorySimilarity.js)
 *   4. IA como último recurso (chatgpt-integration.service.js)
 *
 * NOTA: La tabla merchant_category_cache debe existir en la base de datos.
 * Si no está en init.js, agregar la migración antes de usar este módulo.
 */

import { pool } from "../../config/db.js";

/**
 * Busca la categoría guardada en caché para un merchant específico.
 * Solo devuelve categorías que existen y son accesibles para el usuario
 * (globales o propias).
 *
 * @param {string} merchant - Nombre del comercio, ej: "RAPPI COLOMBIA".
 * @param {number} userId   - ID del usuario (para validar acceso a la categoría).
 * @returns {Promise<number|null>} ID de la categoría en caché, o null si no hay.
 */
export async function getCategoryFromCache(merchant, userId) {
    const [rows] = await pool.execute(
        `
    SELECT mcc.category_id
    FROM merchant_category_cache mcc
    JOIN categories c ON c.id = mcc.category_id
    WHERE mcc.merchant = ?
    AND (c.user_id = ? OR c.user_id IS NULL)
    LIMIT 1
  `,
        [merchant, userId],
    );

    return rows.length ? rows[0].category_id : null;
}

/**
 * Guarda (o actualiza) la categoría asignada a un merchant en la caché.
 * Usa ON DUPLICATE KEY UPDATE para que sea idempotente.
 *
 * @param {string} merchant    - Nombre del comercio.
 * @param {number} categoryId  - ID de la categoría a guardar.
 * @returns {Promise<void>}
 */
export async function saveCategoryCache(merchant, categoryId) {
    await pool.execute(
        `
    INSERT INTO merchant_category_cache (merchant, category_id)
    VALUES (?, ?)
    ON DUPLICATE KEY UPDATE category_id = VALUES(category_id)
  `,
        [merchant, categoryId],
    );
}
