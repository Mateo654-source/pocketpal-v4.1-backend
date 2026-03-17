/**
 * @file src/errors/AppError.js
 * @description Jerarquía de errores operacionales de la aplicación.
 *
 * La separación entre errores operacionales y errores de programación es clave:
 *
 *   - isOperational = true  → error esperado (validación, not found, credenciales
 *     incorrectas). El errorHandler responde con el mensaje al cliente.
 *
 *   - isOperational = false (Error estándar) → bug real. El errorHandler
 *     oculta los detalles en producción y solo loguea el stack trace.
 *
 * Flujo:
 *   Servicio lanza AppError → controller llama next(err) → errorHandler
 *   captura y convierte a respuesta JSON uniforme.
 *
 * Uso en servicios:
 *   throw new NotFoundError('Transacción', 'TRANSACTION_NOT_FOUND');
 *   throw new ConflictError('El email ya existe', 'EMAIL_TAKEN');
 */

/**
 * Clase base para todos los errores operacionales de la aplicación.
 * Extiende Error nativo para compatibilidad con instanceof y stack traces.
 */
export class AppError extends Error {
    /**
     * @param {string} message    - Mensaje legible para el cliente.
     * @param {number} statusCode - Código HTTP de respuesta (400, 401, 403, 404, 409, 500…).
     * @param {string} [code]     - Código interno para el frontend (ej: 'CATEGORY_NOT_FOUND').
     */
    constructor(message, statusCode, code = null) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.isOperational = true; // Error esperado, no un bug

        // Preserva el stack trace limpiamente (excluye el constructor de la pila)
        Error.captureStackTrace(this, this.constructor);
    }
}

// ─── Subclases semánticas ─────────────────────────────────────────────────────
// Usar estas subclases en los servicios para mayor claridad del código.
// El errorHandler solo necesita verificar instanceof AppError.

/**
 * 400 Bad Request — El cliente envió datos inválidos o mal formados.
 * @extends AppError
 */
export class BadRequestError extends AppError {
    /** @param {string} message @param {string} [code='BAD_REQUEST'] */
    constructor(message, code = "BAD_REQUEST") {
        super(message, 400, code);
    }
}

/**
 * 401 Unauthorized — El cliente no está autenticado o sus credenciales son incorrectas.
 * @extends AppError
 */
export class UnauthorizedError extends AppError {
    /** @param {string} [message='No autorizado'] @param {string} [code='UNAUTHORIZED'] */
    constructor(message = "No autorizado", code = "UNAUTHORIZED") {
        super(message, 401, code);
    }
}

/**
 * 403 Forbidden — El cliente está autenticado pero no tiene permiso para la acción.
 * @extends AppError
 */
export class ForbiddenError extends AppError {
    /** @param {string} [message='Acceso denegado'] @param {string} [code='FORBIDDEN'] */
    constructor(message = "Acceso denegado", code = "FORBIDDEN") {
        super(message, 403, code);
    }
}

/**
 * 404 Not Found — El recurso solicitado no existe o no pertenece al usuario.
 * @extends AppError
 *
 * @example
 * throw new NotFoundError('Transacción', 'TRANSACTION_NOT_FOUND');
 * // Mensaje: "Transacción no encontrado"
 */
export class NotFoundError extends AppError {
    /** @param {string} [resource='Recurso'] @param {string} [code='NOT_FOUND'] */
    constructor(resource = "Recurso", code = "NOT_FOUND") {
        super(`${resource} no encontrado`, 404, code);
    }
}

/**
 * 409 Conflict — El recurso ya existe o hay un conflicto de estado.
 * @extends AppError
 *
 * @example
 * throw new ConflictError('Ya existe una cuenta con ese correo', 'EMAIL_TAKEN');
 */
export class ConflictError extends AppError {
    /** @param {string} message @param {string} [code='CONFLICT'] */
    constructor(message, code = "CONFLICT") {
        super(message, 409, code);
    }
}

/**
 * 400 Validation Error — Los datos de la petición no superan las reglas de validación.
 * Incluye una lista de errores para mostrar al usuario.
 * @extends AppError
 *
 * @example
 * throw new ValidationError(['El email es requerido', 'La contraseña es muy corta']);
 */
export class ValidationError extends AppError {
    /**
     * @param {string|string[]} errors - Uno o varios mensajes de error de validación.
     */
    constructor(errors) {
        const message = Array.isArray(errors) ? errors[0] : errors;
        super(message, 400, "VALIDATION_ERROR");
        /** @type {string[]} Lista completa de errores de validación */
        this.errors = Array.isArray(errors) ? errors : [errors];
    }
}
