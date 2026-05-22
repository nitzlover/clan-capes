import bcrypt from 'bcryptjs';
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret';

export async function verifyAdmin(username: string, password: string): Promise<boolean> {
  const expectedUser = process.env.ADMIN_USERNAME ?? 'admin';
  const expectedPass = process.env.ADMIN_PASSWORD ?? 'admin';
  if (username !== expectedUser) {
    return false;
  }
  // Allow plain env password in dev; production should store bcrypt hash in env ADMIN_PASSWORD_HASH
  if (process.env.ADMIN_PASSWORD_HASH) {
    return bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);
  }
  return password === expectedPass;
}

export function signToken(username: string): string {
  return jwt.sign({ sub: username, role: 'admin' }, JWT_SECRET, { expiresIn: '12h' });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
    (req as Request & { user?: string }).user = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: 'invalid token' });
  }
}
