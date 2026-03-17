/**
 * @file src/middleware/rateLimiter.js
 * @description Rate limiters para proteger la API contra abuso.
 *
 * Usa express-rate-limit con almacenamiento en memoria (suficiente para un
 * solo proceso). Si la app escala a múltiples instancias, cambiar el store
 * por RedisStore de @express-rate-limit/redis.
 *
 * Tres niveles de limitación:
 *   - apiLimiter:  límite general para toda la API (200 req / 15 min).
 *   - authLimiter: límite estricto para login/register (10 req / 15 min).
 *   - aiLimiter:   límite para el agente IA (30 req / hora) — cada llamada usa tokens de OpenAI.
 */

import rateLimit from "express-rate-limit";

/**
 * Manejador de respuesta cuando se supera el límite.
 * Se reutiliza en todos los limitadores para respuesta uniforme.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 */
const limitExceededHandler = (req, res) => {
    res.status(429).json({
        success: false,
        code: "RATE_LIMIT_EXCEEDED",
        message:
            "Demasiadas peticiones. Por favor espera un momento antes de reintentar.",
        retryAfter: res.getHeader("Retry-After"),
    });
};

/**
 * Límite general de la API.
 * 200 peticiones por IP cada 15 minutos.
 * Protege contra scraping y fuerza bruta básica.
 */
export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 200,
    standardHeaders: true, // incluye headers RateLimit-* en la respuesta
    legacyHeaders: false,
    handler: limitExceededHandler,
});

/**
 * Límite para autenticación.
 * 10 intentos por IP cada 15 minutos.
 * Previene ataques de fuerza bruta al login y registro.
 */
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: limitExceededHandler,
});

/**
 * Límite para el agente IA.
 * 30 mensajes por IP por hora.
 * Ajustar según el presupuesto de OpenAI disponible.
 */
export const aiLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hora
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        res.status(429).json({
            success: false,
            code: "AI_RATE_LIMIT_EXCEEDED",
            message:
                "Has alcanzado el límite de mensajes al agente IA por hora. Intenta más tarde.",
            retryAfter: res.getHeader("Retry-After"),
        });
    },
});
