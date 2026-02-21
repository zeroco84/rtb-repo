#!/usr/bin/env node
// Debug: show full extracted text from a dispute PDF
import { createClient } from '@supabase/supabase-js';

const DR_NO = process.argv[2] || 'DR0425-104598';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: dispute } = await supabase.from('disputes').select('*').ilike('dr_no', `%${DR_NO}%`).single();
if (!dispute) { console.log('Not found'); process.exit(1); }

const pdfUrl = dispute.pdf_urls?.[0]?.url;
const res = await fetch(pdfUrl);
const buffer = Buffer.from(await res.arrayBuffer());

const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default;
const data = await pdfParse(buffer);

console.log('Pages:', data.numpages);
console.log('Text length:', data.text.length);
console.log('\n--- FULL TEXT (last 2000 chars) ---');
console.log(data.text.slice(-2000));
