/**
 * API Route: /api/auth
 * POST - Sign in with email/password
 * DELETE - Sign out
 */

import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function POST(request) {
    try {
        const { email, password } = await request.json();

        if (!email || !password) {
            return Response.json({ error: 'Email and password are required' }, { status: 400 });
        }

        const supabase = createClient(supabaseUrl, supabaseAnonKey);
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) {
            return Response.json({ error: error.message }, { status: 401 });
        }

        return Response.json({
            user: {
                id: data.user.id,
                email: data.user.email,
            },
            session: {
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token,
                expires_at: data.session.expires_at,
            },
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
}
