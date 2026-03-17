/**
 * @file src/controllers/categoryController.js
 * @description Controller HTTP para el recurso /api/categories.
 *
 * Responsabilidad única: recibir la petición HTTP, delegar al servicio
 * y formatear la respuesta JSON. Cero lógica de negocio aquí.
 *
 * Todas las rutas requieren el middleware protect (token JWT válido).
 * El CRUD completo está soportado:
 *   GET    /api/categories       → listar (globales + propias del usuario)
 *   GET    /api/categories/:id   → obtener por ID
 *   POST   /api/categories       → crear categoría personalizada
 *   PUT    /api/categories/:id   → actualizar categoría personalizada
 *   DELETE /api/categories/:id   → eliminar categoría personalizada
 */

import { categoryService } from "../services/categoryService.js";

/**
 * GET /api/categories
 * Retorna todas las categorías disponibles para el usuario autenticado
 * (globales del sistema + personalizadas del usuario).
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export const getCategories = async (req, res, next) => {
    try {
        const categories = await categoryService.list(req.user.id);
        res.json({ success: true, data: { categories } });
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/categories/:id
 * Retorna una categoría específica por ID.
 * Solo accesible si es global o pertenece al usuario autenticado.
 *
 * @param {import('express').Request}  req - req.params.id: ID de la categoría.
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export const getCategoryById = async (req, res, next) => {
    try {
        const category = await categoryService.getById(
            req.params.id,
            req.user.id,
        );
        res.json({ success: true, data: { category } });
    } catch (err) {
        next(err);
    }
};

/**
 * POST /api/categories
 * Crea una nueva categoría personalizada para el usuario autenticado.
 *
 * Body requerido (validado por middleware validate):
 *   { name: string, type: 'income' | 'expense' }
 *
 * @param {import('express').Request}  req - req.body: { name, type }.
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export const createCategory = async (req, res, next) => {
    try {
        const category = await categoryService.create(req.user.id, req.body);
        res.status(201).json({
            success: true,
            message: "Categoría creada",
            data: { category },
        });
    } catch (err) {
        next(err);
    }
};

/**
 * PUT /api/categories/:id
 * Actualiza nombre y/o tipo de una categoría personalizada del usuario.
 * Las categorías globales no se pueden editar.
 *
 * Body requerido (validado por middleware validate):
 *   { name: string, type: 'income' | 'expense' }
 *
 * @param {import('express').Request}  req - req.params.id, req.body.
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export const updateCategory = async (req, res, next) => {
    try {
        const category = await categoryService.update(
            req.params.id,
            req.user.id,
            req.body,
        );
        res.json({
            success: true,
            message: "Categoría actualizada",
            data: { category },
        });
    } catch (err) {
        next(err);
    }
};

/**
 * DELETE /api/categories/:id
 * Elimina una categoría personalizada del usuario.
 * No se puede eliminar si tiene transacciones asociadas o si es global.
 *
 * @param {import('express').Request}  req - req.params.id: ID de la categoría.
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export const deleteCategory = async (req, res, next) => {
    try {
        await categoryService.delete(req.params.id, req.user.id);
        res.json({ success: true, message: "Categoría eliminada" });
    } catch (err) {
        next(err);
    }
};
