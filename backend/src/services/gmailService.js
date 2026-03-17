/**
 * @file src/services/gmailService.js
 * @description Servicio de sincronización de transacciones desde Gmail.
 *
 * Conecta con la Gmail API usando los tokens OAuth del usuario, descarga
 * correos bancarios recientes, los parsea y los inserta en la base de datos
 * evitando duplicados (via gmail_message_id).
 *
 * Renovación automática del access_token:
 *   Google expira el access_token en ~1 hora. Si la petición a Gmail falla
 *   con un error de autenticación (401/403 o "invalid_grant"), este servicio
 *   usa el refresh_token para obtener un token nuevo, lo persiste en la BD
 *   y reintenta la descarga de correos una sola vez.
 *
 * Cadena de categorización por orden de prioridad:
 *   1. Reglas de palabras clave (deterministas, sin costo).
 *   2. Caché por merchant (reutiliza clasificaciones previas).
 *   3. Similitud de texto (busca nombre de categoría en descripción).
 *   4. IA con GPT-4.1-nano (solo si los tres anteriores fallan).
 *
 * Lanza Error('NO_TOKEN') si el usuario no tiene access token de Google,
 * para que el controlador pueda diferenciarlo de otros errores.
 */

import { google } from "googleapis";
import { pool } from "../config/db.js";
import { parseTransaction } from "./bankParser/index.js";
import { setCategorie } from "./chatgpt-integration.service.js";
import { detectByRules } from "./category/categoryRules.js";
import { detectBySimilarity } from "./category/categorySimilarity.js";
import {
    getCategoryFromCache,
    saveCategoryCache,
} from "./category/categoryCache.js";

// ─── Cliente Gmail ────────────────────────────────────────────────────────────

/**
 * Crea un cliente autenticado de la Gmail API usando un access token.
 *
 * @param {string} accessToken - Google OAuth access token del usuario.
 * @returns {object} Cliente gmail autenticado.
 */
const getGmailClient = (accessToken) => {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    return google.gmail({ version: "v1", auth });
};

// ─── RePOKIción de token ──────────────────────────────────────────────────────

/**
 * Comprueba si un error de la Gmail API indica que el access_token expiró
 * o fue revocado.
 *
 * @param {Error} err - Error lanzado por la googleapis.
 * @returns {boolean} true si el error es de autenticación.
 */
const isAuthError = (err) => {
    const status = err?.response?.status ?? err?.code;
    const message = (err?.message || "").toLowerCase();
    return (
        status === 401 ||
        status === 403 ||
        message.includes("invalid_grant") ||
        message.includes("token has been expired") ||
        message.includes("invalid credentials")
    );
};

/**
 * Renueva el access_token usando el refresh_token y lo persiste en la BD.
 *
 * @param {number} userId       - ID del usuario.
 * @param {string} refreshToken - Google OAuth refresh token.
 * @returns {Promise<string>} Nuevo access_token.
 * @throws {Error} Si la rePOKIción falla (refresh_token revocado o inválido).
 */
const refreshAccessToken = async (userId, refreshToken) => {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
    );
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    const { credentials } = await oauth2Client.refreshAccessToken();
    const newAccessToken = credentials.access_token;

    // Persistir el nuevo token (y el refresh_token si Google lo rotó)
    await pool.execute(
        `UPDATE users
         SET google_access_token  = ?,
             google_refresh_token = COALESCE(?, google_refresh_token)
         WHERE id = ?`,
        [newAccessToken, credentials.refresh_token ?? null, userId],
    );

    console.log(`🔑 Access token rePOKIdo para user ${userId}`);
    return newAccessToken;
};

// ─── Obtener emails de bancos ─────────────────────────────────────────────────

/**
 * Descarga los correos bancarios del usuario de los últimos 365 días.
 * Filtra por remitentes conocidos y palabras clave en el asunto/cuerpo.
 *
 * @param {string} accessToken - Google OAuth access token del usuario.
 * @returns {Promise<Array>} Lista de objetos mensaje completos de la Gmail API.
 */
export const getBankEmails = async (accessToken) => {
    const gmail = getGmailClient(accessToken);

    const query = [
        "from:notificacionesbancolombia.com",
        "from:davivienda.com",
        "from:bancodebogota.com.co",
        "subject:(movimiento OR compra OR retiro OR transferencia)",
        "Bancolombia: (Compraste OR Retiraste OR Transferiste OR Recibiste OR Pagaste)",
    ].join(" OR ");

    const response = await gmail.users.messages.list({
        userId: "me",
        q: `(${query}) newer_than:365d`,
        maxResults: 100,
    });

    const messages = response.data.messages || [];
    if (messages.length === 0) return [];

    // Descargar el contenido completo de cada mensaje en paralelo
    return Promise.all(
        messages.map((msg) =>
            gmail.users.messages
                .get({ userId: "me", id: msg.id, format: "full" })
                .then((r) => r.data),
        ),
    );
};

// ─── Parsear emails a transacciones ──────────────────────────────────────────

/**
 * Parsea una lista de correos crudos de la Gmail API a transacciones.
 * Descarta los correos que no se reconocen (parseTransaction devuelve null).
 *
 * @param {Array} emails - Mensajes completos de la Gmail API.
 * @returns {Array} Transacciones parseadas con gmailMessageId.
 */
export const parseBankEmails = (emails) => {
    return emails.reduce((acc, email) => {
        const transaction = parseTransaction(email);
        if (transaction) acc.push(transaction);
        return acc;
    }, []);
};

// ─── Sincronización principal ─────────────────────────────────────────────────

/**
 * Función principal de sincronización.
 * Obtiene los correos bancarios del usuario, los parsea e inserta en la BD
 * las transacciones nuevas (no duplicadas).
 *
 * Si el access_token expiró, intenta rePOKIrlo con el refresh_token y
 * reintenta la descarga una sola vez antes de lanzar el error.
 *
 * @param {number} userId - ID del usuario a sincronizar.
 * @returns {Promise<{inserted: number, skipped: number, total: number}>}
 * @throws {Error} Error('NO_TOKEN') si el usuario no tiene access token de Google.
 */
export const syncTransactions = async (userId) => {
    const [[user]] = await pool.execute(
        "SELECT google_access_token, google_refresh_token FROM users WHERE id = ?",
        [userId],
    );

    if (!user?.google_access_token) throw new Error("NO_TOKEN");

    // Intentar obtener los correos, rePOKIndo el token si expira
    let emails;
    try {
        emails = await getBankEmails(user.google_access_token);
    } catch (err) {
        if (isAuthError(err) && user.google_refresh_token) {
            // Token expirado → rePOKIr y reintentar una vez
            const newToken = await refreshAccessToken(
                userId,
                user.google_refresh_token,
            );
            emails = await getBankEmails(newToken);
        } else {
            throw err;
        }
    }

    const transactions = parseBankEmails(emails);

    let inserted = 0;
    let skipped = 0;

    // Cargar categorías disponibles para el usuario (globales + propias)
    const [categories] = await pool.execute(
        "SELECT id, name FROM categories WHERE user_id = ? OR user_id IS NULL",
        [userId],
    );

    for (const t of transactions) {
        // Saltar transacciones que ya existen (control de duplicados)
        const [exists] = await pool.execute(
            "SELECT id FROM transactions WHERE gmail_message_id = ?",
            [t.gmailMessageId],
        );

        if (exists.length > 0) {
            skipped++;
            continue;
        }

        let categoryId = null;

        // 1. Reglas de palabras clave (más rápido, sin costo)
        categoryId = detectByRules(t, categories);

        // 2. Caché por merchant
        if (!categoryId && t.merchant) {
            categoryId = await getCategoryFromCache(t.merchant, userId);
        }

        // 3. Similitud de texto
        if (!categoryId) {
            categoryId = detectBySimilarity(t, categories);
        }

        // 4. IA — solo si los tres métodos anteriores fallaron
        if (!categoryId) {
            const aiCategory = await setCategorie(t.description, userId);

            if (aiCategory?.categoryId) {
                categoryId = aiCategory.categoryId;

                // Guardar en caché para evitar llamar a la IA de nuevo para este merchant
                if (t.merchant) {
                    await saveCategoryCache(t.merchant, categoryId);
                }
            }
        }

        // Sanitizar valores antes de insertar (null explícito para campos vacíos)
        const safeTransaction = {
            amount: t.amount ?? null,
            type: t.type ?? null,
            description: t.description ?? null,
            merchant: t.merchant ?? null,
            date: t.date ?? null,
            bank: t.bank ?? null,
            gmailMessageId: t.gmailMessageId ?? null,
            categoryId: categoryId ?? null,
        };

        await pool.execute(
            `INSERT INTO transactions
        (user_id, amount, type, description, merchant, date, bank, gmail_message_id, category_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                userId,
                safeTransaction.amount,
                safeTransaction.type,
                safeTransaction.description,
                safeTransaction.merchant,
                safeTransaction.date,
                safeTransaction.bank,
                safeTransaction.gmailMessageId,
                safeTransaction.categoryId,
            ],
        );

        inserted++;
    }

    console.log(
        `✅ Insertados: ${inserted} | ⏭️ Saltados: ${skipped} | 📧 Total emails: ${transactions.length}`,
    );

    return { inserted, skipped, total: emails.length };
};
