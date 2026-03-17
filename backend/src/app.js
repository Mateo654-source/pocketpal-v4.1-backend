/**
 * @file src/app.js
 * @description Configuración principal de la aplicación Express.
 *
 * Registra en orden:
 *   1. Middleware de seguridad (helmet, cors).
 *   2. Body parsing (JSON).
 *   3. Passport (OAuth 2.0 con Google).
 *   4. Rate limiters.
 *   5. Archivos estáticos (frontend).
 *   6. Health check.
 *   7. Rutas de la API.
 *   8. Fallback SPA y 404 para rutas desconocidas.
 *   9. Error handler centralizado (SIEMPRE al final).
 */

import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import { fileURLToPath } from "url";

import passport from "./config/passport.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { apiLimiter, authLimiter } from "./middleware/rateLimiter.js";
import authRoutes from "./routes/authRoutes.js";
import transactionRoutes from "./routes/transactionRoutes.js";
import categoryRoutes from "./routes/categoryRoutes.js";
import goalRoutes from "./routes/goalRoutes.js";
import summaryRoutes from "./routes/summaryRoutes.js";
import aiRoutes from "./routes/aiRoutes.js";
import gmailRoutes from "./routes/gmailRoutes.js";

// __dirname no existe en ES Modules, se reconstruye así
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();

// ─── Seguridad ─────────────────────────────────────────────────────────────────
// helmet añade headers de seguridad HTTP (XSS, HSTS, etc.)
// contentSecurityPolicy: false porque el frontend usa CDN de Tailwind y Fonts
app.use(helmet({ contentSecurityPolicy: false }));

// CORS: permite peticiones del frontend
app.use(
    cors({
        origin: process.env.CORS_ORIGIN?.split(",") || "http://127.0.0.1:3000",
        credentials: true,
    }),
);

// ─── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: "1mb" }));

// ─── Passport OAuth ────────────────────────────────────────────────────────────
// passport.initialize() sin sesiones (usamos JWT, no cookies de sesión)
app.use(passport.initialize());

// ─── Rate limiting ─────────────────────────────────────────────────────────────
app.use("/api", apiLimiter); // límite general para toda la API
app.use("/api/auth/login", authLimiter); // protege contra fuerza bruta
app.use("/api/auth/register", authLimiter);

// ─── Archivos estáticos del frontend ──────────────────────────────────────────
// app.use(express.static(path.join(__dirname, "..", "frontend")));

// ─── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (req, res) =>
    res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        env: process.env.NODE_ENV || "development",
    }),
);

// ─── Rutas de la API ───────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/goals", goalRoutes);
app.use("/api/summary", summaryRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/gmail", gmailRoutes);

// ─── SPA fallback ──────────────────────────────────────────────────────────────
// Rutas que no empiezan con /api → servir el index.html del frontend (SPA)
// app.get(/^(?!\/api).*/, (req, res) => {
//     res.sendFile(path.join(__dirname, "..", "frontend", "index.html"));
// });

// ─── 404 para rutas API no encontradas ────────────────────────────────────────
app.use("/api/*path", (req, res) => {
    res.status(404).json({
        success: false,
        code: "NOT_FOUND",
        message: `Ruta ${req.method} ${req.originalUrl} no encontrada`,
    });
});

// ─── Error handler centralizado ────────────────────────────────────────────────
// SIEMPRE al final: Express lo reconoce por tener 4 parámetros (err, req, res, next)
app.use(errorHandler);
