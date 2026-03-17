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

    // =====================
    // RECIBISTE DINERO
    // =====================

    // const income = body.match(
    //   /Recibiste\s+\$?([\d.,]+).*?de\s+(.+?)\s+(?:en|a)\s+tu\s+cuenta/i
    // );

    // if (income) {
    //   transaction.type = "income";
    //   transaction.amount = parseAmount(income[1]);
    //   transaction.merchant = income[2].trim();
    //   transaction.description = `Pago recibido de ${transaction.merchant}`;
    //   transaction.date = extractDate(body);

    //   return transaction;
    // }

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

    // =====================
    // COMPRA TARJETA
    // =====================

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

    // =====================
    // RETIRO
    // =====================

    const withdrawal = body.match(/(Retiraste|Retiro)\s+\$?([\d.,]+)/i);

    if (withdrawal) {
        transaction.type = "expense";
        transaction.amount = parseAmount(withdrawal[2]);
        transaction.merchant = "Cajero";
        transaction.description = "Retiro cajero";
        transaction.date = extractDate(body);

        return transaction;
    }

    // =====================
    // TRANSFERENCIA ENVIADA
    // =====================

    const transfer = body.match(
        /Transferiste\s+\$?([\d.,]+)\s+a\s+(.+?)(?:\s|$)/i,
    );

    if (transfer) {
        transaction.type = "transfer";
        transaction.amount = parseAmount(transfer[1]);
        transaction.merchant = transfer[2].trim();
        transaction.description = `Transferencia a ${transaction.merchant}`;
        transaction.date = extractDate(body);

        return transaction;
    }

    return null;
};

// =====================
// HELPERS
// =====================

function normalizeBody(body, mimeType) {
    if (mimeType === "text/html") {
        return htmlToText(body, {
            wordwrap: false,
            selectors: [{ selector: "img", format: "skip" }],
        });
    }

    return body;
}

function cleanText(text) {
    return text
        .replace(/\[https?:\/\/.*?\]/g, "")
        .replace(/Logo Bancolombia/gi, "")
        .replace(/yellow-icon/gi, "")
        .replace(/\s+/g, " ")
        .trim();
}

function parseAmount(value) {
    const clean = value.replace(/[^\d.,]/g, "");

    // si el decimal es coma
    if (
        clean.includes(",") &&
        clean.lastIndexOf(",") > clean.lastIndexOf(".")
    ) {
        return parseFloat(clean.replace(/\./g, "").replace(",", "."));
    }

    // si el decimal es punto
    return parseFloat(clean.replace(/,/g, ""));
}

// function parseAmount(value) {
//   return parseFloat(
//     value
//       .replace(/[^\d,.-]/g, "")
//       .replace(/\./g, "")
//       .replace(",", ".")
//   );
// }

function extractDate(text) {
    // formato: 23/04/25 a las 19:07
    let match = text.match(/(\d{2})\/(\d{2})\/(\d{2,4}).*?(\d{2}:\d{2})/);

    if (match) {
        let day = match[1];
        let month = match[2];
        let year = match[3];

        if (year.length === 2) {
            year = "20" + year;
        }

        return new Date(`${year}-${month}-${day} ${match[4]}`);
    }

    // fallback → hoy
    return new Date();
}
