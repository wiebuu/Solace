import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { User } from '../models/User.js';
import { signToken } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';
import { publicUser } from './me.js';

export const authRouter = Router();

const signupSchema = z.object({
  name: z.string().trim().min(1, 'Tell us your name').max(60),
  email: z.string().trim().email('That email looks off'),
  password: z.string().min(8, 'Password needs at least 8 characters'),
});

authRouter.post('/signup', async (req, res) => {
  const body = signupSchema.parse(req.body);
  if (await User.exists({ email: body.email.toLowerCase() })) {
    throw new HttpError(409, 'An account with this email already exists');
  }
  const user = await User.create({
    name: body.name,
    email: body.email,
    passwordHash: await bcrypt.hash(body.password, 10),
  });
  res.status(201).json({ token: signToken(user.id), user: publicUser(user) });
});

const loginSchema = z.object({ email: z.string().trim().email('That email looks off'), password: z.string().min(1) });

authRouter.post('/login', async (req, res) => {
  const body = loginSchema.parse(req.body);
  const user = await User.findOne({ email: body.email.toLowerCase() });
  if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
    throw new HttpError(401, 'Email or password is incorrect');
  }
  res.json({ token: signToken(user.id), user: publicUser(user) });
});
