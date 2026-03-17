export function detectBySimilarity(transaction, categories) {
    const text =
        `${transaction.description || ""} ${transaction.merchant || ""}`.toLowerCase();

    for (const cat of categories) {
        const name = cat.name.toLowerCase();

        if (text.includes(name)) {
            return cat.id;
        }
    }

    return null;
}
