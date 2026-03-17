/**
 * @file src/routes/aiRoutes.js
 * @description Rutas del agente IA NOVA en /api/ai.
 *
 * El endpoint de chat tiene un rate limiter adicional (aiLimiter) de
 * 30 mensajes/hora por IP para controlar el consumo de tokens de OpenAI.
 */

import { Router } from "express";
import {
    chat,
    getChatHistory,
    clearChatHistory,
} from "../controllers/aiController.js";
import { protect } from "../middleware/authMiddleware.js";
import { aiLimiter } from "../middleware/rateLimiter.js";
import { validate, rules } from "../middleware/validate.js";

const router = Router();

// Proteger todas las rutas del módulo con JWT
router.use(protect);

router.post("/chat", aiLimiter, validate(rules.ai.chat), chat);
router.get("/history", getChatHistory);
router.delete("/history", clearChatHistory);

export default router;
