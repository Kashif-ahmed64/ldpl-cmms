import type { AuditAction, AuditResult } from '@prisma/client';
import { prisma } from './prisma.js';

interface AuditLogInput {
  userId?: string;
  ipAddress?: string;
  module: string;
  action: AuditAction;
  recordId?: string;
  oldValue?: unknown;
  newValue?: unknown;
  result?: AuditResult;
}

export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId,
        ipAddress: input.ipAddress,
        module: input.module,
        action: input.action,
        recordId: input.recordId,
        oldValue: input.oldValue ? (input.oldValue as object) : undefined,
        newValue: input.newValue ? (input.newValue as object) : undefined,
        result: input.result ?? 'success',
      },
    });
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
}

export function sanitizeUser(user: Record<string, unknown>) {
  const { passwordHash, failedLoginCount, lockedUntil, ...safe } = user;
  return safe;
}
