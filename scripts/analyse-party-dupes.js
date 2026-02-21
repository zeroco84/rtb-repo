#!/usr/bin/env node
// Analyse party name variants and find merge candidates
const { createClient } = require('@supabase/supabase-js');
const s = createClient(
    'https://snxlzlkdnnxgixsuhuoo.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNueGx6bGtkbm54Z2l4c3VodW9vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTYxMzUxMSwiZXhwIjoyMDg3MTg5NTExfQ.QCAlYpEDbFeKL3FXwQ6M2oSYE2E1vCwbYkNUHiCE2VY'
);

// Legal suffixes to strip for matching
const LEGAL_SUFFIXES = [
    'limited', 'ltd', 'ltd.', 'plc', 'plc.', 'inc', 'inc.',
    'dac', 'dac.', 'clg', 'uc', 'teoranta',
    'company', 'co', 'co.', 'corp', 'corporation',
    'properties', 'property', 'management', 'investments',
    'residential', 'fund', 'reit',
    't/a', 'trading as',
];

function normalizeForMatching(name) {
    if (!name) return '';
    let n = name.toLowerCase().trim();
    // Remove punctuation
    n = n.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()'"]/g, ' ');
    // Remove legal suffixes iteratively
    let changed = true;
    while (changed) {
        changed = false;
        for (const suffix of LEGAL_SUFFIXES) {
            const pattern = new RegExp('\\b' + suffix.replace('.', '\\.?') + '\\s*$', 'i');
            const before = n;
            n = n.replace(pattern, '').trim();
            if (n !== before) changed = true;
        }
    }
    // Collapse whitespace
    n = n.replace(/\s+/g, ' ').trim();
    return n;
}

(async () => {
    // Get all parties with >1 dispute
    const { data: parties } = await s.from('parties')
        .select('id, name, normalized_name, party_type, total_disputes')
        .gte('total_disputes', 1)
        .order('total_disputes', { ascending: false });

    console.log('Total parties with disputes:', parties.length);

    // Group by normalized key
    const groups = {};
    for (const p of parties) {
        const key = normalizeForMatching(p.name);
        if (!groups[key]) groups[key] = [];
        groups[key].push(p);
    }

    // Find groups with multiple entries (merge candidates)
    const mergeGroups = Object.entries(groups)
        .filter(([k, v]) => v.length > 1)
        .sort((a, b) => {
            const totalA = a[1].reduce((s, p) => s + p.total_disputes, 0);
            const totalB = b[1].reduce((s, p) => s + p.total_disputes, 0);
            return totalB - totalA;
        });

    console.log('Merge candidate groups:', mergeGroups.length);
    console.log('Total parties to merge:', mergeGroups.reduce((s, [, v]) => s + v.length, 0));

    mergeGroups.slice(0, 15).forEach(([key, members]) => {
        const totalDisputes = members.reduce((s, p) => s + p.total_disputes, 0);
        console.log(`\n  "${key}" (${totalDisputes} total disputes):`);
        members.forEach(p => {
            console.log(`    - "${p.name}" (${p.total_disputes} disputes, id: ${p.id.substring(0, 8)})`);
        });
    });
})();
