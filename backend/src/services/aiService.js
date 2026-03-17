/**
 * @file src/services/aiService.js
 * @description Agente IA "NOVA" — asistente financiero personal de PocketPal.
 *
 * Usa la API de OpenAI (GPT-4o) con "tool calling" para que el agente pueda
 * realizar acciones reales sobre los datos del usuario:
 *   - Registrar transacciones con lenguaje natural.
 *   - Consultar estadísticas del período.
 *   - Listar transacciones recientes.
 *   - Ver, crear y abonar metas de ahorro.
 *   - Actualizar metas existentes.
 *
 * FLUJO DE UNA LLAMADA:
 *   1. Se carga el contexto financiero actual del usuario (summary, goals, etc.).
 *   2. Se construye el system prompt con esos datos embebidos.
 *   3. Se envía el mensaje a OpenAI con las tools disponibles.
 *   4. Si OpenAI decide usar una tool → se ejecuta el toolExecutor correspondiente.
 *   5. Se hace una segunda llamada a OpenAI con el resultado de la tool.
 *   6. La respuesta final (texto) se guarda en ai_chat_history y se devuelve.
 */

import OpenAI from "openai";
import { pool } from "../config/db.js";
import { AppError } from "../errors/AppError.js";
import { summaryService } from "./summaryService.js";
import { goalService } from "./goalService.js";
import { categoryService } from "./categoryService.js";

// ─── Cliente OpenAI ───────────────────────────────────────────────────────────

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/** Modelo a usar. GPT-4o es el mejor para function calling. */
const MODEL = process.env.OPENAI_MODEL || "gpt-4o";
/** Máximo de tokens en la respuesta del agente. */
const MAX_TOKENS = 2048;
/** Cuántos mensajes del historial incluir como contexto (últimos N). */
const HISTORY_LIMIT = 10;

// ─── Contexto financiero ──────────────────────────────────────────────────────

/**
 * Carga el contexto financiero completo del usuario para el system prompt.
 * Reutiliza los servicios existentes para no duplicar queries.
 *
 * @param {number} userId - ID del usuario autenticado.
 * @returns {Promise<object>} Contexto con summary, goals, categories, recent, historialMensual.
 */
const loadFinancialContext = async (userId) => {
    // Ejecutar todas las consultas en paralelo para minimizar latencia
    const [summary, goals, categories] = await Promise.all([
        summaryService.getSummary(userId, {}),
        goalService.list(userId),
        categoryService.list(userId),
    ]);

    // Últimas 20 transacciones con nombre de categoría
    const [recent] = await pool.execute(
        `SELECT t.type, t.amount, t.description, t.date, c.name AS category
     FROM transactions t
     JOIN categories c ON t.category_id = c.id
     WHERE t.user_id = ?
     ORDER BY t.date DESC, t.created_at DESC
     LIMIT 20`,
        [userId],
    );

    // Historial de los últimos 6 meses (para consejos de tendencia)
    const [historialMensual] = await pool.execute(
        `SELECT
       DATE_FORMAT(date, '%Y-%m')                                      AS mes,
       COALESCE(SUM(CASE WHEN type = 'income'  THEN amount END), 0)   AS ingresos,
       COALESCE(SUM(CASE WHEN type = 'expense' THEN amount END), 0)   AS gastos
     FROM transactions
     WHERE user_id = ? AND date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
     GROUP BY DATE_FORMAT(date, '%Y-%m')
     ORDER BY mes DESC`,
        [userId],
    );

    const now = new Date();
    return {
        summary,
        goals,
        categories,
        recent,
        historialMensual,
        month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
        date: now.toLocaleDateString("es-CO"),
    };
};

// ─── System prompt ────────────────────────────────────────────────────────────

/**
 * Construye el system prompt del agente con datos financieros reales del usuario.
 * Cuanto más preciso sea el contexto, mejores serán las respuestas de NOVA.
 *
 * @param {object} ctx - Contexto cargado por loadFinancialContext().
 * @returns {string} System prompt completo para OpenAI.
 */
const buildSystemPrompt = (ctx) => {
    // Formateador de moneda colombiana
    const fmtCOP = (n) => "$" + Math.abs(Number(n)).toLocaleString("es-CO");
    const { totals } = ctx.summary;

    const categoryList =
        ctx.categories
            .map((c) => `  id:${c.id} | ${c.name} [${c.type}]`)
            .join("\n") || "  (sin categorías)";

    const recentList =
        ctx.recent
            .map(
                (t) =>
                    `  [${t.date?.toString().slice(0, 10)}] ` +
                    `${t.type === "income" ? "↑" : "↓"} ` +
                    `${fmtCOP(t.amount)} — ${t.category}` +
                    `${t.description ? ` — ${t.description}` : ""}`,
            )
            .join("\n") || "  (sin transacciones)";

    const goalsList =
        ctx.goals
            .map(
                (g) =>
                    `  • "${g.title}" — ahorrado: ${fmtCOP(g.current_amount)} / ` +
                    `meta: ${fmtCOP(g.target_amount)} ` +
                    `(${Math.round((g.current_amount / g.target_amount) * 100)}%) ` +
                    `${g.is_completed ? "✅ COMPLETADA" : "🔄 activa"}`,
            )
            .join("\n") || "  (sin metas)";

    const historialList =
        ctx.historialMensual
            .map(
                (m) =>
                    `  ${m.mes}: ingresos ${fmtCOP(m.ingresos)} / gastos ${fmtCOP(m.gastos)}`,
            )
            .join("\n") || "  (sin historial)";

    return `Eres NOVA, asistente financiero personal integrado en PocketPal. Respondes en español colombiano, eres preciso y amigable.

FECHA ACTUAL: ${ctx.date} | MES: ${ctx.month}

MES ACTUAL:
- Total ingresos: ${fmtCOP(totals.total_income)}
- Total gastos:   ${fmtCOP(totals.total_expenses)}
- Balance:        ${fmtCOP(totals.net_balance)}

CATEGORÍAS DISPONIBLES:
${categoryList}

ÚLTIMAS TRANSACCIONES:
${recentList}

HISTORIAL MENSUAL (últimos 6 meses):
${historialList}

METAS DE AHORRO:
${goalsList}

REGLAS:
- Responde siempre en español colombiano
- Usa los nombres de categoría EXACTOS del listado de arriba
- "gasté/pagué/compré" → expense | "recibí/cobré/ingresé" → income
- Si faltan datos para registrar (monto o categoría), pídelos antes de usar una función
- Para estadísticas usa las funciones disponibles — nunca inventes números
- Si gastos > ingresos del mes, menciónalo con tacto al dar consejos
- Usa emojis con moderación`;
};

// ─── Tool definitions (OpenAI function calling) ────────────────────────────────

/**
 * Definición de las herramientas disponibles para el agente.
 * OpenAI elige cuál usar según el mensaje del usuario.
 */
const TOOLS = [
    {
        type: "function",
        function: {
            name: "create_transaction",
            description: "Registra una nueva transacción (ingreso o gasto)",
            parameters: {
                type: "object",
                properties: {
                    amount: { type: "number", description: "Monto en COP" },
                    transaction_type: {
                        type: "string",
                        enum: ["income", "expense"],
                    },
                    category_name: {
                        type: "string",
                        description: "Nombre exacto de la categoría",
                    },
                    description: {
                        type: "string",
                        description: "Descripción opcional",
                    },
                    date: {
                        type: "string",
                        description: "Fecha YYYY-MM-DD (defecto: hoy)",
                    },
                },
                required: ["amount", "transaction_type", "category_name"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "query_stats",
            description:
                "Consulta estadísticas financieras del usuario para un período",
            parameters: {
                type: "object",
                properties: {
                    period: {
                        type: "string",
                        enum: ["week", "month", "year", "all"],
                    },
                },
                required: ["period"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "list_transactions",
            description: "Lista las últimas transacciones del usuario",
            parameters: {
                type: "object",
                properties: {
                    limit: {
                        type: "number",
                        description: "Número de transacciones (máx 20)",
                    },
                    type: {
                        type: "string",
                        enum: ["income", "expense"],
                        description: "Filtrar por tipo",
                    },
                },
                required: [],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "goals_status",
            description:
                "Retorna el estado actual de todas las metas de ahorro del usuario",
            parameters: { type: "object", properties: {}, required: [] },
        },
    },
    {
        type: "function",
        function: {
            name: "create_goal",
            description: "Crea una nueva meta de ahorro",
            parameters: {
                type: "object",
                properties: {
                    title: { type: "string" },
                    target_amount: { type: "number" },
                },
                required: ["title", "target_amount"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "allocate_to_goal",
            description: "Abona dinero a una meta de ahorro existente",
            parameters: {
                type: "object",
                properties: {
                    goal_name: {
                        type: "string",
                        description: "Nombre (o parte del nombre) de la meta",
                    },
                    amount: { type: "number" },
                },
                required: ["goal_name", "amount"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "update_goal",
            description: "Actualiza el nombre o el monto objetivo de una meta",
            parameters: {
                type: "object",
                properties: {
                    goal_id: {
                        type: "number",
                        description: "ID de la meta (preferir sobre goal_name)",
                    },
                    goal_name: {
                        type: "string",
                        description:
                            "Nombre de la meta a buscar (si no hay ID)",
                    },
                    title: { type: "string", description: "Nuevo título" },
                    target_amount: {
                        type: "number",
                        description: "Nuevo monto objetivo",
                    },
                },
                required: [],
            },
        },
    },
];

// ─── Tool executors ───────────────────────────────────────────────────────────

/**
 * Implementación de cada herramienta.
 * Reutilizan los servicios existentes en lugar de hacer SQL directo.
 */
const toolExecutors = {
    /**
     * Registra una transacción buscando la categoría por nombre (fuzzy match).
     */
    async create_transaction(
        userId,
        { amount, transaction_type, category_name, description, date },
    ) {
        // Buscar categoría por nombre (LIKE para fuzzy match)
        const [cats] = await pool.execute(
            `SELECT id, name FROM categories
       WHERE (user_id IS NULL OR user_id = ?) AND name LIKE ?
       LIMIT 1`,
            [userId, `%${category_name}%`],
        );

        if (cats.length === 0) {
            return {
                success: false,
                message: `No encontré la categoría "${category_name}". Usa un nombre del listado.`,
            };
        }

        const txDate = date || new Date().toISOString().split("T")[0];

        const [result] = await pool.execute(
            `INSERT INTO transactions
         (user_id, type, amount, category_id, description, date)
       VALUES (?, ?, ?, ?, ?, ?)`,
            [
                userId,
                transaction_type,
                parseFloat(amount),
                cats[0].id,
                description || null,
                txDate,
            ],
        );

        const [[tx]] = await pool.execute(
            "SELECT id, type, amount, description, date FROM transactions WHERE id = ?",
            [result.insertId],
        );

        return {
            success: true,
            actionType: "TRANSACTION_CREATED",
            transaction: { ...tx, category: cats[0].name },
        };
    },

    /**
     * Consulta estadísticas financieras para el período indicado.
     */
    async query_stats(userId, { period }) {
        const filters = {};

        if (period === "month") {
            const now = new Date();
            filters.start_date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
        } else if (period === "week") {
            const d = new Date();
            d.setDate(d.getDate() - 7);
            filters.start_date = d.toISOString().split("T")[0];
        } else if (period === "year") {
            filters.start_date = `${new Date().getFullYear()}-01-01`;
        }
        // 'all' → sin filtro de fecha

        const data = await summaryService.getSummary(userId, filters);
        return { success: true, actionType: "STATS_RESULT", ...data, period };
    },

    /**
     * Lista las últimas N transacciones, con filtro opcional por tipo.
     */
    async list_transactions(userId, { limit = 10, type } = {}) {
        const safeLimit = Math.min(20, Math.max(1, parseInt(limit) || 10));
        const params = [userId];
        let typeFilter = "";

        if (type) {
            typeFilter = "AND t.type = ?";
            params.push(type);
        }

        const [rows] = await pool.execute(
            `SELECT t.id, t.type, t.amount, t.description, t.date, c.name AS category
       FROM transactions t
       JOIN categories c ON t.category_id = c.id
       WHERE t.user_id = ? ${typeFilter}
       ORDER BY t.date DESC, t.created_at DESC
       LIMIT ${safeLimit}`,
            params,
        );

        return {
            success: true,
            actionType: "TRANSACTIONS_LIST",
            transactions: rows,
        };
    },

    /**
     * Devuelve el estado actual de todas las metas del usuario.
     */
    async goals_status(userId) {
        const goals = await goalService.list(userId);
        return { success: true, actionType: "GOALS_STATUS", goals };
    },

    /**
     * Crea una nueva meta de ahorro.
     */
    async create_goal(userId, { title, target_amount }) {
        const goal = await goalService.create(userId, { title, target_amount });
        return { success: true, actionType: "GOAL_CREATED", goal };
    },

    /**
     * Abona un monto a una meta buscada por nombre.
     */
    async allocate_to_goal(userId, { goal_name, amount }) {
        const [rows] = await pool.execute(
            "SELECT id FROM goals WHERE user_id = ? AND LOWER(title) LIKE LOWER(?) LIMIT 1",
            [userId, `%${goal_name}%`],
        );

        if (rows.length === 0) {
            return {
                success: false,
                message: `No encontré la meta "${goal_name}"`,
            };
        }

        const result = await goalService.allocate(rows[0].id, userId, amount);
        return { success: true, actionType: "GOAL_ALLOCATED", ...result };
    },

    /**
     * Actualiza el título o monto objetivo de una meta.
     * BUG FIX: parámetros de goalService.update() estaban invertidos.
     */
    async update_goal(
        userId,
        { goal_id, goal_name, title, target_amount } = {},
    ) {
        let current;

        // Buscar por ID primero (más preciso), luego por nombre
        if (goal_id) {
            const [[row]] = await pool.execute(
                "SELECT id, title, target_amount FROM goals WHERE id = ? AND user_id = ?",
                [goal_id, userId],
            );
            current = row;
        } else if (goal_name) {
            const [[row]] = await pool.execute(
                "SELECT id, title, target_amount FROM goals WHERE user_id = ? AND LOWER(title) LIKE LOWER(?) LIMIT 1",
                [userId, `%${goal_name}%`],
            );
            current = row;
        }

        if (!current) {
            return {
                success: false,
                message: `No encontré la meta "${goal_name || goal_id}"`,
            };
        }

        // BUG FIX: goalService.update(id, userId, data) — orden correcto
        const result = await goalService.update(current.id, userId, {
            title: title ?? current.title,
            target_amount: target_amount ?? current.target_amount,
        });

        return { success: true, actionType: "GOAL_UPDATED", goal: result };
    },
};

// ─── Servicio público ─────────────────────────────────────────────────────────

const aiService = {
    /**
     * Envía un mensaje al agente NOVA y obtiene su respuesta.
     *
     * Si OpenAI decide usar una herramienta:
     *   1. Ejecuta el toolExecutor correspondiente.
     *   2. Hace una segunda llamada a OpenAI con el resultado.
     *   3. Devuelve la respuesta final + el actionResult de la herramienta.
     *
     * @param {number} userId   - ID del usuario autenticado.
     * @param {string} message  - Mensaje del usuario.
     * @param {Array}  history  - Historial previo de la conversación.
     * @returns {Promise<{message: string, actionResult: object|null}>}
     */
    async chat(userId, message, history = []) {
        // Guardar el mensaje del usuario en el historial
        await pool.execute(
            "INSERT INTO ai_chat_history (user_id, role, content) VALUES (?, 'user', ?)",
            [userId, message],
        );

        // Cargar contexto financiero y construir el system prompt
        const ctx = await loadFinancialContext(userId);
        const systemPrompt = buildSystemPrompt(ctx);

        const messages = [
            { role: "system", content: systemPrompt },
            // Incluir solo los últimos N mensajes para no exceder el contexto
            ...history.slice(-HISTORY_LIMIT).map((m) => ({
                role: m.role,
                content: m.content,
            })),
            { role: "user", content: message },
        ];

        let finalText = "";
        let actionResult = null;

        try {
            // Primera llamada: OpenAI decide si responder o usar una herramienta
            const firstResponse = await openai.chat.completions.create({
                model: MODEL,
                max_tokens: MAX_TOKENS,
                tools: TOOLS,
                tool_choice: "auto",
                messages,
            });

            const assistantMessage = firstResponse.choices[0].message;

            if (assistantMessage.tool_calls?.length > 0) {
                // El agente quiere ejecutar una herramienta
                const toolCall = assistantMessage.tool_calls[0];
                const funcName = toolCall.function.name;

                let funcArgs = {};
                try {
                    funcArgs = JSON.parse(toolCall.function.arguments);
                } catch {
                    // Si el JSON es inválido, usar objeto vacío (el executor lo manejará)
                    funcArgs = {};
                }

                // Ejecutar la herramienta
                const executor = toolExecutors[funcName];
                actionResult = executor
                    ? await executor(userId, funcArgs)
                    : {
                          success: false,
                          message: `Función "${funcName}" no disponible`,
                      };

                // Segunda llamada: OpenAI redacta la respuesta con el resultado de la herramienta
                const secondResponse = await openai.chat.completions.create({
                    model: MODEL,
                    max_tokens: MAX_TOKENS,
                    tools: TOOLS,
                    messages: [
                        ...messages,
                        assistantMessage,
                        {
                            role: "tool",
                            tool_call_id: toolCall.id,
                            content: JSON.stringify(actionResult),
                        },
                    ],
                });

                finalText = secondResponse.choices[0].message.content || "";
            } else {
                // Respuesta directa sin herramienta
                finalText = assistantMessage.content || "";
            }
        } catch (err) {
            if (err instanceof OpenAI.APIError) {
                throw new AppError(
                    `Error del agente IA: ${err.message}`,
                    502,
                    "AI_UNAVAILABLE",
                );
            }
            throw err;
        }

        // Guardar la respuesta del agente en el historial
        await pool.execute(
            "INSERT INTO ai_chat_history (user_id, role, content) VALUES (?, 'assistant', ?)",
            [userId, finalText],
        );

        return { message: finalText, actionResult };
    },

    /**
     * Obtiene el historial de conversación del usuario con el agente.
     * Los últimos 50 mensajes, ordenados cronológicamente (ASC).
     *
     * @param {number} userId - ID del usuario.
     * @returns {Promise<Array<{role: string, content: string, created_at: string}>>}
     */
    async getHistory(userId) {
        const [rows] = await pool.execute(
            `SELECT role, content, created_at
       FROM ai_chat_history
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 50`,
            [userId],
        );
        // Invertir para que el más antiguo quede primero (orden cronológico)
        return rows.reverse();
    },

    /**
     * Elimina todo el historial de conversación del usuario.
     *
     * @param {number} userId - ID del usuario.
     * @returns {Promise<void>}
     */
    async clearHistory(userId) {
        await pool.execute("DELETE FROM ai_chat_history WHERE user_id = ?", [
            userId,
        ]);
    },
};

export default aiService;
