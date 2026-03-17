import { pool } from "../../config/db.js";

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

    if (rows.length) {
        return rows[0].category_id;
    }

    return null;
}

export async function saveCategoryCache(merchant, categoryId) {
    await pool.execute(
        `
    INSERT INTO merchant_category_cache (merchant,category_id)
    VALUES (?,?)
    ON DUPLICATE KEY UPDATE category_id = VALUES(category_id)
  `,
        [merchant, categoryId],
    );
}
