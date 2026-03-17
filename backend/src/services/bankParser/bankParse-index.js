/**
 * @file src/services/bankParser/index.js
 * @description Punto de entrada del sistema de parseo de correos bancarios.
 *
 * Responsabilidades:
 *   1. Detectar el banco remitente del correo usando el dominio del header "From".
 *   2. Extraer el cuerpo del correo (prefiere text/plain sobre text/html).
 *   3. Delegar el parseo al parser específico del banco detectado.
 *   4. Agregar el gmail_message_id a la transacción para evitar duplicados.
 *
 * Para agregar soporte de un banco nuevo:
 *   1. Agregar su dominio a BANK_SENDERS.
 *   2. Crear su parser en ./nombreBancoParser.js.
 *   3. Agregar el import y el case correspondiente en parseTransaction().
 */

import { parseBancolombiaEmail } from "./bancolombiaParser.js";

/**
 * Mapa de bancos a los dominios de email que usan para notificaciones.
 * Se usa includes() en el header completo para cubrir variaciones de formato.
 */
const BANK_SENDERS = {
    bancolombia: ["notificacionesbancolombia.com"],
    davivienda: ["davivienda.com"],
    bogota: ["bancodebogota.com.co"],
};

/**
 * Detecta el banco a partir del header "From" del correo.
 *
 * @param {string} fromHeader - Valor del header From, ej: '"Bancolombia" <no-reply@notificacionesbancolombia.com>'.
 * @returns {'bancolombia'|'davivienda'|'bogota'|null} Nombre del banco o null si no se reconoce.
 */
const detectBank = (fromHeader) => {
    const from = fromHeader?.toLowerCase() || "";
    if (BANK_SENDERS.bancolombia.some((s) => from.includes(s)))
        return "bancolombia";
    if (BANK_SENDERS.davivienda.some((s) => from.includes(s)))
        return "davivienda";
    if (BANK_SENDERS.bogota.some((s) => from.includes(s))) return "bogota";
    return null;
};

/**
 * Parsea un correo bancario completo (formato de la Gmail API) y extrae
 * la transacción financiera si es reconocida.
 *
 * Flujo:
 *   1. Extrae el cuerpo del correo (text/plain preferido, text/html como fallback).
 *   2. Detecta el banco por el remitente.
 *   3. Llama al parser específico del banco.
 *   4. Agrega el gmail_message_id para control de duplicados.
 *
 * @param {object} emailData - Objeto mensaje de Gmail API (formato "full").
 * @returns {object|null} Transacción con gmail_message_id, o null si no se reconoce.
 */
export const parseTransaction = (emailData) => {
    const parts = emailData.payload.parts || [emailData.payload];
    let body = "";
    let mimeType = "";

    // Preferir texto plano (más limpio para los patrones regex)
    for (const part of parts) {
        if (part.mimeType === "text/plain" && part.body?.data) {
            body = Buffer.from(part.body.data, "base64").toString("utf-8");
            mimeType = "text/plain";
            break;
        }
    }

    // Fallback a HTML si no hay texto plano
    if (!body) {
        for (const part of parts) {
            if (part.mimeType === "text/html" && part.body?.data) {
                body = Buffer.from(part.body.data, "base64")
                    .toString("utf-8")
                    .replace(/<[^>]+>/g, " ")
                    .replace(/\s+/g, " ")
                    .trim();
                mimeType = "text/html";
                break;
            }
        }
    }

    // Detectar banco por remitente
    const fromHeader = emailData.payload.headers.find(
        (h) => h.name === "From",
    )?.value;
    const bank = detectBank(fromHeader);

    if (!bank) return null;

    // Parsear según banco detectado
    let transaction = null;
    if (bank === "bancolombia") transaction = parseBancolombiaEmail(body, mimeType);
    // Davivienda y Banco de Bogotá se agregan cuando haya correos reales para testear

    if (!transaction) return null;

    // Agregar ID del mensaje para evitar duplicados al re-sincronizar
    transaction.gmailMessageId = emailData.id;

    return transaction;
};
