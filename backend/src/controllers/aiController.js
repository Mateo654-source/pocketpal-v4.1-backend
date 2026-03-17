/**
 * @file src/controllers/aiController.js
 * @description Controller HTTP para el recurso /api/ai.
 *
 * Expone el agente NOVA (basado en OpenAI) para chat con contexto financiero.
 * Toda la lógica del agente (system prompt, tools, historial) está en aiService.js.
 *
 * Rutas soportadas (todas requieren token JWT válido):
 *   POST   /api/ai/chat     → enviar mensaje al agente (limitado por aiLimiter)
 *   GET    /api/ai/history  → obtener historial de conversación
 *   DELETE /api/ai/history  → borrar historial de conversación
 */

import aiService from "../services/aiService.js";

/**
 * POST /api/ai/chat
 * Envía un mensaje al agente NOVA y recibe una respuesta.
 *
 * El servicio carga automáticamente el historial desde la base de datos
 * para mantener contexto entre sesiones. También carga datos financieros
 * actuales del usuario para que NOVA pueda dar respuestas precisas.
 *
 * Body requerido (validado por validate middleware):
 *   { message: string }
 *
 * Respuesta 200:
 * {
 *   success: true,
 *   data: {
 *     message:      string,        // Respuesta del agente
 *     actionResult: object | null, // Resultado de una herramienta (si se usó)
 *     timestamp:    string         // ISO timestamp de la respuesta
 *   }
 * }
 *
 * @param {import('express').Request}  req - req.body.message: texto del usuario.
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export const chat = async (req, res, next) => {
    try {
        const { message } = req.body;

        // Cargar historial previo desde DB para dar contexto a la conversación
        const history = await aiService.getHistory(req.user.id);

        // Llamar al agente con el mensaje y el historial
        const result = await aiService.chat(req.user.id, message, history);

        res.json({
            success: true,
            data: {
                ...result,
                timestamp: new Date().toISOString(),
            },
        });
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/ai/history
 * Retorna el historial de conversación del usuario con el agente NOVA.
 * Útil para restaurar el chat al recargar la página.
 *
 * Respuesta 200:
 * {
 *   success: true,
 *   data: {
 *     history: [ { role: 'user'|'assistant', content: string, created_at: string } ]
 *   }
 * }
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export const getChatHistory = async (req, res, next) => {
    try {
        const history = await aiService.getHistory(req.user.id);
        res.json({ success: true, data: { history } });
    } catch (err) {
        next(err);
    }
};

/**
 * DELETE /api/ai/history
 * Elimina todo el historial de conversación del usuario.
 * El próximo chat comenzará sin contexto previo.
 *
 * Respuesta 200:
 *   { success: true, message: 'Historial borrado' }
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export const clearChatHistory = async (req, res, next) => {
    try {
        await aiService.clearHistory(req.user.id);
        res.json({ success: true, message: "Historial borrado" });
    } catch (err) {
        next(err);
    }
};
