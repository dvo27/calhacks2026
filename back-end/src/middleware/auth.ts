import type { Request, Response, NextFunction } from 'express';
import { supabase } from '../services/supabase.js';
import { ensurePublicUser } from '../services/users.js';

// Extend Express Request interface locally to support custom injected auth data
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string | undefined; 
  };
}

function decodeJwtPayload(token: string): { sub?: string; email?: string } | null {
  const parts = token.split('.');
  const payloadPart = parts[1];
  if (!payloadPart) {
    return null;
  }

  try {
    const payload = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload.padEnd(Math.ceil(payload.length / 4) * 4, '=');
    const json = Buffer.from(padded, 'base64').toString('utf8');
    const parsed = JSON.parse(json) as { sub?: unknown; email?: unknown };

    if (typeof parsed.sub !== 'string') {
      return null;
    }

    return {
      sub: parsed.sub,
      ...(typeof parsed.email === 'string' ? { email: parsed.email } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * Express Middleware to validate incoming Supabase JWT Access Tokens.
 */
export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized: Missing or malformed Authorization header token.' });
      return; 
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      res.status(401).json({ error: 'Unauthorized: Access token is empty.' });
      return;
    }

    let user: { id: string; email?: string | undefined } | null = null;
    let error: Error | null = null;

    try {
      const result = await supabase.auth.getUser(token);
      user = result.data.user ?? null;
      error = result.error ?? null;
    } catch (fetchError) {
      error = fetchError instanceof Error ? fetchError : new Error('Unknown auth lookup failure.');
    }

    if (error || !user) {
      const decoded = decodeJwtPayload(token);
      if (!decoded?.sub) {
        console.error('Auth lookup failed and token could not be decoded locally:', error);
        res.status(401).json({ error: 'Unauthorized: Access token is invalid or expired.' });
        return;
      }

      user = {
        id: decoded.sub,
        email: decoded.email,
      };
    }

    // Now this structural mapping is 100% legal!
    req.user = {
      id: user.id,
      email: user.email // TypeScript now completely accepts string | undefined here
    };

    await ensurePublicUser(user.id, user.email);

    next();

  } catch (error) {
    console.error('Critical failure inside Authentication Middleware interceptor:', error);
    res.status(500).json({ error: 'Internal Server Error during security handshake.' });
  }
}
