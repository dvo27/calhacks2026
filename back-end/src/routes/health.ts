import { Router } from 'express';
import { supabase } from '../services/supabase.js';

export function createHealthRouter() {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.status(200).json({ ok: true });
  });

  router.get('/api/health', async (_req, res) => {
    try {
      const { error } = await supabase.from('trips').select('id').limit(1);

      if (error) {
        res.status(500).json({
          status: 'error',
          message: 'API is up, but Supabase access failed.',
          details: error.message,
        });
        return;
      }

      res.status(200).json({ status: 'healthy', supabase: true });
    } catch (error: any) {
      res.status(500).json({ status: 'crash', error: error.message });
    }
  });

  return router;
}
