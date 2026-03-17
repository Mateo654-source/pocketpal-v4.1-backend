/**
 * @file src/controllers/authController.js
 * @description Controller HTTP para el recurso /api/auth.
 *
 * Gestiona dos flujos de autenticación:
 *   1. Email / Contraseña: register, login, getMe.
 *   2. Google OAuth 2.0: googleAuth (inicia flujo), googleCallback (procesa respuesta).
 *
 * Responsabilidad única: recibir la petición HTTP, delegar al servicio
 * y formatear la respuesta. Sin lógica de negocio ni SQL aquí.
 */

import passport from "../config/passport.js";
import jwt from "jsonwebtoken";
import { authService } from "../services/authService.js";

// ─── Email / Contraseña ───────────────────────────────────────────────────────

/**
 * POST /api/auth/register
 * Registra un nuevo usuario con nombre, email y contraseña.
 *
 * Body requerido (validado por validate middleware):
 *   { name: string, email: string, password: string }
 *
 * Respuesta 201:
 *   { success: true, data: { user, token } }
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export const register = async (req, res, next) => {
    try {
        const { user, token } = await authService.register(req.body);
        res.status(201).json({
            success: true,
            message: "Cuenta creada",
            data: { user, token },
        });
    } catch (err) {
        next(err);
    }
};

/**
 * POST /api/auth/login
 * Autentica un usuario con email y contraseña.
 *
 * Body requerido (validado por validate middleware):
 *   { email: string, password: string }
 *
 * Respuesta 200:
 *   { success: true, data: { user, token } }
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export const login = async (req, res, next) => {
    try {
        const { user, token } = await authService.login(req.body);
        res.json({
            success: true,
            message: "Sesión iniciada",
            data: { user, token },
        });
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/auth/me
 * Retorna los datos del usuario autenticado (requiere token JWT en header).
 *
 * Respuesta 200:
 *   { success: true, data: { user } }
 *
 * @param {import('express').Request}  req - req.user.id inyectado por protect middleware.
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export const getMe = async (req, res, next) => {
    try {
        const user = await authService.getMe(req.user.id);
        res.json({ success: true, data: { user } });
    } catch (err) {
        next(err);
    }
};

// ─── Google OAuth 2.0 ─────────────────────────────────────────────────────────

/**
 * GET /api/auth/google
 * Inicia el flujo OAuth de Google.
 *
 * Si se recibe ?login_hint=<email>, verifica si el usuario ya tiene token
 * de Google para elegir el prompt apropiado:
 *   - Usuario existente → 'select_account' (login rápido sin re-autorizar).
 *   - Usuario nuevo     → 'consent' (muestra pantalla de permisos de Gmail).
 *
 * Redirige al servidor de autorización de Google.
 *
 * @param {import('express').Request}  req - req.query.login_hint: email opcional.
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export const googleAuth = async (req, res, next) => {
    try {
        const emailHint = req.query.login_hint;

        // Decidir el prompt de Google según si el usuario ya tiene tokens
        const isExistingUser = emailHint
            ? await authService.hasGoogleToken(emailHint)
            : false;

        return passport.authenticate("google", {
            scope: [
                "profile",
                "email",
                "https://www.googleapis.com/auth/gmail.readonly",
            ],
            session: false,
            accessType: "offline", // necesario para obtener refresh_token
            prompt: isExistingUser ? "select_account" : "consent",
        })(req, res, next);
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/auth/google/callback
 * Callback de Google OAuth. Passport verifica el código, crea/actualiza
 * el usuario y pone sus datos en req.user.
 *
 * Flujo:
 *   1. passport.authenticate verifica el código de Google.
 *   2. Si falla → redirige a /frontend/index.html?error=oauth_failed.
 *   3. Si éxito → genera JWT y redirige al dashboard con los datos en query params.
 *
 * NOTA: Los datos (token, name, email, avatar) viajan en la URL para que
 * el frontend los capture y los guarde en localStorage. Esto es aceptable
 * porque es HTTPS y la URL se limpia inmediatamente desde el frontend con
 * window.history.replaceState().
 *
 * @type {Array<import('express').RequestHandler>}
 */
export const googleCallback = [
    // Paso 1: Passport verifica el código y puebla req.user
    passport.authenticate("google", {
        session: false,
        failureRedirect: `${process.env.FRONTEND_URL}/index.html?error=oauth_failed`,
    }),

    // Paso 2: Generar JWT y redirigir al dashboard
    (req, res) => {
        const token = jwt.sign(
            { id: req.user.id, email: req.user.email },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || "7d" },
        );

        // Construir URL de redirección con los datos del usuario
        const redirectUrl = new URL(
            `${process.env.FRONTEND_URL}/dashboard.html`,
        );
        redirectUrl.searchParams.set("token", token);
        redirectUrl.searchParams.set("name", req.user.name ?? "");
        redirectUrl.searchParams.set("email", req.user.email ?? "");
        redirectUrl.searchParams.set("avatar", req.user.avatar ?? "");

        res.redirect(redirectUrl.toString());
    },
];
