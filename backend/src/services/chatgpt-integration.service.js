/**
 * @file src/services/chatgpt-integration.service.js
 * @description Clasificación de transacciones por IA usando GPT-4.1-nano.
 *
 * Se usa como último recurso en la cadena de categorización de gmailService.js,
 * después de reglas, caché y similitud. Solo se llama cuando los tres métodos
 * anteriores no encuentran una categoría.
 *
 * El modelo recibe la lista de categorías disponibles para el usuario y el
 * concepto de la transacción, y devuelve el ID y nombre de la categoría más
 * adecuada en formato JSON estricto.
 *
 * Modelo: gpt-4.1-nano — optimizado para tareas de clasificación simples
 * con bajo costo por token.
 */

import OpenAI from "openai";
import { categoryService } from "./categoryService.js";

const client = new OpenAI();

/**
 * Clasifica una transacción en una de las categorías disponibles del usuario
 * usando inteligencia artificial.
 *
 * @param {string} concepto - Descripción de la transacción, ej: "RAPPI COLOMBIA PAGO".
 * @param {number} userId   - ID del usuario (para cargar sus categorías).
 * @returns {Promise<{categoryId: number, categoryName: string}>}
 * @throws {Error} Si la respuesta de la IA está vacía o no tiene categorías disponibles.
 */
export const setCategorie = async (concepto, userId) => {
    try {
        const categories = await categoryService.list(userId);

        if (!categories || categories.length === 0) {
            throw new Error("No categories found for user");
        }

        // Reducir la información enviada al modelo para minimizar tokens
        const formattedCategories = categories.map((c) => ({
            id: c.id,
            name: c.name,
        }));

        const response = await client.chat.completions.create({
            model: "gpt-4.1-nano",
            response_format: { type: "json_object" },
            messages: [
                {
                    role: "system",
                    content: `
Eres un asistente que clasifica gastos.

Recibirás:
- Una lista de categorías con id y name
- La descripción de un gasto (concepto)

Debes seleccionar SOLO una categoría de la lista.

Responde exclusivamente con este JSON:

{
  "categoryId": "id_de_la_categoria",
  "categoryName": "nombre_de_la_categoria"
}

Reglas:
- Solo puedes usar categorías de la lista.
- No inventes categorías.
- No devuelvas texto adicional.
- El id debe ser siempre numérico.
`,
                },
                {
                    role: "user",
                    content: JSON.stringify({
                        categories: formattedCategories,
                        concepto,
                    }),
                },
            ],
        });

        const content = response.choices?.[0]?.message?.content;

        if (!content) {
            throw new Error("Empty response from AI");
        }

        return JSON.parse(content);
    } catch (error) {
        console.error("Error classifying category:", error);
        throw error;
    }
};
