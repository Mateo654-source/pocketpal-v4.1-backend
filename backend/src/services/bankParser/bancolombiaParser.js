/**
 * @file src/services/bankParser/bancolombiaParser.js
 * @description Parser de correos de notificación de Bancolombia.
 *
 * Detecta y extrae transacciones de cuatro tipos de correo:
 *   - Pago recibido (income)
 *   - Compra con tarjeta (expense)
 *   - Retiro de cajero (expense)
 *   - Transferencia enviada (transfer)
 *
 * Retorna null si el cuerpo del correo no corresponde a Bancolombia
 * o si no coincide ningún patrón conocido.
 *
 * @param {string} rawBody  - Cuerpo del correo (texto plano o HTML según mimeType).
 * @param {string} mimeType - 'text/plain' o 'text/html'.
 * @returns {object|null} Transacción extraída o null si no se reconoce el correo.
 */

import { htmlToText } from "html-to-text";

export const parseBancolombiaEmail = (rawBody, mimeType) => {
    const body = cleanText(normalizeBody(rawBody, mimeType));

    if (!body.includes("Bancolombia:")) return null;

    const transaction = {
        type: null,
        description: null,
        merchant: null,
        amount: null,
        date: null,
    };

    // ── Pago recibido ──────────────────────────────────────────────────────────
    const income = body.match(
        /Recibiste\s+un\s+pago\s+.+?\s+de\s+(.+?)\s+por\s+\$([\d,.]+)/i,
    );

    if (income) {
        transaction.type = "income";
        transaction.merchant = income[1].trim();
        transaction.amount = parseAmount(income[2]);
        transaction.description = `Pago recibido de ${transaction.merchant}`;
        transaction.date = extractDate(body);
        return transaction;
    }

    // ── Compra con tarjeta ─────────────────────────────────────────────────────
    const purchase = body.match(
        /(Compraste|Compra)\s+\$?([\d.,]+)\s+(?:en|a)\s+(.+?)(?:\s|$)/i,
    );

    if (purchase) {
        transaction.type = "expense";
        transaction.amount = parseAmount(purchase[2]);
        transaction.merchant = purchase[3].trim();
        transaction.description = `Compra en ${transaction.merchant}`;
        transaction.date = extractDate(body);
        return transaction;
    }

    // ── Retiro de cajero ───────────────────────────────────────────────────────
    const withdrawal = body.match(/(Retiraste|Retiro)\s+\$?([\d.,]+)/i);

    if (withdrawal) {
        transaction.type = "expense";
        transaction.amount = parseAmount(withdrawal[2]);
        transaction.merchant = "Cajero";
        transaction.description = "Retiro cajero";
        transaction.date = extractDate(body);
        return transaction;
    }

    // ── Transferencia enviada ──────────────────────────────────────────────────
    const transfer = body.match(
        /Transferiste\s+\$?([\d.,]+)\s+a\s+(.+?)(?:\s|$)/i,
    );

    if (transfer) {
        // Las transferencias enviadas reducen el balance igual que un gasto
        transaction.type = "transfer";
        transaction.amount = parseAmount(transfer[1]);
        transaction.merchant = transfer[2].trim();
        transaction.description = `Transferencia a ${transaction.merchant}`;
        transaction.date = extractDate(body);
        return transaction;
    }

    return null;
};

// ─── Helpers internos ─────────────────────────────────────────────────────────

/**
 * Convierte HTML a texto plano usando html-to-text, o devuelve el cuerpo sin
 * modificaciones si ya es texto plano.
 *
 * @param {string} body     - Cuerpo del correo.
 * @param {string} mimeType - 'text/html' o 'text/plain'.
 * @returns {string} Texto normalizado.
 */
function normalizeBody(body, mimeType) {
    if (mimeType === "text/html") {
        return htmlToText(body, {
            wordwrap: false,
            selectors: [{ selector: "img", format: "skip" }],
        });
    }
    return body;
}

/**
 * Limpia ruido del cuerpo del correo: URLs de imágenes, logos y
 * espacios múltiples que interfieren con los patrones regex.
 *
 * @param {string} text - Texto a limpiar.
 * @returns {string} Texto limpio.
 */
function cleanText(text) {
    return text
        .replace(/\[https?:\/\/.*?\]/g, "")
        .replace(/Logo Bancolombia/gi, "")
        .replace(/yellow-icon/gi, "")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Parsea un string de monto en formato colombiano (puntos como separador
 * de miles y coma como separador decimal) a número flotante.
 *
 * @param {string} value - String del monto, ej: "1.500.000" o "25,99".
 * @returns {number} Monto como número.
 */
function parseAmount(value) {
    const clean = value.replace(/[^\d.,]/g, "");

    // Si la coma es el separador decimal (ej: "1.500,00")
    if (
        clean.includes(",") &&
        clean.lastIndexOf(",") > clean.lastIndexOf(".")
    ) {
        return parseFloat(clean.replace(/\./g, "").replace(",", "."));
    }

    // Si el punto es el separador decimal (ej: "1500.00")
    return parseFloat(clean.replace(/,/g, ""));
}

/**
 * Extrae la fecha del correo a partir del patrón DD/MM/YY HH:MM.
 * Retorna la fecha actual como fallback si no se encuentra el patrón.
 *
 * @param {string} text - Cuerpo del correo ya limpio.
 * @returns {Date} Fecha de la transacción.
 */
function extractDate(text) {
    const match = text.match(/(\d{2})\/(\d{2})\/(\d{2,4}).*?(\d{2}:\d{2})/);

    if (match) {
        const day = match[1];
        const month = match[2];
        const year = match[3].length === 2 ? "20" + match[3] : match[3];
        return new Date(`${year}-${month}-${day} ${match[4]}`);
    }

    return new Date();
}
