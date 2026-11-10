import { Router } from 'express';
import { Memory } from '../models/Memory.js';
import { uid } from '../middleware/auth.js';

export const memoriesRouter = Router();

memoriesRouter.get('/', async (req, res) => {
  const userId = uid(req);
  const memories = await Memory.find({ user: userId }).sort({ createdAt: -1 }).lean();
  res.json({ memories });
});

memoriesRouter.delete('/:id', async (req, res) => {
  const userId = uid(req);
  await Memory.deleteOne({ _id: req.params.id, user: userId });
  res.status(204).end();
});
