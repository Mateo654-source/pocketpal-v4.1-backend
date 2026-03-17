/**
 * @file src/middleware/authMiddleware.js
 * @description Middleware de autenticación JWT para rutas protegidas.
 *
 * Flujo de verificación:
 *   1. El cliente envía el header: Authorization: Bearer <token>
 *   2. Se extrae el token del header.
 *   3. Se verifica la firma y expiración del JWT.
 *   4. Se decodifica el payload y se adjunta a req.user.
 *   5. Se llama a next() para continuar al controller.
 *
 * Si algo falla (token ausente, inválido o expirado) → 401 Unauthorized.
 * El frontend maneja el 401 en api.js limpiando el localStorage y redirigiendo al login.
 */

import { verifyToken } from "../utils/jwt.js";

/**
 * Middleware que protege rutas privadas verificando el token JWT.
 *
 * Uso en rutas:
 *   router.get('/me', protect, getMe);
 *   router.use(protect); // para proteger todas las rutas del router
 *
 * Después de este middleware, los controllers pueden acceder a:
 *   req.user.id    → ID del usuario autenticado
 *   req.user.email → Email del usuario autenticado
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export const protect = (req, res, next) => {
    try {
        // El header debe tener el formato: "Bearer <token>"
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                success: false,
                code: "NO_TOKEN",
                message:
                    "No se proporcionó token de autenticación. Inicia sesión.",
            });
        }

        // Extraer la parte del token (todo lo que está después de "Bearer ")
        const token = authHeader.split(" ")[1];

        // Verificar firma y expiración → lanza error si es inválido
        const decoded = verifyToken(token);

        // Adjuntar payload decodificado para uso en controllers
        req.user = decoded;

        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            code: "INVALID_TOKEN",
            message: "Token inválido o expirado. Inicia sesión de nuevo.",
        });
    }
};
