import { Router } from 'express';
import { searchGPUs, GPU_DATABASE } from '../gpuDatabase.js';

export const searchRouter = Router();

// GET /api/search?q=rtx%205070
searchRouter.get('/', (req, res) => {
  const q = String(req.query.q || '').trim();
  res.json(searchGPUs(q));
});

// GET /api/gpus  — full catalog (lets the extension sync its DB from the server)
searchRouter.get('/all', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json(GPU_DATABASE);
});
