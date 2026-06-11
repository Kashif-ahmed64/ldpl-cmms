import { prisma } from './prisma.js';

export async function generatePrNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `PR-${year}-`;
  const last = await prisma.purchaseRequisition.findFirst({
    where: { prNumber: { startsWith: prefix } },
    orderBy: { prNumber: 'desc' },
  });
  let next = 1;
  if (last) {
    const m = last.prNumber.match(/-(\d+)$/);
    if (m) next = parseInt(m[1], 10) + 1;
  }
  return `${prefix}${String(next).padStart(5, '0')}`;
}

export async function generatePoNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `PO-${year}-`;
  const last = await prisma.purchaseOrder.findFirst({
    where: { poNumber: { startsWith: prefix } },
    orderBy: { poNumber: 'desc' },
  });
  let next = 1;
  if (last) {
    const m = last.poNumber.match(/-(\d+)$/);
    if (m) next = parseInt(m[1], 10) + 1;
  }
  return `${prefix}${String(next).padStart(5, '0')}`;
}

export async function generateGrnNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `GRN-${year}-`;
  const last = await prisma.goodsReceivedNote.findFirst({
    where: { grnNumber: { startsWith: prefix } },
    orderBy: { grnNumber: 'desc' },
  });
  let next = 1;
  if (last) {
    const m = last.grnNumber.match(/-(\d+)$/);
    if (m) next = parseInt(m[1], 10) + 1;
  }
  return `${prefix}${String(next).padStart(5, '0')}`;
}

export async function generateVendorCode(): Promise<string> {
  const last = await prisma.vendor.findFirst({
    where: { code: { startsWith: 'VND-' } },
    orderBy: { code: 'desc' },
  });
  let next = 1;
  if (last) {
    const m = last.code.match(/-(\d+)$/);
    if (m) next = parseInt(m[1], 10) + 1;
  }
  return `VND-${String(next).padStart(4, '0')}`;
}

export const vendorInclude = {
  _count: { select: { purchaseOrders: true, inventoryItems: true } },
};

export const prInclude = {
  lineItems: {
    include: { inventoryItem: { select: { id: true, itemCode: true, name: true, unitOfMeasure: true } } },
  },
  purchaseOrders: { select: { id: true, poNumber: true, status: true } },
};

export const poInclude = {
  vendor: true,
  requisition: { select: { id: true, prNumber: true } },
  lineItems: {
    include: { inventoryItem: { select: { id: true, itemCode: true, name: true, unitOfMeasure: true } } },
  },
  grns: { orderBy: { receivedAt: 'desc' as const } },
};

export function serializeVendor(v: Record<string, unknown>) {
  return { ...v, rating: v.rating ? Number(v.rating) : null };
}

export function serializePr(pr: Record<string, unknown> & { lineItems?: Record<string, unknown>[] }) {
  return {
    ...pr,
    lineItems: pr.lineItems?.map((li) => ({
      ...li,
      quantity: Number(li.quantity),
      estimatedUnitCost: li.estimatedUnitCost ? Number(li.estimatedUnitCost) : null,
    })),
  };
}

export function serializePo(po: Record<string, unknown> & { lineItems?: Record<string, unknown>[]; totalAmount?: unknown }) {
  return {
    ...po,
    totalAmount: Number(po.totalAmount),
    lineItems: po.lineItems?.map((li) => ({
      ...li,
      quantity: Number(li.quantity),
      unitRate: Number(li.unitRate),
      totalAmount: Number(li.totalAmount),
    })),
  };
}
