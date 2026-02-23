/**
 * API Route: /api/auth/users
 * GET  - List all auth users (admin only)
 * POST - Create a new user (admin only)
 * DELETE - Delete a user (admin only)
 */

import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// Admin auth check using service role
function getServiceClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );
}

async function verifyAdmin(request) {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return null;

    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return null;

    // Check if user has admin role in metadata
    if (user.user_metadata?.role !== 'admin') return null;

    return user;
}

export async function GET(request) {
    const admin = await verifyAdmin(request);
    if (!admin) {
        return Response.json({ error: 'Unauthorized — admin access required' }, { status: 403 });
    }

    try {
        const supabase = getServiceClient();
        const { data: { users }, error } = await supabase.auth.admin.listUsers();

        if (error) {
            return Response.json({ error: error.message }, { status: 500 });
        }

        return Response.json({
            users: users.map(u => ({
                id: u.id,
                email: u.email,
                role: u.user_metadata?.role || 'viewer',
                created_at: u.created_at,
                last_sign_in_at: u.last_sign_in_at,
            })),
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request) {
    const admin = await verifyAdmin(request);
    if (!admin) {
        return Response.json({ error: 'Unauthorized — admin access required' }, { status: 403 });
    }

    try {
        const { email, password, role } = await request.json();

        if (!email || !password) {
            return Response.json({ error: 'Email and password are required' }, { status: 400 });
        }

        if (password.length < 6) {
            return Response.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
        }

        const userRole = role === 'admin' ? 'admin' : 'viewer';

        const supabase = getServiceClient();
        const { data, error } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true, // Skip email verification
            user_metadata: { role: userRole },
        });

        if (error) {
            return Response.json({ error: error.message }, { status: 400 });
        }

        return Response.json({
            user: {
                id: data.user.id,
                email: data.user.email,
                role: userRole,
            },
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(request) {
    const admin = await verifyAdmin(request);
    if (!admin) {
        return Response.json({ error: 'Unauthorized — admin access required' }, { status: 403 });
    }

    try {
        const { userId } = await request.json();

        if (!userId) {
            return Response.json({ error: 'User ID is required' }, { status: 400 });
        }

        if (userId === admin.id) {
            return Response.json({ error: 'Cannot delete your own account' }, { status: 400 });
        }

        const supabase = getServiceClient();
        const { error } = await supabase.auth.admin.deleteUser(userId);

        if (error) {
            return Response.json({ error: error.message }, { status: 400 });
        }

        return Response.json({ success: true });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
}
