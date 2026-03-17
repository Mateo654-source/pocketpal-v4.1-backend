/**
 * @file src/routes/summaryRoutes.js
 * @description Rutas de resúmenes financieros.
 *
 * Todas las rutas requieren autenticación JWT (middleware protect).
 *
 * GET /api/summary       → totales, desglose por categoría, tendencia mensual
 * GET /api/summary/goals → vista general de metas activas y completadas
 */

import { Router } from "express";
import {
    getSummary,
    getGoalsOverview,
} from "../controllers/summaryController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = Router();

// Proteger todas las rutas del módulo con JWT
router.use(protect);

router.get("/", getSummary);
router.get("/goals", getGoalsOverview);

export default router;
