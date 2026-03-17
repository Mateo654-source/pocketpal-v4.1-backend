/**
 * @file src/services/summaryService.js
 * @description Servicio de resúmenes financieros y estadísticas.
 *
 * Genera dos tipos de resúmenes:
 *   1. getSummary(): totales de ingresos/gastos, desglose por categoría,
 *      y tendencia mensual. Acepta filtros de fecha opcionales.
 *   2. getGoalsOverview(): vista general de metas activas y completadas
 *      con totales y último aporte.
 *
 * Los cálculos incluyen transacciones de tipo 'saving' dentro de los gastos
 * porque representan dinero que sale del balance disponible del usuario.
 */

import { pool } from "../config/db.js";

export const summaryService = {
    /**
     * Genera un resumen financiero para el usuario.
     *
     * Retorna tres conjuntos de datos calculados en paralelo:
     *   - totals: ingresos totales, gastos totales (expense + saving), balance neto.
     *   - categoryBreakdown: monto y cantidad de transacciones agrupados por categoría.
     *   - monthlyTrend: ingresos y gastos agrupados por mes (útil para gráficas).
     *
     * @param {number} userId   - ID del usuario autenticado.
     * @param {object} [filters={}] - Filtros de fecha opcionales.
     * @param {string} [filters.start_date] - Fecha inicio (YYYY-MM-DD).
     * @param {string} [filters.end_date]   - Fecha fin (YYYY-MM-DD).
     * @returns {Promise<{
     *   totals: {total_income: number, total_expenses: number, net_balance: number},
     *   categoryBreakdown: Array,
     *   monthlyTrend: Array
     * }>}
     */
    async getSummary(userId, filters = {}) {
        const { start_date, end_date } = filters;

        // Construir filtro de fecha dinámico
        const conditions = [];
        const params = [userId]; // parámetro base: siempre filtramos por usuario

        if (start_date) {
            conditions.push("date >= ?");
            params.push(start_date);
        }
        if (end_date) {
            conditions.push("date <= ?");
            params.push(end_date);
        }

        // Si hay filtros de fecha, agregar AND; si no, cadena vacía
        const dateFilter = conditions.length
            ? "AND " + conditions.join(" AND ")
            : "";

        // Ejecutar las 3 queries en paralelo para reducir tiempo de respuesta
        const [[totals], [breakdown], [monthly]] = await Promise.all([
            // 1. Totales: ingresos, gastos (expense + saving) y balance neto
            pool.execute(
                `SELECT
           COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0)
             AS total_income,
           COALESCE(SUM(CASE WHEN type IN ('expense','saving') THEN amount ELSE 0 END), 0)
             AS total_expenses,
           COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) -
           COALESCE(SUM(CASE WHEN type IN ('expense','saving') THEN amount ELSE 0 END), 0)
             AS net_balance
         FROM transactions
         WHERE user_id = ? ${dateFilter}`,
                params,
            ),

            // 2. Desglose por categoría: cuánto se gastó/ingresó en cada una
            pool.execute(
                `SELECT
           c.id   AS category_id,
           c.name AS category_name,
           t.type,
           SUM(t.amount) AS total,
           COUNT(t.id)   AS transaction_count
         FROM transactions t
         JOIN categories c ON t.category_id = c.id
         WHERE t.user_id = ? ${dateFilter}
         GROUP BY c.id, c.name, t.type
         ORDER BY total DESC`,
                params,
            ),

            // 3. Tendencia mensual: ingresos y gastos por mes (para gráfica de barras)
            pool.execute(
                `SELECT
           DATE_FORMAT(date, '%Y-%m') AS month,
           SUM(CASE WHEN type = 'income'            THEN amount ELSE 0 END) AS income,
           SUM(CASE WHEN type IN ('expense','saving') THEN amount ELSE 0 END) AS expenses
         FROM transactions
         WHERE user_id = ? ${dateFilter}
         GROUP BY DATE_FORMAT(date, '%Y-%m')
         ORDER BY month ASC`,
                params,
            ),
        ]);

        return {
            totals: totals[0],
            categoryBreakdown: breakdown,
            monthlyTrend: monthly,
        };
    },

    /**
     * Genera una vista general de las metas de ahorro del usuario.
     *
     * Incluye:
     *   - summary: totales (total metas, activas, completadas, montos).
     *   - goals: separadas en { active, completed }.
     *
     * Para cada meta incluye:
     *   - progress_percent: porcentaje completado (máximo 100%).
     *   - remaining_amount: cuánto falta para llegar al objetivo.
     *   - allocation_count: número de aportes realizados.
     *   - last_allocation_date: fecha del último aporte.
     *
     * @param {number} userId - ID del usuario autenticado.
     * @returns {Promise<{
     *   summary: object,
     *   goals: {active: Array, completed: Array}
     * }>}
     */
    async getGoalsOverview(userId) {
        const [rows] = await pool.execute(
            `SELECT
         g.id,
         g.title,
         g.target_amount,
         g.current_amount,
         g.is_completed,
         g.completed_at,
         LEAST(ROUND((g.current_amount / g.target_amount * 100), 2), 100) AS progress_percent,
         GREATEST(g.target_amount - g.current_amount, 0)                  AS remaining_amount,
         COUNT(ga.id)                                                      AS allocation_count,
         MAX(ga.created_at)                                                AS last_allocation_date
       FROM goals g
       LEFT JOIN goal_allocations ga ON g.id = ga.goal_id
       WHERE g.user_id = ?
       GROUP BY
         g.id, g.title, g.target_amount, g.current_amount,
         g.is_completed, g.completed_at
       ORDER BY g.is_completed ASC, g.created_at DESC`,
            [userId],
        );

        const active = rows.filter((g) => !g.is_completed);
        const completed = rows.filter((g) => g.is_completed);

        return {
            summary: {
                totalGoals: rows.length,
                activeGoals: active.length,
                completedGoals: completed.length,
                totalTargetAmount: rows.reduce(
                    (s, g) => s + parseFloat(g.target_amount),
                    0,
                ),
                totalSavedAmount: rows.reduce(
                    (s, g) => s + parseFloat(g.current_amount),
                    0,
                ),
            },
            goals: { active, completed },
        };
    },
};
