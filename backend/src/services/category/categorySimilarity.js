/**
 * @file src/services/category/categorySimilarity.js
 * @description Clasificación de transacciones por similitud de texto.
 *
 * Tercer filtro en la cadena de categorización (después de reglas y caché).
 * Busca si el nombre de alguna categoría aparece dentro del texto de la
 * transacción (description + merchant).
 *
 * Es una búsqueda simple de substring, más flexible que las reglas fijas
 * pero menos precisa que la IA.
 *
 * Ejemplo:
 *   merchant: "SUPERMERCADO ÉXITO" → categoría "Supermercado" coincide.
 *   merchant: "CLARO MOVIL"        → categoría "Servicios" no coincidiría aquí.
 */

/**
 * Intenta clasificar una transacción buscando si el nombre de una categoría
 * está contenido en el texto del movimiento.
 *
 * @param {object} transaction        - Transacción a clasificar.
 * @param {string} [transaction.description] - Descripción del movimiento.
 * @param {string} [transaction.merchant]    - Nombre del comercio.
 * @param {Array}  categories         - Lista de categorías [{id, name}].
 * @returns {number|null} ID de la primera categoría cuyo nombre coincide, o null.
 */
export function detectBySimilarity(transaction, categories) {
    const text =
        `${transaction.description || ""} ${transaction.merchant || ""}`.toLowerCase();

    for (const cat of categories) {
        if (text.includes(cat.name.toLowerCase())) {
            return cat.id;
        }
    }

    return null;
}
