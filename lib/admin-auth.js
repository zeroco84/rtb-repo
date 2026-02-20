/**
 * Admin authentication helper
 * Uses HMAC-signed cookies — no in-memory state
 */

import { cookies } from 'next/headers';
import crypto from 'crypto';

const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY || 'fallback-secret-key';

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

export async function isAuthenticated() {
    const cookieStore = await cookies();
    const token = cookieStore.get('admin_token')?.value;
    return verifyToken(token);
}

export async function requireAdmin() {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
        return Response.json({ error: 'Unauthorized. Please log in as admin.' }, { status: 401 });
    }
    return null;
}
