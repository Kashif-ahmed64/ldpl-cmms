import { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';

export async function generateAssetTagNo(): Promise<string> {
  const config = await prisma.systemConfig.findUnique({ where: { key: 'app_settings' } });
  const prefix =
    config?.value && typeof config.value === 'object' && 'assetTagPrefix' in config.value
      ? String((config.value as { assetTagPrefix: string }).assetTagPrefix)
      : 'LDPL';

  const lastAsset = await prisma.asset.findFirst({
    where: { assetTagNo: { startsWith: `${prefix}-` } },
    orderBy: { assetTagNo: 'desc' },
  });

  let nextNum = 1;
  if (lastAsset) {
    const match = lastAsset.assetTagNo.match(/-(\d+)$/);
    if (match) nextNum = parseInt(match[1], 10) + 1;
  }

  return `${prefix}-${String(nextNum).padStart(5, '0')}`;
}

export function calculateCurrentValue(
  purchaseCost: Prisma.Decimal | null,
  purchaseDate: Date | null,
): number | null {
  if (!purchaseCost || !purchaseDate) return null;
  const cost = Number(purchaseCost);
  const years = (Date.now() - purchaseDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  const depreciated = cost * Math.max(0, 1 - years / 10);
  return Math.round(depreciated * 100) / 100;
}

export const assetInclude = {
  department: true,
  assignedTo: { select: { id: true, fullName: true, username: true } },
  parent: { select: { id: true, assetTagNo: true, name: true, hierarchyLevel: true } },
  children: {
    where: { deletedAt: null },
    select: { id: true, assetTagNo: true, name: true, hierarchyLevel: true, status: true },
    orderBy: { name: 'asc' as const },
  },
  _count: { select: { workOrders: true, children: true } },
};

export type AssetWithRelations = Prisma.AssetGetPayload<{ include: typeof assetInclude }>;

export function serializeAsset(asset: AssetWithRelations) {
  return {
    ...asset,
    purchaseCost: asset.purchaseCost ? Number(asset.purchaseCost) : null,
    currentValue: asset.currentValue ? Number(asset.currentValue) : null,
    meterReading: asset.meterReading ? Number(asset.meterReading) : null,
  };
}
