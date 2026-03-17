/**
 * @file src/routes/authRoutes.js
 * @description Rutas de autenticación en /api/auth.
 *
 * Rutas públicas (sin protect):
 *   POST /register  → registro con email/contraseña
 *   POST /login     → login con email/contraseña
 *   GET  /google    → inicio del flujo OAuth de Google
 *   GET  /google/callback → callback de Google
 *
 * Rutas protegidas:
 *   GET  /me        → datos del usuario autenticado
 */

import { Router } from "express";
import {
    register,
    login,
    getMe,
    googleAuth,
    googleCallback,
} from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";
import { validate, rules } from "../middleware/validate.js";

const router = Router();

// Email / Contraseña — las rutas de login/register tienen su propio rate limiter en app.js
router.post("/register", validate(rules.auth.register), register);
router.post("/login", validate(rules.auth.login), login);
router.get("/me", protect, getMe);

// Google OAuth 2.0
router.get("/google", googleAuth);
router.get("/google/callback", googleCallback);

export default router;
