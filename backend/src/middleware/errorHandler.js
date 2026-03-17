/**
 * @file src/middleware/errorHandler.js
 * @description Middleware centralizado de manejo de errores.
 *
 * Recibe TODOS los errores de la aplicación que se pasan con next(err) o
 * que se lanzan en async handlers. Express lo identifica por los 4 parámetros.
 *
 * DEBE registrarse AL FINAL en app.js, después de todas las rutas.
 *
 * Jerarquía de captura:
 *   1. Errores de MySQL (codes ER_*) → transformar a AppError legible.
 *   2. ValidationError (con lista errors[]) → incluir todos los mensajes.
 *   3. AppError operacional → responder con statusCode y mensaje.
 *   4. Errores JWT → 401 con mensaje claro.
 *   5. JSON malformado → 400.
 *   6. Error inesperado (bug) → 500, detalles solo en desarrollo.
 */

import { AppError, ValidationError } from "../errors/AppError.js";

/**
 * Transforma errores específicos de MySQL en AppErrors con mensajes legibles.
 * Los códigos de error de MySQL son constantes que empiezan con "ER_".
 *
 * @param {Error} err - Error original de mysql2.
 * @returns {AppError|null} AppError si fue un error conocido de MySQL, null si no.
 */
export const handleDbError = (err) => {
    // ER_DUP_ENTRY: intento de insertar un valor duplicado en columna UNIQUE
    if (err.code === "ER_DUP_ENTRY") {
        const field = err.message.match(/for key '(.+?)'/)?.[1] || "campo";
        return new AppError(
            `Ya existe un registro con ese valor (${field})`,
            409,
            "DUPLICATE_ENTRY",
        );
    }
    // ER_NO_REFERENCED_ROW_2: foreign key apunta a un ID que no existe
    if (err.code === "ER_NO_REFERENCED_ROW_2") {
        return new AppError(
            "Referencia a un recurso que no existe",
            400,
            "INVALID_REFERENCE",
        );
    }
    // ER_ROW_IS_REFERENCED_2: no se puede borrar porque otros registros dependen de este
    if (err.code === "ER_ROW_IS_REFERENCED_2") {
        return new AppError(
            "No se puede eliminar porque otros registros dependen de este",
            409,
            "REFERENCED_ROW",
        );
    }
    // ER_CHECK_CONSTRAINT_VIOLATED: valor fuera del rango del CHECK constraint (MySQL 8.0.16+)
    if (err.code === "ER_CHECK_CONSTRAINT_VIOLATED") {
        return new AppError(
            "Valor fuera del rango permitido",
            400,
            "CHECK_VIOLATION",
        );
    }
    return null;
};

/**
 * Middleware de error centralizado de Express.
 * Recibe cualquier error lanzado con next(err) en las rutas.
 *
 * @param {Error}                      err  - Error capturado.
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next - Requerido por Express aunque no se use.
 */
export const errorHandler = (err, req, res, next) => {
    // 1. Transformar errores de MySQL
    const dbError = err.code && handleDbError(err);
    if (dbError) {
        return res.status(dbError.statusCode).json({
            success: false,
            code: dbError.code,
            message: dbError.message,
        });
    }

    // 2. Error de validación con lista de errores
    if (err instanceof ValidationError && err.errors) {
        return res.status(400).json({
            success: false,
            code: "VALIDATION_ERROR",
            message: err.message,
            errors: err.errors,
        });
    }

    // 3. Error operacional conocido (AppError y subclases)
    if (err instanceof AppError && err.isOperational) {
        return res.status(err.statusCode).json({
            success: false,
            code: err.code,
            message: err.message,
        });
    }

    // 4. Errores de JWT (jsonwebtoken lanza sus propios tipos de error)
    if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
        return res.status(401).json({
            success: false,
            code: "INVALID_TOKEN",
            message: "Token inválido o expirado. Inicia sesión de nuevo.",
        });
    }

    // 5. JSON malformado en el body de la petición
    if (err instanceof SyntaxError && err.status === 400) {
        return res.status(400).json({
            success: false,
            code: "INVALID_JSON",
            message: "El cuerpo de la petición no es JSON válido",
        });
    }

    // 6. Error inesperado (bug real) — loguear siempre, exponer detalles solo en dev
    const isDev = process.env.NODE_ENV === "development";
    console.error("💥 Error inesperado:", {
        message: err.message,
        stack: err.stack,
        url: req.originalUrl,
        method: req.method,
        userId: req.user?.id,
    });

    return res.status(500).json({
        success: false,
        code: "INTERNAL_ERROR",
        message: "Error interno del servidor",
        ...(isDev && { detail: err.message, stack: err.stack }),
    });
};
