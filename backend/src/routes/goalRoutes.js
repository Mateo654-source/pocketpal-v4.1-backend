/**
 * @file src/routes/goalRoutes.js
 * @description Rutas del recurso /api/goals.
 *
 * Incluye rutas de aportes (contribute) y decisión final (complete).
 * Todas las rutas requieren autenticación JWT.
 */

import { Router } from "express";
import {
    getGoals,
    getGoalById,
    createGoal,
    updateGoal,
    deleteGoal,
    addContribution,
    completeGoal,
} from "../controllers/goalController.js";
import { validate, rules } from "../middleware/validate.js";
import { protect } from "../middleware/authMiddleware.js";

const router = Router();

// Proteger todas las rutas del módulo con JWT
router.use(protect);

// CRUD básico de metas
router.get("/", getGoals);
router.get("/:id", getGoalById);
router.post("/", validate(rules.goal.create), createGoal);
router.put("/:id", validate(rules.goal.update), updateGoal);
router.delete("/:id", deleteGoal);

// Aportes a metas (descuenta del balance del usuario)
router.post("/:goalId/contribute", addContribution);

// Decisión final cuando la meta se completa
router.post("/:goalId/complete", completeGoal);

export default router;
