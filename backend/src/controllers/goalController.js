/**
 * @file src/controllers/goalController.js
 * @description Controller HTTP para el recurso /api/goals.
 *
 * Responsabilidad única: recibir la petición HTTP, delegar al goalService
 * y formatear la respuesta JSON. Cero lógica de negocio aquí.
 *
 * Rutas soportadas (todas requieren token JWT válido via protect):
 *   GET    /api/goals                          → listar metas del usuario
 *   GET    /api/goals/:id                      → obtener meta con aportes
 *   POST   /api/goals                          → crear nueva meta
 *   PUT    /api/goals/:id                      → actualizar título o monto objetivo
 *   DELETE /api/goals/:id                      → eliminar meta y sus aportes
 *   POST   /api/goals/:goalId/contribute       → registrar un aporte a la meta
 *   POST   /api/goals/:goalId/complete         → registrar decisión final al completar
 */

import { goalService } from "../services/goalService.js";

/**
 * GET /api/goals
 * Lista todas las metas del usuario autenticado.
 * Incluye porcentaje de progreso calculado en el servidor.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export const getGoals = async (req, res, next) => {
    try {
        const goals = await goalService.list(req.user.id);
        res.json({ success: true, data: { goals } });
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/goals/:id
 * Retorna una meta por ID junto con su historial de aportes.
 *
 * @param {import('express').Request}  req - req.params.id: ID de la meta.
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export const getGoalById = async (req, res, next) => {
    try {
        const data = await goalService.getById(req.params.id, req.user.id);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
};

/**
 * POST /api/goals
 * Crea una nueva meta de ahorro.
 *
 * Body requerido (validado por validate middleware):
 *   { title: string, target_amount: number }
 *
 * @param {import('express').Request}  req - req.body: { title, target_amount }.
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export const createGoal = async (req, res, next) => {
    try {
        const goal = await goalService.create(req.user.id, req.body);
        res.status(201).json({
            success: true,
            message: "Meta creada",
            data: { goal },
        });
    } catch (err) {
        next(err);
    }
};

/**
 * PUT /api/goals/:id
 * Actualiza el título o monto objetivo de una meta.
 * No permite reducir el objetivo por debajo del monto ya ahorrado.
 *
 * Body requerido (validado por validate middleware):
 *   { title: string, target_amount: number }
 *
 * @param {import('express').Request}  req - req.params.id, req.body.
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export const updateGoal = async (req, res, next) => {
    try {
        const goal = await goalService.update(
            req.params.id,
            req.user.id,
            req.body,
        );
        res.json({
            success: true,
            message: "Meta actualizada",
            data: { goal },
        });
    } catch (err) {
        next(err);
    }
};

/**
 * DELETE /api/goals/:id
 * Elimina una meta y todos sus aportes asociados.
 *
 * @param {import('express').Request}  req - req.params.id: ID de la meta.
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export const deleteGoal = async (req, res, next) => {
    try {
        await goalService.delete(req.params.id, req.user.id);
        res.json({ success: true, message: "Meta eliminada" });
    } catch (err) {
        next(err);
    }
};

/**
 * POST /api/goals/:goalId/contribute
 * Registra un aporte (abono) a una meta de ahorro.
 *
 * Internamente (en goalService.allocate):
 *   1. Incrementa current_amount de la meta.
 *   2. Marca como completada si se alcanza el objetivo.
 *   3. Crea una transacción de tipo 'saving'.
 *   4. Registra en goal_allocations.
 *
 * Body requerido:
 *   { amount: number }
 *
 * Respuesta cuando la meta se completa:
 *   { data: { completed: true, goalId, title, targetAmount } }
 *
 * @param {import('express').Request}  req - req.params.goalId, req.body.amount.
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export const addContribution = async (req, res, next) => {
    try {
        const result = await goalService.allocate(
            req.params.goalId,
            req.user.id,
            req.body.amount,
        );

        // La meta se completó con este aporte
        if (result.justCompleted) {
            return res.json({
                success: true,
                message: "¡Meta completada!",
                data: {
                    completed: true,
                    goalId: req.params.goalId,
                    title: result.goal.title,
                    targetAmount: result.goal.target_amount,
                },
            });
        }

        // Aporte normal sin completar la meta
        res.json({
            success: true,
            message: "Aporte registrado",
            data: {
                completed: false,
                newAmount: result.goal.current_amount,
                allocation: result.allocation,
            },
        });
    } catch (err) {
        next(err);
    }
};

/**
 * POST /api/goals/:goalId/complete
 * Registra la decisión final del usuario cuando una meta se completa.
 * El dinero ya salió del balance con los aportes; este endpoint solo
 * guarda el tipo de decisión para registro histórico.
 *
 * Body requerido:
 *   { completionType: string } — ej: 'saving', 'spend', etc.
 *
 * @param {import('express').Request}  req - req.params.goalId, req.body.completionType.
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export const completeGoal = async (req, res, next) => {
    try {
        const result = await goalService.completeGoal(
            req.params.goalId,
            req.user.id,
            req.body.completionType,
        );
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};
