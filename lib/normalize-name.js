/**
 * Shared name normalization for party matching.
 * Strips legal suffixes (Ltd, Plc, etc.) and business words to match
 * entity variants like "IRES Fund Management Ltd." and "IRES REIT Plc".
 */

const LEGAL_SUFFIXES = [
    'limited', 'ltd', 'plc', 'inc', 'dac', 'clg', 'uc', 'teoranta',
    'company', 'co', 'corp', 'corporation', 'unltd',
];

const BUSINESS_WORDS = [
    'properties', 'property', 'management', 'investments',
    'residential', 'fund', 'reit',
];

/**
 * Normalize a party name for matching/deduplication.
 * "IRES Fund Management Ltd." → "ires"
 * "Clúid Housing Association CLG" → "clúid housing association"
 */
export function normalizeName(name) {
    if (!name) return '';
    let n = name.toLowerCase().trim();
    // Remove text in parentheses → treat contents same as without
    n = n.replace(/[()]/g, ' ');
    // Remove punctuation (keep hyphens, ampersands)
    n = n.replace(/[.,\/#!$%\^*;:{}=_`~'"]/g, ' ');
    // Keep hyphens between words
    n = n.replace(/\s*-\s*/g, '-');
    // Remove legal suffixes iteratively
    let changed = true;
    while (changed) {
        changed = false;
        for (const suffix of [...LEGAL_SUFFIXES, ...BUSINESS_WORDS]) {
            const escaped = suffix.replace('.', '\\.');
            const pattern = new RegExp('\\b' + escaped + '\\b\\s*$', 'i');
            const before = n;
            n = n.replace(pattern, '').trim();
            if (n !== before) changed = true;
        }
    }
    n = n.replace(/\s+/g, ' ').trim();
    return n;
}
