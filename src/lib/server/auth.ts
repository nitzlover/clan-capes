import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ADMIN_PASSWORD, ADMIN_PASSWORD_HASH, ADMIN_USERNAME, JWT_SECRET } from './env';

export type JwtPayload = { sub: string; role: 'admin' };

export async function verifyAdmin(username: string, password: string): Promise<boolean> {
  if (username !== ADMIN_USERNAME) return false;
  if (ADMIN_PASSWORD_HASH) return bcrypt.compare(password, ADMIN_PASSWORD_HASH);
  return password === ADMIN_PASSWORD;
}

export function signToken(username: string): string {
  return jwt.sign({ sub: username, role: 'admin' as const }, JWT_SECRET, { expiresIn: '12h' });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

/**
 * Pull `Authorization: Bearer <token>` from the incoming Next.js Request and
 * return the verified payload, or null if missing/invalid. Route handlers use:
 *
 *   const user = requireAuth(req);
 *   if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
 */
export function requireAuth(req: Request): JwtPayload | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return verifyToken(header.slice(7));
}
