/**
 * API Route: /api/admin/login
 * Simple password-based admin auth using signed cookies
 * No in-memory state — works correctly with serverless/edge
 */

import { cookies } from 'next/headers';
import crypto from 'crypto';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme123';
const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY || 'fallback-secret-key';

/**
 * Create a signed admin token that can be verified without server state
 */
function createSignedToken() {
    const payload = {
        role: 'admin',
        iat: Date.now(),
        exp: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
    };
    const data = JSON.stringify(payload);
    const encoded = Buffer.from(data).toString('base64url');
    const signature = crypto.createHmac('sha256', SECRET).update(encoded).digest('base64url');
    return `${encoded}.${signature}`;
}

/**
 * Verify a signed token
 */
function verifyToken(token) {
    if (!token || !token.includes('.')) return false;

    const [encoded, signature] = token.split('.');
    const expectedSig = crypto.createHmac('sha256', SECRET).update(encoded).digest('base64url');

    if (signature !== expectedSig) return false;

    try {
        const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString());
        if (payload.exp < Date.now()) return false;
        if (payload.role !== 'admin') return false;
        return true;
    } catch {
        return false;
    }
}

// POST: Login
export async function POST(request) {
    const body = await request.json();
    const { password } = body;

    if (!password) {
        return Response.json({ error: 'Password is required' }, { status: 400 });
    }

    if (password !== ADMIN_PASSWORD) {
        return Response.json({ error: 'Invalid password' }, { status: 401 });
    }

    const token = createSignedToken();

    const cookieStore = await cookies();
    cookieStore.set('admin_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24,
        path: '/',
    });

    return Response.json({ success: true });
}

// GET: Check if authenticated
export async function GET() {
    const cookieStore = await cookies();
    const token = cookieStore.get('admin_token')?.value;
    const authenticated = verifyToken(token);
    return Response.json({ authenticated });
}

// DELETE: Logout
export async function DELETE() {
    const cookieStore = await cookies();
    cookieStore.delete('admin_token');
    return Response.json({ success: true });
}

// Export verifyToken for use by other routes
export { verifyToken };
