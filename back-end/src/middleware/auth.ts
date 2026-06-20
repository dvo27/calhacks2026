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

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      res.status(401).json({ error: 'Unauthorized: Access token is invalid or expired.' });
      return;
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
