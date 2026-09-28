// src/routes/admin.routes.ts
import { Router, Response } from 'express';
import { authenticate, requireAdmin, AuthRequest } from '../middlewares/auth.middleware';
import {
  getSpendStatus,
  activateKillSwitch,
  deactivateKillSwitch,
} from '../services/llm-budget.service';

const router = Router();

router.use(authenticate, requireAdmin);

router.get('/', (_req, res) => {
  res.json({ success: true, data: { message: 'Admin endpoint' } });
});

/** Today's LLM spend against the cap, and whether the kill switch is on. */
router.get('/ai/spend', async (_req: AuthRequest, res: Response) => {
  try {
    res.json({ success: true, data: await getSpendStatus() });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/** Manual kill switch — degrades the agent to plain search immediately. */
router.post('/ai/kill', async (req: AuthRequest, res: Response) => {
  const reason = typeof req.body?.reason === 'string' ? req.body.reason : 'manual';
  await activateKillSwitch(`manual: ${reason} (by ${req.userId})`);
  res.json({ success: true, data: await getSpendStatus() });
});

/** Clears the kill switch for today. Spend continues from where it was. */
router.post('/ai/resume', async (_req: AuthRequest, res: Response) => {
  await deactivateKillSwitch();
  res.json({ success: true, data: await getSpendStatus() });
});

export { router as adminRouter };
export default router;
