/**
 * @file src/services/category/categoryRules.js
 * @description Clasificación de transacciones por reglas de palabras clave.
 *
 * Es el primer filtro (más rápido y sin costo) en la cadena de categorización:
 *   1. Reglas deterministas ← este módulo
 *   2. Caché por merchant
 *   3. Similitud de texto
 *   4. IA como último recurso
 *
 * Para ampliar el soporte de merchants, agregar palabras clave a CATEGORY_RULES.
 * Las claves del objeto deben coincidir con el nombre (en minúsculas) de una
 * categoría existente en la base de datos.
 */

/**
 * Mapa de nombre de categoría → palabras clave que la activan.
 * La búsqueda es de tipo includes() sobre el texto combinado de
 * description + merchant, normalizado a minúsculas.
 */
const CATEGORY_RULES = {
    food: ["restaurant", "pizza", "burger", "kfc", "mcdonald", "starbucks"],
    transport: ["uber", "didi", "taxi", "cabify"],
    entertainment: ["netflix", "spotify", "steam", "playstation"],
    subscriptions: ["netflix", "spotify", "prime", "apple"],
};

/**
 * Intenta clasificar una transacción usando las reglas de palabras clave.
 *
 * @param {object} transaction        - Transacción a clasificar.
 * @param {string} [transaction.description] - Descripción del movimiento.
 * @param {string} [transaction.merchant]    - Nombre del comercio.
 * @param {Array}  categories         - Lista de categorías disponibles [{id, name}].
 * @returns {number|null} ID de la categoría encontrada, o null si no hay coincidencia.
 */
export function detectByRules(transaction, categories) {
    const text = (
        (transaction.description || "") +
        " " +
        (transaction.merchant || "")
    ).toLowerCase();

    for (const categoryName in CATEGORY_RULES) {
        const keywords = CATEGORY_RULES[categoryName];

        for (const keyword of keywords) {
            if (text.includes(keyword)) {
                const category = categories.find(
                    (c) => c.name.toLowerCase() === categoryName,
                );
                if (category) return category.id;
            }
        }
    }

    return null;
}
