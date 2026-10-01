import prisma from '../prisma.js';

async function main() {
  console.log('Connecting to database...');
  
  // 1. Count items with gstRate = 12 or not 5
  const count12 = await prisma.item.count({
    where: {
      gstRate: 12.0
    }
  });
  console.log(`Found ${count12} items with gstRate = 12.0`);

  const totalItems = await prisma.item.count();
  console.log(`Total items in database: ${totalItems}`);

  // 2. Update all items with 12.0 to 5.0
  const result = await prisma.item.updateMany({
    where: {
      gstRate: 12.0
    },
    data: {
      gstRate: 5.0
    }
  });
  console.log(`Updated ${result.count} items from 12% to 5% GST.`);

  // 3. Check if there are any other items that are not 5% (optional info)
  const remaining = await prisma.item.findMany({
    select: {
      id: true,
      sku: true,
      name: true,
      gstRate: true
    }
  });
  console.log(`Sample of items after update:`, remaining.slice(0, 10).map(i => `${i.sku}: ${i.name} (GST ${i.gstRate}%)`));

  // Also update default in schema table if needed directly via SQL
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "items" ALTER COLUMN "gst_rate" SET DEFAULT 5.00;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "purchase_items" ALTER COLUMN "gst_rate" SET DEFAULT 5.00;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "invoice_items" ALTER COLUMN "gst_rate" SET DEFAULT 5.00;`);
    console.log('Database column defaults updated to 5.00 successfully.');
  } catch (err: any) {
    console.warn('Note on table alter column default:', err.message);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Error running GST migration script:', err);
  process.exit(1);
});
