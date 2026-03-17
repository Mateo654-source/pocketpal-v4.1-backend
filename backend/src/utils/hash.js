/**
 * @file src/utils/hash.js
 * @description Utilidades para hash y comparación de contraseñas con bcrypt.
 *
 * Las contraseñas NUNCA se almacenan en texto plano.
 * bcrypt genera automáticamente un salt único por contraseña,
 * lo que protege contra ataques de rainbow table.
 *
 * Salt rounds = 10: es el balance recomendado entre seguridad y rendimiento.
 *   - < 10: más rápido pero menos seguro
 *   - > 12: más seguro pero puede ralentizar el login (> 1 segundo)
 */

import bcrypt from "bcryptjs";

/** Número de rondas de hashing. A mayor número, más seguro pero más lento. */
const SALT_ROUNDS = 10;

/**
 * Genera el hash bcrypt de una contraseña en texto plano.
 *
 * @param {string} password - Contraseña en texto plano del usuario.
 * @returns {Promise<string>} Hash bcrypt de la contraseña.
 *
 * @example
 * const hash = await hashPassword('miContraseña123');
 * // Resultado: '$2a$10$...' (string de 60 chars)
 */
export const hashPassword = async (password) => {
    return bcrypt.hash(password, SALT_ROUNDS);
};

/**
 * Compara una contraseña en texto plano con un hash bcrypt almacenado.
 * Es resistente a ataques de timing (tiempo constante de comparación).
 *
 * @param {string} password - Contraseña ingresada por el usuario.
 * @param {string} hash     - Hash bcrypt almacenado en la base de datos.
 * @returns {Promise<boolean>} true si coinciden, false si no.
 *
 * @example
 * const isMatch = await comparePassword('miContraseña123', storedHash);
 * if (!isMatch) throw new UnauthorizedError('Contraseña incorrecta');
 */
export const comparePassword = async (password, hash) => {
    return bcrypt.compare(password, hash);
};
