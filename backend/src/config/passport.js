/**
 * @file src/config/passport.js
 * @description Configuración de Passport.js con Google OAuth 2.0.
 *
 * Implementa la estrategia GoogleStrategy que maneja 3 casos:
 *   1. Usuario ya existe por google_id → actualizar tokens y hacer login.
 *   2. Usuario existe por email (cuenta email/password) → vincular Google a la cuenta.
 *   3. Usuario no existe → crear nueva cuenta con los datos de Google.
 *
 * Los tokens de Google se guardan para usar la Gmail API (sincronización).
 * En todos los casos se agrega el flag isNewUser para que el controller
 * pueda distinguir registro vs login en la redirección final.
 *
 * Nota: Se usa session: false porque la autenticación es stateless con JWT.
 */

import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { pool } from "./db.js";

passport.use(
  new GoogleStrategy(
    {
      clientID:     process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL:  process.env.GOOGLE_CALLBACK_URL || "http://localhost:3000/api/auth/google/callback",
    },
    /**
     * Función verify de Passport. Se llama con los datos de Google tras autenticación.
     *
     * @param {string}   accessToken  - Token de acceso de Google (de corta duración).
     * @param {string}   refreshToken - Token de actualización (de larga duración, puede ser null en re-logins).
     * @param {object}   profile      - Perfil del usuario de Google.
     * @param {Function} done         - Callback de Passport: done(error, user).
     */
    async (accessToken, refreshToken, profile, done) => {
      try {
        const googleId = profile.id;
        const email    = profile.emails?.[0]?.value;
        const name     = profile.displayName;
        const avatar   = profile.photos?.[0]?.value || null;

        if (!email) {
          return done(new Error("No se pudo obtener el email de Google"), null);
        }

        // ── Caso 1: Usuario ya existe por google_id → es un login ────────────
        const [byGoogleId] = await pool.execute(
          "SELECT * FROM users WHERE google_id = ?",
          [googleId],
        );

        if (byGoogleId.length > 0) {
          const existingUser = byGoogleId[0];
          // Actualizar access_token y preservar refresh_token si Google no lo reenvió
          await pool.execute(
            `UPDATE users
             SET google_access_token = ?, google_refresh_token = ?
             WHERE id = ?`,
            [
              accessToken,
              refreshToken ?? existingUser.google_refresh_token, // conservar si es null
              existingUser.id,
            ],
          );
          return done(null, { ...existingUser, isNewUser: false });
        }

        // ── Caso 2: Usuario existe por email → vincular google_id ─────────────
        const [byEmail] = await pool.execute(
          "SELECT * FROM users WHERE email = ?",
          [email],
        );

        if (byEmail.length > 0) {
          const existingUser = byEmail[0];
          await pool.execute(
            `UPDATE users
             SET google_id = ?, avatar = ?, google_access_token = ?, google_refresh_token = ?
             WHERE id = ?`,
            [googleId, avatar, accessToken, refreshToken, existingUser.id],
          );
          return done(null, { ...existingUser, isNewUser: false });
        }

        // ── Caso 3: Usuario nuevo → crear cuenta ──────────────────────────────
        const [result] = await pool.execute(
          `INSERT INTO users (name, email, google_id, avatar, google_access_token, google_refresh_token)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [name, email, googleId, avatar, accessToken, refreshToken],
        );

        const [[newUser]] = await pool.execute(
          "SELECT * FROM users WHERE id = ?",
          [result.insertId],
        );

        return done(null, { ...newUser, isNewUser: true });

      } catch (error) {
        console.error("❌ Error en Google Strategy:", error);
        return done(error, null);
      }
    },
  ),
);

export default passport;
