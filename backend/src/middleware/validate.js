/**
 * @file src/middleware/validate.js
 * @description Middleware de validación declarativa para cuerpos de petición HTTP.
 *
 * Cada recurso declara sus reglas una sola vez en el objeto `rules`.
 * Al recibir una petición, validate() ejecuta las reglas y si algo falla
 * lanza ValidationError ANTES de que el controller siquiera se ejecute.
 *
 * Uso en rutas:
 *   router.post('/', validate(rules.transaction.create), createTransaction);
 *
 * Cada regla es una función que recibe el valor del campo y devuelve:
 *   - null       → campo válido
 *   - string     → mensaje de error (campo inválido)
 *
 * Solo se reporta el primer error por campo para no saturar al usuario.
 */

import { ValidationError } from "../errors/AppError.js";

// ─── Motor de reglas ──────────────────────────────────────────────────────────

/**
 * Fábrica de reglas de validación.
 * Cada función `r.xxx()` retorna una función de validación (value) => string|null.
 */
const r = {
    /** Campo requerido: no puede ser undefined, null ni string vacío. */
    required: (field) => (val) =>
        val === undefined || val === null || String(val).trim() === ""
            ? `El campo '${field}' es requerido`
            : null,

    /** Longitud mínima de string. */
    minLength: (field, min) => (val) =>
        val && String(val).trim().length < min
            ? `'${field}' debe tener al menos ${min} caracteres`
            : null,

    /** Longitud máxima de string. */
    maxLength: (field, max) => (val) =>
        val && String(val).trim().length > max
            ? `'${field}' no puede exceder ${max} caracteres`
            : null,

    /** Formato de email básico. */
    isEmail: (field) => (val) =>
        val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)
            ? `'${field}' debe ser un correo válido`
            : null,

    /** Número positivo (> 0). */
    isPositiveNumber: (field) => (val) =>
        val !== undefined &&
        val !== null &&
        val !== "" &&
        (isNaN(val) || parseFloat(val) <= 0)
            ? `'${field}' debe ser un número positivo`
            : null,

    /** Valor dentro de una lista de opciones permitidas. */
    isOneOf: (field, options) => (val) =>
        val && !options.includes(val)
            ? `'${field}' debe ser uno de: ${options.join(", ")}`
            : null,

    /** Fecha válida en formato YYYY-MM-DD. */
    isDate: (field) => (val) =>
        val && isNaN(Date.parse(val))
            ? `'${field}' debe ser una fecha válida (YYYY-MM-DD)`
            : null,

    /** Número entero (sin decimales). */
    isInteger: (field) => (val) =>
        val !== undefined &&
        val !== null &&
        val !== "" &&
        !Number.isInteger(Number(val))
            ? `'${field}' debe ser un número entero`
            : null,
};

// ─── Reglas por recurso ───────────────────────────────────────────────────────

export const rules = {
    /** Reglas para endpoints de autenticación */
    auth: {
        register: {
            name: [
                r.required("nombre"),
                r.minLength("nombre", 2),
                r.maxLength("nombre", 100),
            ],
            email: [r.required("email"), r.isEmail("email")],
            password: [r.required("contraseña"), r.minLength("contraseña", 6)],
        },
        login: {
            email: [r.required("email"), r.isEmail("email")],
            password: [r.required("contraseña")],
        },
    },

    /** Reglas para transacciones */
    transaction: {
        create: {
            type: [
                r.required("type"),
                r.isOneOf("type", ["income", "expense"]),
            ],
            amount: [r.required("amount"), r.isPositiveNumber("amount")],
            category_id: [
                r.required("category_id"),
                r.isInteger("category_id"),
            ],
            date: [r.isDate("date")], // opcional
            description: [r.maxLength("description", 500)], // opcional
        },
        update: {
            type: [
                r.required("type"),
                r.isOneOf("type", ["income", "expense"]),
            ],
            amount: [r.required("amount"), r.isPositiveNumber("amount")],
            category_id: [
                r.required("category_id"),
                r.isInteger("category_id"),
            ],
            date: [r.required("date"), r.isDate("date")],
            description: [r.maxLength("description", 500)],
        },
    },

    /** Reglas para categorías */
    category: {
        create: {
            name: [
                r.required("name"),
                r.minLength("name", 1),
                r.maxLength("name", 100),
            ],
            type: [
                r.required("type"),
                r.isOneOf("type", ["income", "expense"]),
            ],
        },
        update: {
            name: [
                r.required("name"),
                r.minLength("name", 1),
                r.maxLength("name", 100),
            ],
            type: [
                r.required("type"),
                r.isOneOf("type", ["income", "expense"]),
            ],
        },
    },

    /** Reglas para metas de ahorro */
    goal: {
        create: {
            title: [
                r.required("title"),
                r.minLength("title", 1),
                r.maxLength("title", 200),
            ],
            target_amount: [
                r.required("target_amount"),
                r.isPositiveNumber("target_amount"),
            ],
        },
        update: {
            title: [
                r.required("title"),
                r.minLength("title", 1),
                r.maxLength("title", 200),
            ],
            target_amount: [
                r.required("target_amount"),
                r.isPositiveNumber("target_amount"),
            ],
        },
        allocate: {
            amount: [r.required("amount"), r.isPositiveNumber("amount")],
        },
    },

    /** Reglas para el agente IA */
    ai: {
        chat: {
            message: [
                r.required("message"),
                r.minLength("message", 1),
                r.maxLength("message", 2000),
            ],
        },
    },
};

// ─── Middleware factory ───────────────────────────────────────────────────────

/**
 * Crea un middleware de validación a partir de un conjunto de reglas.
 * Si algún campo no supera sus reglas, lanza ValidationError con la lista de errores.
 *
 * @param {Object.<string, Function[]>} fieldRules - Mapa de campo → array de reglas.
 * @returns {import('express').RequestHandler} Middleware de Express.
 *
 * @example
 * router.post('/', validate(rules.transaction.create), createTransaction);
 */
export const validate = (fieldRules) => (req, res, next) => {
    const errors = [];

    for (const [field, fieldRuleList] of Object.entries(fieldRules)) {
        const value = req.body[field];

        for (const rule of fieldRuleList) {
            const error = rule(value, req.body);
            if (error) {
                errors.push(error);
                break; // Solo reportar el primer error por campo
            }
        }
    }

    if (errors.length > 0) {
        return next(new ValidationError(errors));
    }

    next();
};
