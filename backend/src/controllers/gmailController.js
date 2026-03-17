/**
 * @file src/controllers/gmailController.js
 * @description Controller para sincronización de transacciones desde Gmail.
 *
 * Gestiona dos modalidades de sincronización:
 *   1. Manual: el usuario presiona "Sincronizar" en el dashboard.
 *      → POST /api/gmail/sync
 *   2. Automática: ejecutada por el cron job cada hora.
 *      → syncAutomatic() no es un endpoint HTTP, solo una función.
 *
 * La lógica real de parseo de correos y detección de banco está en
 * gmailService.js (y bankParser/).
 */

import { syncTransactions } from "../services/gmailService.js";

/**
 * POST /api/gmail/sync
 * Sincronización manual de transacciones desde los correos de Gmail del usuario.
 *
 * Requiere que el usuario haya autorizado con Google OAuth (tiene refresh_token).
 * Si no tiene token → responde 400 con mensaje descriptivo.
 *
 * Respuesta 200:
 * {
 *   success: true,
 *   message: 'Sincronización completada',
 *   data: { inserted: number, skipped: number }
 * }
 *
 * @param {import('express').Request}  req - req.user.id inyectado por protect.
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export const syncManual = async (req, res, next) => {
    try {
        const result = await syncTransactions(req.user.id);
        res.json({
            success: true,
            message: "Sincronización completada",
            data: result,
        });
    } catch (err) {
        // Error específico: el usuario no tiene token de Google
        if (err.message === "NO_TOKEN") {
            return res.status(400).json({
                success: false,
                message:
                    "No tienes Gmail vinculado. Inicia sesión con Google para sincronizar.",
            });
        }
        next(err);
    }
};

/**
 * Sincronización automática de un usuario.
 * Es llamada por el cron job (syncCron.js), NO es un endpoint HTTP.
 *
 * Captura errores internamente para que el cron no falle si un usuario
 * específico tiene un problema con su token.
 *
 * @param {number} userId - ID del usuario a sincronizar.
 * @returns {Promise<void>}
 */
export const syncAutomatic = async (userId) => {
    try {
        const result = await syncTransactions(userId);
        console.log(`✅ Sync automático user ${userId}:`, result);
    } catch (err) {
        // Loguear el error pero no lanzarlo para no interrumpir el cron
        console.error(`❌ Sync automático user ${userId} falló:`, err.message);
    }
};
