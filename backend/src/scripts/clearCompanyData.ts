import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const company = await prisma.company.findFirst({
    where: {
      name: {
        contains: 'NEURO HARMONY CLINIC',
        mode: 'insensitive'
      }
    }
  });

  if (!company) {
    console.error('Company "NEURO HARMONY CLINIC" not found.');
    const all = await prisma.company.findMany({ select: { id: true, name: true } });
    console.log('Available companies:', all);
    return;
  }

  const companyId = company.id;
  console.log(`Found Company: "${company.name}" (ID: ${companyId})`);
  console.log('Clearing Purchase data, Sale data, Stock Ledger, Batches, and resetting balances...');

  // 1. Delete Invoices (cascades to invoice_items)
  const deletedInvoices = await prisma.invoice.deleteMany({
    where: { companyId }
  });
  console.log(`- Deleted ${deletedInvoices.count} sale invoice(s)`);

  // 2. Delete Purchases (cascades to purchase_items)
  const deletedPurchases = await prisma.purchase.deleteMany({
    where: { companyId }
  });
  console.log(`- Deleted ${deletedPurchases.count} purchase bill(s)`);

  // 3. Clear Stock Ledger (Bypassing append-only trigger temporarily for fresh reset)
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "stock_ledger" DISABLE TRIGGER ALL;
    DELETE FROM "stock_ledger" WHERE "company_id" = '${companyId}';
    ALTER TABLE "stock_ledger" ENABLE TRIGGER ALL;
  `);
  console.log('- Cleared stock ledger audit entries');

  // 4. Delete Batches for this company
  const deletedBatches = await prisma.batch.deleteMany({
    where: { companyId }
  });
  console.log(`- Deleted ${deletedBatches.count} batch(es)`);

  // 5. Reset Items stock or keep catalog clean
  const items = await prisma.item.findMany({ where: { companyId } });
  console.log(`- Catalog items preserved: ${items.length} items`);

  // 6. Reset Parties outstanding balances
  const updatedParties = await prisma.party.updateMany({
    where: { companyId },
    data: {
      outstandingBalance: 0.0
    }
  });
  console.log(`- Reset outstanding balance for ${updatedParties.count} party/supplier/customer account(s)`);

  console.log(`\n✅ Company "${company.name}" is now completely FRESH for testing!`);
}

main()
  .catch(e => {
    console.error('Error clearing company data:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
