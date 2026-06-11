import { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';

export const INVENTORY_CATEGORIES = [
  'mechanical',
  'electrical',
  'instrumentation',
  'consumable',
  'civil',
  'it',
] as const;

export const UNITS_OF_MEASURE = ['Nos', 'Kg', 'Litre', 'Metres', 'Set', 'Box'] as const;

export const TRANSACTION_TYPES = [
  'receipt',
  'issue',
  'return',
  'adjustment',
  'scrap',
  'transfer',
] as const;

export const itemInclude = {
  preferredVendor: { select: { id: true, name: true, code: true } },
  _count: { select: { transactions: true } },
};

export type ItemWithRelations = Prisma.InventoryItemGetPayload<{ include: typeof itemInclude }>;

export function serializeItem(item: ItemWithRelations) {
  const stock = Number(item.currentStock);
  const cost = Number(item.unitCost);
  return {
    ...item,
    currentStock: stock,
    minimumStock: Number(item.minimumStock),
    maximumStock: item.maximumStock ? Number(item.maximumStock) : null,
    reorderQuantity: item.reorderQuantity ? Number(item.reorderQuantity) : null,
    unitCost: cost,
    totalStockValue: Math.round(stock * cost * 100) / 100,
    stockStatus: getStockStatus(stock, Number(item.minimumStock), item.isCritical),
  };
}

export function getStockStatus(
  current: number,
  minimum: number,
  isCritical: boolean,
): 'ok' | 'low' | 'zero' | 'critical_zero' {
  if (current <= 0 && isCritical) return 'critical_zero';
  if (current <= 0) return 'zero';
  if (current < minimum) return 'low';
  return 'ok';
}

export async function generateItemCode(): Promise<string> {
  const config = await prisma.systemConfig.findUnique({ where: { key: 'app_settings' } });
  const prefix =
    config?.value && typeof config.value === 'object' && 'itemCodePrefix' in config.value
      ? String((config.value as { itemCodePrefix: string }).itemCodePrefix)
      : 'ITM';

  const last = await prisma.inventoryItem.findFirst({
    where: { itemCode: { startsWith: `${prefix}-` } },
    orderBy: { itemCode: 'desc' },
  });

  let nextNum = 1;
  if (last) {
    const match = last.itemCode.match(/-(\d+)$/);
    if (match) nextNum = parseInt(match[1], 10) + 1;
  }

  return `${prefix}-${String(nextNum).padStart(5, '0')}`;
}

export function serializeTransaction(tx: {
  id: string;
  inventoryItemId: string;
  type: string;
  quantity: Prisma.Decimal;
  unitCost: Prisma.Decimal | null;
  workOrderId: string | null;
  referenceNo: string | null;
  reason: string | null;
  createdAt: Date;
  inventoryItem?: { itemCode: string; name: string };
}) {
  return {
    ...tx,
    quantity: Number(tx.quantity),
    unitCost: tx.unitCost ? Number(tx.unitCost) : null,
  };
}
