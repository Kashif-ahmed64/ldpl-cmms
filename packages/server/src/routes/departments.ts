import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/', async (_req, res) => {
  const departments = await prisma.department.findMany({
    where: { deletedAt: null, isActive: true },
    orderBy: { name: 'asc' },
  });
  res.json({ departments });
});

export default router;
