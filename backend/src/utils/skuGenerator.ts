/**
 * TradeFlow V2 - Collision-proof SKU & ID Generator
 * Generates sequential SKUs (e.g., MED-0001, MED-0002) with zero collisions.
 */

export async function generateUniqueItemSku(
  txOrPrisma: any,
  companyId: string,
  preferredSku?: string | null,
  locallyReservedSkus?: Set<string>
): Promise<string> {
  const reserved = locallyReservedSkus || new Set<string>();

  if (preferredSku && preferredSku.trim().length > 0) {
    const candidate = preferredSku.trim().toUpperCase();
    if (!reserved.has(candidate)) {
      const existing = await txOrPrisma.item.findUnique({
        where: { companyId_sku: { companyId, sku: candidate } }
      });
      if (!existing) {
        reserved.add(candidate);
        return candidate;
      }
    }
  }

  // Fetch all existing SKUs for this company to guarantee no collision
  const existingItems = await txOrPrisma.item.findMany({
    where: { companyId },
    select: { sku: true }
  });

  const skuSet = new Set<string>(existingItems.map((i: any) => (i.sku || '').toUpperCase()));
  for (const s of reserved) {
    skuSet.add(s);
  }

  let counter = existingItems.length + 1;
  let candidate = `MED-${String(counter).padStart(4, '0')}`;

  while (skuSet.has(candidate)) {
    counter++;
    candidate = `MED-${String(counter).padStart(4, '0')}`;
  }

  reserved.add(candidate);
  return candidate;
}
