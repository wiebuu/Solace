import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/** The signed-in user's id; only valid on routes behind requireAuth. */
export function uid(req: Request): string {
  if (!req.userId) throw new Error('uid() used on an unauthenticated route');
  return req.userId;
}

export function signToken(userId: string) {
  return jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: '60d' });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not signed in' });
  try {
    const payload = jwt.verify(token, config.jwtSecret) as { sub: string };
    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: 'Session expired, please sign in again' });
  }
}
