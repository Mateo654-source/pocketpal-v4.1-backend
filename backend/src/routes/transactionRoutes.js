/**
 * @file src/routes/transactionRoutes.js
 * @description Rutas del recurso /api/transactions.
 *
 * Soporta paginación y filtros en el GET principal:
 *   ?type, ?category_id, ?start_date, ?end_date, ?page, ?limit
 *
 * Todas las rutas requieren autenticación JWT.
 */

import { Router } from "express";
import {
    getTransactions,
    getTransactionById,
    createTransaction,
    updateTransaction,
    deleteTransaction,
} from "../controllers/transactionController.js";
import { protect } from "../middleware/authMiddleware.js";
import { validate, rules } from "../middleware/validate.js";

const router = Router();

// Proteger todas las rutas del módulo con JWT
router.use(protect);

router.get("/", getTransactions);
router.get("/:id", getTransactionById);
router.post("/", validate(rules.transaction.create), createTransaction);
router.put("/:id", validate(rules.transaction.update), updateTransaction);
router.delete("/:id", deleteTransaction);

export default router;
