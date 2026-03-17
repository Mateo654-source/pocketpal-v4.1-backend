/**
 * @file src/controllers/transactionController.js
 * @description Controller HTTP para el recurso /api/transactions.
 *
 * Responsabilidad única: recibir la petición HTTP, delegar al servicio
 * y formatear la respuesta JSON. Cero lógica de negocio ni SQL aquí.
 *
 * Rutas soportadas (todas requieren token JWT válido via protect):
 *   GET    /api/transactions          → listar con paginación y filtros
 *   GET    /api/transactions/:id      → obtener por ID
 *   POST   /api/transactions          → crear nueva transacción
 *   PUT    /api/transactions/:id      → actualizar transacción
 *   DELETE /api/transactions/:id      → eliminar transacción
 *
 * Filtros disponibles en GET /api/transactions (query params):
 *   ?type=income|expense
 *   ?category_id=<id>
 *   ?start_date=YYYY-MM-DD
 *   ?end_date=YYYY-MM-DD
 *   ?page=<n>   (defecto: 1)
 *   ?limit=<n>  (defecto: 20, máximo: 100)
 */

import { transactionService } from "../services/transactionService.js";

/**
 * GET /api/transactions
 * Lista transacciones del usuario autenticado con paginación y filtros opcionales.
 * Respuesta incluye el objeto `pagination` con: total, page, limit, totalPages.
 *
 * @param {import('express').Request}  req - req.query: filtros y parámetros de paginación.
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export const getTransactions = async (req, res, next) => {
    try {
        const result = await transactionService.list(req.user.id, req.query);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/transactions/:id
 * Retorna una transacción específica por ID.
 *
 * @param {import('express').Request}  req - req.params.id: ID de la transacción.
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export const getTransactionById = async (req, res, next) => {
    try {
        const transaction = await transactionService.getById(
            req.params.id,
            req.user.id,
        );
        res.json({ success: true, data: { transaction } });
    } catch (err) {
        next(err);
    }
};

/**
 * POST /api/transactions
 * Crea una nueva transacción para el usuario autenticado.
 *
 * Body requerido (validado por validate middleware):
 *   { type, amount, category_id, description?, date? }
 *
 * @param {import('express').Request}  req - req.body: datos de la transacción.
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export const createTransaction = async (req, res, next) => {
    try {
        const transaction = await transactionService.create(
            req.user.id,
            req.body,
        );
        res.status(201).json({
            success: true,
            message: "Transacción creada",
            data: { transaction },
        });
    } catch (err) {
        next(err);
    }
};

/**
 * PUT /api/transactions/:id
 * Actualiza una transacción existente del usuario autenticado.
 *
 * Body requerido (validado por validate middleware):
 *   { type, amount, category_id, date, description? }
 *
 * @param {import('express').Request}  req - req.params.id, req.body.
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export const updateTransaction = async (req, res, next) => {
    try {
        const transaction = await transactionService.update(
            req.params.id,
            req.user.id,
            req.body,
        );
        res.json({
            success: true,
            message: "Transacción actualizada",
            data: { transaction },
        });
    } catch (err) {
        next(err);
    }
};

/**
 * DELETE /api/transactions/:id
 * Elimina una transacción del usuario autenticado.
 *
 * @param {import('express').Request}  req - req.params.id: ID a eliminar.
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export const deleteTransaction = async (req, res, next) => {
    try {
        await transactionService.delete(req.params.id, req.user.id);
        res.json({ success: true, message: "Transacción eliminada" });
    } catch (err) {
        next(err);
    }
};
