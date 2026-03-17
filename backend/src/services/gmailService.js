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

const getGmailClient = (accessToken) => {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    return google.gmail({ version: "v1", auth });
};

// ─── Obtener emails de bancos ────────────────────────────────────────────────
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

    return Promise.all(
        messages.map((msg) =>
            gmail.users.messages
                .get({ userId: "me", id: msg.id, format: "full" })
                .then((r) => r.data),
        ),
    );
};

// ─── Parsear emails a transacciones ──────────────────────────────────────────
export const parseBankEmails = (emails) => {
    return emails.reduce((acc, email) => {
        const transaction = parseTransaction(email);
        if (transaction) acc.push(transaction);
        return acc;
    }, []);
};

// ─── Sincronización principal ────────────────────────────────────────────────
/**
 * Obtiene, parsea e inserta transacciones desde Gmail para un usuario.
 * Lanza Error('NO_TOKEN') si el usuario no tiene access token de Google.
 */
export const syncTransactions = async (userId) => {
    const [[user]] = await pool.execute(
        "SELECT google_access_token, google_refresh_token FROM users WHERE id = ?",
        [userId],
    );

    if (!user?.google_access_token) throw new Error("NO_TOKEN");

    const emails = await getBankEmails(user.google_access_token);
    const transactions = parseBankEmails(emails);

    let inserted = 0;
    let skipped = 0;

    // Traer categorías disponibles (globales + usuario)
    const [categories] = await pool.execute(
        "SELECT id, name FROM categories WHERE user_id = ? OR user_id IS NULL",
        [userId],
    );

    for (const t of transactions) {
        // Evitar duplicados por gmail_message_id
        const [exists] = await pool.execute(
            "SELECT id FROM transactions WHERE gmail_message_id = ?",
            [t.gmailMessageId],
        );

        if (exists.length > 0) {
            skipped++;
            continue;
        }

        let categoryId = null;

        // 1 Rules (rápido)
        categoryId = detectByRules(t, categories);

        // 2 Cache por merchant
        if (!categoryId && t.merchant) {
            categoryId = await getCategoryFromCache(t.merchant, userId);
        }

        // 3 Similarity simple
        if (!categoryId) {
            categoryId = detectBySimilarity(t, categories);
        }

        // 4 IA (solo si todo falla)
        if (!categoryId) {
            const aiCategory = await setCategorie(t.description, userId);

            if (aiCategory?.categoryId) {
                categoryId = aiCategory.categoryId;

                // Guardar en cache
                if (t.merchant) {
                    await saveCategoryCache(t.merchant, categoryId);
                }
            }
        }

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
