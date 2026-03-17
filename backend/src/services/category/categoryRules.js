const CATEGORY_RULES = {
    food: ["restaurant", "pizza", "burger", "kfc", "mcdonald", "starbucks"],
    transport: ["uber", "didi", "taxi", "cabify"],
    entertainment: ["netflix", "spotify", "steam", "playstation"],
    subscriptions: ["netflix", "spotify", "prime", "apple"],
};

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
