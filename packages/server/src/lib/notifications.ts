import type { Server } from 'socket.io';
import type { NotificationType } from '@prisma/client';
import { prisma } from './prisma.js';

interface NotifyInput {
  recipientId: string;
  title: string;
  message: string;
  type?: NotificationType;
  module?: string;
  recordId?: string;
  io?: Server;
}

export async function notifyUser(input: NotifyInput) {
  const notification = await prisma.notification.create({
    data: {
      recipientId: input.recipientId,
      title: input.title,
      message: input.message,
      type: input.type ?? 'info',
      module: input.module,
      recordId: input.recordId,
    },
  });

  input.io?.to(`user:${input.recipientId}`).emit('notification', notification);
  return notification;
}

export async function notifyRoles(
  roles: string[],
  input: Omit<NotifyInput, 'recipientId'>,
) {
  const users = await prisma.user.findMany({
    where: { role: { in: roles as never[] }, isActive: true, deletedAt: null },
    select: { id: true },
  });

  await Promise.all(users.map((u) => notifyUser({ ...input, recipientId: u.id })));
}
