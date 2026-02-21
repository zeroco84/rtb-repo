#!/usr/bin/env node
/**
 * Merge duplicate party entities based on normalized names.
 * For each group of duplicates:
 *  1. Keep the party with the most disputes as canonical
 *  2. Re-point all dispute_parties links from duplicates to canonical
 *  3. Delete the duplicate party records
 *  4. Recompute canonical party counts
 */
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
    'https://snxlzlkdnnxgixsuhuoo.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNueGx6bGtkbm54Z2l4c3VodW9vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTYxMzUxMSwiZXhwIjoyMDg3MTg5NTExfQ.QCAlYpEDbFeKL3FXwQ6M2oSYE2E1vCwbYkNUHiCE2VY'
);

const LEGAL_SUFFIXES = [
    'limited', 'ltd', 'plc', 'inc', 'dac', 'clg', 'uc', 'teoranta',
    'company', 'co', 'corp', 'corporation',
];

const BUSINESS_WORDS = [
    'properties', 'property', 'management', 'investments',
    'residential', 'fund', 'reit',
];

function normalizeForMatching(name) {
    if (!name) return '';
    let n = name.toLowerCase().trim();
    // Remove text in parentheses like "(Association)" → use content without parens
    n = n.replace(/[()]/g, ' ');
    // Remove punctuation
    n = n.replace(/[.,\/#!$%\^&\*;:{}=_`~'"]/g, ' ');
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

const DRY_RUN = process.argv.includes('--dry-run');

(async () => {
    console.log(DRY_RUN ? '=== DRY RUN ===' : '=== MERGING PARTIES ===');

    // Get all parties
    const { data: parties } = await supabase.from('parties')
        .select('id, name, normalized_name, party_type, total_disputes')
        .order('total_disputes', { ascending: false });

    // Group by normalized key
    const groups = {};
    for (const p of parties) {
        const key = normalizeForMatching(p.name);
        if (!key) continue;
        if (!groups[key]) groups[key] = [];
        groups[key].push(p);
    }

    const mergeGroups = Object.entries(groups).filter(([, v]) => v.length > 1);
    console.log(`Found ${mergeGroups.length} groups with duplicates (${mergeGroups.reduce((s, [, v]) => s + v.length, 0)} total parties)\n`);

    let mergedCount = 0;
    let deletedCount = 0;

    for (const [key, members] of mergeGroups) {
        // Keep the one with most disputes as canonical
        members.sort((a, b) => b.total_disputes - a.total_disputes);
        const canonical = members[0];
        const dupes = members.slice(1);

        const totalDisputes = members.reduce((s, p) => s + p.total_disputes, 0);
        console.log(`Merging "${key}" → "${canonical.name}" (${totalDisputes} combined disputes)`);
        dupes.forEach(d => console.log(`  ← "${d.name}" (${d.total_disputes} disputes)`));

        if (DRY_RUN) continue;

        for (const dupe of dupes) {
            // Get all dispute links for the duplicate
            const { data: links } = await supabase
                .from('dispute_parties')
                .select('dispute_id, role, party_type')
                .eq('party_id', dupe.id);

            if (links && links.length > 0) {
                for (const link of links) {
                    // Check if canonical already has this link
                    const { data: existing } = await supabase
                        .from('dispute_parties')
                        .select('id')
                        .eq('dispute_id', link.dispute_id)
                        .eq('party_id', canonical.id)
                        .eq('role', link.role)
                        .single();

                    if (existing) {
                        // Already linked — just delete the dupe link
                        await supabase.from('dispute_parties')
                            .delete()
                            .eq('dispute_id', link.dispute_id)
                            .eq('party_id', dupe.id)
                            .eq('role', link.role);
                    } else {
                        // Re-point to canonical
                        await supabase.from('dispute_parties')
                            .update({ party_id: canonical.id })
                            .eq('dispute_id', link.dispute_id)
                            .eq('party_id', dupe.id)
                            .eq('role', link.role);
                    }
                }
            }

            // Delete the duplicate party
            await supabase.from('dispute_parties').delete().eq('party_id', dupe.id);
            await supabase.from('parties').delete().eq('id', dupe.id);
            deletedCount++;
        }

        mergedCount++;
    }

    if (!DRY_RUN && mergedCount > 0) {
        // Recompute all party counts
        console.log('\nRecomputing party counts...');
        const { data: allParties } = await supabase.from('parties').select('id');
        for (const p of allParties) {
            const { data: links } = await supabase
                .from('dispute_parties')
                .select('role, disputes(dispute_date, dr_no)')
                .eq('party_id', p.id);

            if (!links) continue;

            const seen = new Set();
            let total = 0, asApp = 0, asResp = 0;
            for (const link of links) {
                const d = link.disputes;
                if (!d) continue;
                const primaryDR = (d.dr_no || '').split(/\s+/)[0] || 'unknown';
                const caseKey = (d.dispute_date || 'no-date') + '|' + primaryDR;
                if (!seen.has(caseKey)) { seen.add(caseKey); total++; }
                const roleKey = caseKey + '|' + link.role;
                if (link.role === 'Applicant' && !seen.has(roleKey)) { seen.add(roleKey); asApp++; }
                if (link.role === 'Respondent' && !seen.has(roleKey)) { seen.add(roleKey); asResp++; }
            }

            await supabase.from('parties').update({
                total_disputes: total,
                total_as_applicant: asApp,
                total_as_respondent: asResp,
            }).eq('id', p.id);
        }

        await supabase.rpc('recompute_party_awards');
        console.log('Party awards recomputed.');
    }

    console.log(`\nDone. Merged: ${mergedCount} groups, Deleted: ${deletedCount} duplicate parties.`);
})();
