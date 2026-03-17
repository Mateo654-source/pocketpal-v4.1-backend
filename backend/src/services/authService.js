/**
 * @file src/services/authService.js
 * @description Servicio de autenticación de usuarios.
 *
 * Gestiona dos flujos de autenticación:
 *   1. Email / Contraseña: register, login, getMe.
 *   2. Google OAuth: hasGoogleToken (utilidad para passport.js).
 *
 * Las contraseñas NUNCA se almacenan en texto plano — se usa bcrypt con
 * 10 salt rounds (ver utils/hash.js). Los tokens JWT se generan con
 * payload { id, email } y expiran según JWT_EXPIRES_IN del .env.
 */

import { pool } from "../config/db.js";
import { hashPassword, comparePassword } from "../utils/hash.js";
import { generateToken } from "../utils/jwt.js";
import {
    ConflictError,
    UnauthorizedError,
    NotFoundError,
} from "../errors/AppError.js";

export const authService = {
    /**
     * Registra un nuevo usuario con email y contraseña.
     *
     * @param {object} data
     * @param {string} data.name     - Nombre completo del usuario.
     * @param {string} data.email    - Correo electrónico (se normaliza a minúsculas).
     * @param {string} data.password - Contraseña en texto plano (mínimo 6 caracteres).
     * @returns {Promise<{user: object, token: string}>}
     * @throws {ConflictError} Si el email ya está registrado.
     */
    async register({ name, email, password }) {
        const normalizedEmail = email.toLowerCase().trim();

        // Verificar que el email no esté en uso
        const [existing] = await pool.execute(
            "SELECT id FROM users WHERE email = ?",
            [normalizedEmail],
        );
        if (existing.length > 0)
            throw new ConflictError(
                "Ya existe una cuenta con ese correo",
                "EMAIL_TAKEN",
            );

        const passwordHash = await hashPassword(password);

        const [result] = await pool.execute(
            "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
            [name.trim(), normalizedEmail, passwordHash],
        );

        // Devolver solo campos seguros (sin password_hash)
        const [[user]] = await pool.execute(
            "SELECT id, name, email, created_at FROM users WHERE id = ?",
            [result.insertId],
        );

        const token = generateToken({ id: user.id, email: user.email });
        return { user, token };
    },

    /**
     * Autentica un usuario con email y contraseña.
     * Detecta el caso especial de un usuario que se registró solo con Google
     * (no tiene password_hash) y devuelve un error descriptivo.
     *
     * @param {object} data
     * @param {string} data.email    - Correo electrónico.
     * @param {string} data.password - Contraseña en texto plano.
     * @returns {Promise<{user: object, token: string}>}
     * @throws {UnauthorizedError} Si las credenciales son incorrectas.
     */
    async login({ email, password }) {
        const normalizedEmail = email.toLowerCase().trim();

        const [rows] = await pool.execute(
            "SELECT id, name, email, password_hash, avatar, created_at FROM users WHERE email = ?",
            [normalizedEmail],
        );

        const user = rows[0];

        // Caso especial: usuario existe pero fue creado con Google (sin contraseña)
        if (user && !user.password_hash) {
            throw new UnauthorizedError(
                'Esta cuenta fue creada con Google. Usa el botón "Continuar con Google".',
                "USE_GOOGLE_LOGIN",
            );
        }

        // Credenciales incorrectas o usuario no existe
        if (!user || !(await comparePassword(password, user.password_hash))) {
            throw new UnauthorizedError(
                "Correo o contraseña incorrectos",
                "INVALID_CREDENTIALS",
            );
        }

        // Excluir password_hash de la respuesta
        const { password_hash, ...safeUser } = user;
        const token = generateToken({ id: user.id, email: user.email });
        return { user: safeUser, token };
    },

    /**
     * Obtiene los datos del usuario autenticado (perfil público).
     *
     * @param {number} userId - ID del usuario autenticado (de req.user.id).
     * @returns {Promise<object>} Datos del usuario sin password_hash.
     * @throws {NotFoundError} Si el usuario no existe en la base de datos.
     */
    async getMe(userId) {
        const [[user]] = await pool.execute(
            "SELECT id, name, email, avatar, created_at FROM users WHERE id = ?",
            [userId],
        );
        if (!user) throw new NotFoundError("Usuario", "USER_NOT_FOUND");
        return user;
    },

    /**
     * Verifica si un usuario con ese email ya tiene un google_refresh_token almacenado.
     * Usado por el controlador de OAuth para elegir el prompt correcto:
     *   - Con token (usuario existente) → prompt 'select_account' (selección rápida).
     *   - Sin token (usuario nuevo)     → prompt 'consent' (autorizar Gmail).
     *
     * @param {string} email - Correo electrónico a verificar.
     * @returns {Promise<boolean>} true si el usuario ya tiene refresh token de Google.
     */
    async hasGoogleToken(email) {
        const [rows] = await pool.execute(
            "SELECT google_refresh_token FROM users WHERE email = ?",
            [email.toLowerCase().trim()],
        );
        return rows.length > 0 && !!rows[0].google_refresh_token;
    },
};
