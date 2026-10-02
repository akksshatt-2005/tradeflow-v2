import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';
import prisma from './prisma.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXCEL_PATH = path.resolve(__dirname, '../../Stock_Report_Sorted.xls');

interface ParsedBatch {
  batchNumber: string;
  expiryDate: Date;
  mrp: number;
  ptr: number;
  pts: number;
  stockInBaseUnits: number;
  rawStock: number | string;
}

interface ParsedProduct {
  name: string;
  unit: string;
  packSize: number;
  manufacturer: string;
  batches: ParsedBatch[];
}

function parsePackSize(name: string): number {
  const match = String(name).match(/(\d+)\s*\*\s*(\d+)/);
  if (match) return parseInt(match[2], 10) || 1;
  return 1;
}

function parseStock(stockVal: any, packSize: number): number {
  if (stockVal === null || stockVal === undefined || stockVal === '' || isNaN(stockVal)) return 0;
  const num = parseFloat(stockVal);
  if (isNaN(num) || num <= 0) return 0;

  if (packSize > 1) {
    const parts = num.toString().split('.');
    const strips = parseInt(parts[0], 10) || 0;
    let loose = 0;
    if (parts.length > 1) {
      loose = parseInt(parts[1], 10) || 0;
      if (loose >= packSize && parts[1].length === 1) {
        loose = parseInt(parts[1], 10);
      }
    }
    return (strips * packSize) + loose;
  } else {
    return Math.round(num);
  }
}

function parseExpiry(expStr: any): Date {
  if (!expStr || typeof expStr !== 'string') return new Date('2028-12-31T00:00:00.000Z');
  const clean = expStr.trim();
  if (clean === '-' || clean === '-   -' || clean === 'nan' || clean === '' || clean === 'None') {
    return new Date('2028-12-31T00:00:00.000Z');
  }

  // Format: 01-Jan-28 or 01-Dec-27
  const parts = clean.split('-');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10) || 1;
    const monthStr = parts[1].toLowerCase();
    const months: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
    };
    const month = months[monthStr] !== undefined ? months[monthStr] : 11;
    let year = parseInt(parts[2], 10);
    if (year < 100) year += 2000;
    return new Date(Date.UTC(year, month, day));
  }
  return new Date('2028-12-31T00:00:00.000Z');
}

export async function importStockReport() {
  console.log(`\n======================================================`);
  console.log(` TRADE FLOW v2 - EXCEL STOCK REPORT IMPORTER`);
  console.log(` Reading file: ${EXCEL_PATH}`);
  console.log(`======================================================\n`);

  const workbook = XLSX.readFile(EXCEL_PATH);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawData: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  // Locate header row
  let headerIdx = -1;
  for (let i = 0; i < 10; i++) {
    if (rawData[i] && rawData[i].some(cell => String(cell || '').includes('Product Name'))) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) {
    throw new Error('Could not find header row containing "Product Name" in Excel file.');
  }

  console.log(`Header row identified at index ${headerIdx}`);

  // Parse products and batches
  const productMap = new Map<string, ParsedProduct>();
  let totalRowsProcessed = 0;

  for (let i = headerIdx + 1; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || !row[0]) continue;
    const productName = String(row[0]).trim();
    if (!productName || productName === 'Product Name') continue;

    totalRowsProcessed++;
    const unitRaw = String(row[1] || 'TAB.').trim().toUpperCase().replace('.', '');
    const rawStock = row[2];
    const costPrice = parseFloat(row[3]) || 0;
    const mrp = parseFloat(row[4]) || 0;
    const purchasePrice = parseFloat(row[5]) || 0;
    const company = String(row[6] || '').trim();
    let batchNo = String(row[7] || '').trim();
    if (!batchNo || batchNo === 'nan' || batchNo === '-' || batchNo === 'None') {
      batchNo = 'OPENING-STOCK';
    }
    const expStr = String(row[8] || '').trim();
    const expiryDate = parseExpiry(expStr);

    const packSize = parsePackSize(productName);
    const stockInBaseUnits = parseStock(rawStock, packSize);
    const ptr = purchasePrice > 0 ? purchasePrice : (costPrice > 0 ? costPrice : mrp);
    const pts = mrp > 0 ? mrp : ptr;

    let standardUnit = 'STRIP';
    if (unitRaw.includes('TAB')) standardUnit = 'STRIP';
    else if (unitRaw.includes('SYP') || unitRaw.includes('SYRUP')) standardUnit = 'BOTTLE';
    else if (unitRaw.includes('INJ')) standardUnit = 'VIAL';
    else if (unitRaw.includes('CAP')) standardUnit = 'STRIP';
    else if (unitRaw.includes('OINT') || unitRaw.includes('GEL')) standardUnit = 'TUBE';

    if (!productMap.has(productName)) {
      productMap.set(productName, {
        name: productName,
        unit: standardUnit,
        packSize,
        manufacturer: company || undefined as any,
        batches: []
      });
    }

    productMap.get(productName)!.batches.push({
      batchNumber: batchNo.toUpperCase(),
      expiryDate,
      mrp,
      ptr,
      pts,
      stockInBaseUnits,
      rawStock
    });
  }

  console.log(`Parsed ${totalRowsProcessed} stock records into ${productMap.size} unique medicine products.\n`);

  // Target Company: NEURO HARMONY CLINIC only
  const targetCompanies = await prisma.company.findMany({
    where: {
      name: {
        in: ['NEURO HARMONY CLINIC']
      }
    }
  });

  if (targetCompanies.length === 0) {
    throw new Error('Target companies not found in database.');
  }

  // Get admin user for audit ledger entries
  const adminUser = await prisma.user.findFirst({
    where: { username: { in: ['admin', 'admin_live'] } }
  }) || await prisma.user.findFirst();

  const userId = adminUser ? adminUser.id : (await prisma.user.create({
    data: {
      username: 'system_importer',
      passwordHash: 'dummy'
    }
  })).id;

  for (const company of targetCompanies) {
    console.log(`\n------------------------------------------------------`);
    console.log(` IMPORTING INTO: ${company.name} (ID: ${company.id})`);
    console.log(`------------------------------------------------------`);

    let itemsCreated = 0;
    let itemsUpdated = 0;
    let batchesCreated = 0;
    let batchesUpdated = 0;
    let totalStockUnitsImported = 0;

    let skuIndex = 1;

    for (const [prodName, prod] of productMap.entries()) {
      // Find or create Item
      let item = await prisma.item.findFirst({
        where: {
          companyId: company.id,
          name: { equals: prodName, mode: 'insensitive' }
        }
      });

      if (!item) {
        const sku = `MED-${company.name.substring(0, 3).toUpperCase()}-${String(skuIndex++).padStart(4, '0')}`;
        item = await prisma.item.create({
          data: {
            companyId: company.id,
            sku,
            name: prod.name,
            manufacturer: prod.manufacturer,
            hsnCode: '3004',
            gstRate: 5.0,
            unit: prod.unit,
            conversionFactor: prod.packSize,
            minStockLevel: 0
          }
        });
        itemsCreated++;
      } else {
        // Update item details if needed
        item = await prisma.item.update({
          where: { id: item.id },
          data: {
            manufacturer: prod.manufacturer || item.manufacturer,
            unit: prod.unit,
            conversionFactor: prod.packSize,
            gstRate: 5.0
          }
        });
        itemsUpdated++;
      }

      // Upsert batches for this item
      for (const batchData of prod.batches) {
        const existingBatch = await prisma.batch.findUnique({
          where: {
            companyId_itemId_batchNumber: {
              companyId: company.id,
              itemId: item.id,
              batchNumber: batchData.batchNumber
            }
          }
        });

        if (existingBatch) {
          await prisma.batch.update({
            where: { id: existingBatch.id },
            data: {
              expiryDate: batchData.expiryDate,
              mrp: batchData.mrp,
              ptr: batchData.ptr,
              pts: batchData.pts,
              currentStock: batchData.stockInBaseUnits
            }
          });
          batchesUpdated++;
        } else {
          const newBatch = await prisma.batch.create({
            data: {
              companyId: company.id,
              itemId: item.id,
              batchNumber: batchData.batchNumber,
              expiryDate: batchData.expiryDate,
              mrp: batchData.mrp,
              ptr: batchData.ptr,
              pts: batchData.pts,
              currentStock: batchData.stockInBaseUnits
            }
          });
          batchesCreated++;

          // Create initial opening stock ledger entry
          if (batchData.stockInBaseUnits > 0) {
            await prisma.stockLedger.create({
              data: {
                companyId: company.id,
                itemId: item.id,
                batchId: newBatch.id,
                entryType: 'OPENING_BALANCE',
                quantity: batchData.stockInBaseUnits,
                unitPrice: batchData.ptr,
                createdBy: userId,
                notes: 'Imported from Stock_Report_Sorted.xls'
              }
            });
          }
        }
        totalStockUnitsImported += batchData.stockInBaseUnits;
      }
    }

    console.log(`=> Import Complete for ${company.name}:`);
    console.log(`   - Items: ${itemsCreated} created, ${itemsUpdated} updated`);
    console.log(`   - Batches: ${batchesCreated} created, ${batchesUpdated} updated`);
    console.log(`   - Total Stock Units: ${totalStockUnitsImported} base units`);
  }

  console.log(`\n======================================================`);
  console.log(` ALL IMPORTS COMPLETED SUCCESSFULLY!`);
  console.log(`======================================================\n`);
}

// Execute if run directly
if (process.argv[1] && process.argv[1].endsWith('import-stock-report.ts')) {
  importStockReport()
    .then(async () => {
      await prisma.$disconnect();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('Import Failed:', err);
      await prisma.$disconnect();
      process.exit(1);
    });
}
