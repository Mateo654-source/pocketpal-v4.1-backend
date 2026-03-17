/**
 * @file src/routes/categoryRoutes.js
 * @description Rutas del recurso /api/categories.
 *
 * Todas las rutas requieren autenticación JWT.
 * Las categorías globales (user_id = NULL) son solo lectura.
 * Las personalizadas pueden crearse, editarse y eliminarse.
 */

import { Router } from "express";
import {
    getCategories,
    getCategoryById,
    createCategory,
    updateCategory,
    deleteCategory,
} from "../controllers/categoryController.js";
import { validate, rules } from "../middleware/validate.js";
import { protect } from "../middleware/authMiddleware.js";

const router = Router();

// Proteger todas las rutas del módulo con JWT
router.use(protect);

router.get("/", getCategories);
router.get("/:id", getCategoryById);
router.post("/", validate(rules.category.create), createCategory);
router.put("/:id", validate(rules.category.update), updateCategory);
router.delete("/:id", deleteCategory);

export default router;
