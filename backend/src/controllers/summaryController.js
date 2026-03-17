/**
 * @file src/controllers/summaryController.js
 * @description Controller HTTP para el recurso /api/summary.
 *
 * Provee endpoints de solo lectura para estadísticas financieras.
 * Toda la lógica de cálculo está en summaryService.js.
 *
 * Rutas soportadas (requieren token JWT válido):
 *   GET /api/summary        → resumen financiero (totales, desglose, tendencia mensual)
 *   GET /api/summary/goals  → vista general de metas activas y completadas
 */

import { summaryService } from "../services/summaryService.js";

/**
 * GET /api/summary
 * Retorna un resumen financiero completo del usuario autenticado.
 *
 * Query params opcionales para filtrar por rango de fechas:
 *   ?start_date=YYYY-MM-DD
 *   ?end_date=YYYY-MM-DD
 *
 * Respuesta:
 * {
 *   totals: { total_income, total_expenses, net_balance },
 *   categoryBreakdown: [ { category_id, category_name, type, total, transaction_count } ],
 *   monthlyTrend:      [ { month, income, expenses } ]
 * }
 *
 * @param {import('express').Request}  req - req.query: start_date, end_date (opcionales).
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export const getSummary = async (req, res, next) => {
    try {
        const data = await summaryService.getSummary(req.user.id, req.query);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/summary/goals
 * Retorna una vista general de las metas de ahorro del usuario.
 *
 * Respuesta:
 * {
 *   summary: { totalGoals, activeGoals, completedGoals, totalTargetAmount, totalSavedAmount },
 *   goals: {
 *     active:    [ { id, title, target_amount, current_amount, progress_percent, ... } ],
 *     completed: [ ... ]
 *   }
 * }
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export const getGoalsOverview = async (req, res, next) => {
    try {
        const data = await summaryService.getGoalsOverview(req.user.id);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
};
