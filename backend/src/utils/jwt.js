/**
 * @file src/utils/jwt.js
 * @description Utilidades para generación y verificación de JWT (JSON Web Tokens).
 *
 * Los tokens JWT se usan para autenticación stateless:
 *   1. El usuario hace login → se genera un token con { id, email }.
 *   2. El cliente lo guarda en localStorage y lo envía en cada request.
 *   3. El backend verifica el token con verifyToken() en el middleware protect.
 *
 * Variables de entorno requeridas:
 *   JWT_SECRET    → string largo y aleatorio (mínimo 32 chars)
 *   JWT_EXPIRES_IN → ej: '7d', '24h', '30d'
 */

import jwt from "jsonwebtoken";

/** Clave secreta para firmar y verificar tokens. Leída del .env. */
const JWT_SECRET = process.env.JWT_SECRET;

/** Tiempo de expiración del token. Defecto: 7 días. */
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

/**
 * Genera un JWT firmado con el payload del usuario.
 *
 * @param {object} payload - Datos a codificar en el token (ej: { id, email }).
 * @returns {string} Token JWT firmado.
 *
 * @example
 * const token = generateToken({ id: 1, email: 'user@example.com' });
 */
export const generateToken = (payload) => {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

/**
 * Verifica y decodifica un JWT.
 * Lanza un error si el token es inválido, fue alterado o está expirado.
 * El errorHandler de Express captura estos errores y responde 401.
 *
 * @param {string} token - Token JWT a verificar.
 * @returns {object} Payload decodificado del token (ej: { id, email, iat, exp }).
 * @throws {JsonWebTokenError}  Si el token tiene firma inválida.
 * @throws {TokenExpiredError}  Si el token ha expirado.
 *
 * @example
 * const decoded = verifyToken(token);
 * console.log(decoded.id); // ID del usuario
 */
export const verifyToken = (token) => {
    return jwt.verify(token, JWT_SECRET);
};
