import { Router } from 'express';
import { signToken, verifyAdmin } from '../lib/auth.js';

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  const { username, password } = req.body ?? {};
  const ip = req.ip ?? req.socket.remoteAddress ?? '-';
  if (!username || !password) {
    res.status(400).json({ error: 'username and password required' });
    return;
  }
  const ok = await verifyAdmin(username, password);
  if (!ok) {
    console.warn(`[auth] login FAIL user=${username} ip=${ip}`);
    res.status(401).json({ error: 'invalid credentials' });
    return;
  }
  console.log(`[auth] login OK user=${username} ip=${ip}`);
  res.json({ token: signToken(username) });
});
