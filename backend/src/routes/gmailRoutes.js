/**
 * @file src/routes/gmailRoutes.js
 * @description Rutas de sincronización con Gmail en /api/gmail.
 */

import { Router } from "express";
import { syncManual } from "../controllers/gmailController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = Router();

router.use(protect);

/** POST /api/gmail/sync — sincronización manual iniciada por el usuario. */
router.post("/sync", syncManual);

export default router;
