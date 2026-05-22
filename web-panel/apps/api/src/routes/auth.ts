import { Router } from 'express';
import { signToken, verifyAdmin } from '../lib/auth.js';

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) {
    res.status(400).json({ error: 'username and password required' });
    return;
  }
  const ok = await verifyAdmin(username, password);
  if (!ok) {
    res.status(401).json({ error: 'invalid credentials' });
    return;
  }
  res.json({ token: signToken(username) });
});
