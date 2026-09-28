import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import prisma from '../prisma.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APP_TABLES = [
  'heartbeat',
  'idempotency_keys',
  'users',
  'companies',
  'user_companies',
  'refresh_tokens',
  'login_attempts'
];

export async function runRestore(backupFilePath: string | null = null) {
  const backupsDir = path.resolve(__dirname, '../../../backups');
  let selectedFile = backupFilePath;

  if (!selectedFile) {
    if (!fs.existsSync(backupsDir)) {
      throw new Error(`Backups folder does not exist: ${backupsDir}`);
    }
    const files = fs.readdirSync(backupsDir)
      .filter(f => f.endsWith('.sql') || f.endsWith('.json'))
      .sort((a, b) => fs.statSync(path.join(backupsDir, b)).mtimeMs - fs.statSync(path.join(backupsDir, a)).mtimeMs);

    if (files.length === 0) {
      throw new Error('No backup files found in ./backups directory.');
    }
    selectedFile = path.join(backupsDir, files[0]);
  }

  console.log(`\n======================================================`);
  console.log(`🔄 Trade Flow v2 Database Restore Starting...`);
  console.log(`📁 Backup File: ${selectedFile}`);
  console.log(`======================================================\n`);

  try {
    const jsonPartner = selectedFile.replace(/\.sql$/, '.json');
    if (fs.existsSync(jsonPartner)) {
      const jsonContent = JSON.parse(fs.readFileSync(jsonPartner, 'utf8'));

      for (const table of APP_TABLES) {
        const rows: any[] = jsonContent.data[table] || [];
        if (rows.length === 0) continue;

        console.log(`📥 Restoring table: ${table} (${rows.length} rows)...`);
        await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE;`);

        const columns = Object.keys(rows[0]);
        for (const row of rows) {
          const values = columns.map(c => row[c]);
          const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
          const colNames = columns.map(c => `"${c}"`).join(', ');
          await prisma.$executeRawUnsafe(
            `INSERT INTO "${table}" (${colNames}) VALUES (${placeholders})`,
            ...values
          );
        }
      }
    } else if (selectedFile.endsWith('.sql')) {
      const sqlContent = fs.readFileSync(selectedFile, 'utf8');
      console.log('⚡ Executing SQL restore dump...');
      await prisma.$executeRawUnsafe(sqlContent);
    }

    // Verify row counts after restore
    console.log('\n📊 Verifying Restored Database Table Row Counts:');
    const restoredSummary: Record<string, number | string> = {};
    for (const table of APP_TABLES) {
      try {
        const countRes: any[] = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int as count FROM "${table}"`);
        restoredSummary[table] = countRes[0]?.count ?? 0;
      } catch (e: any) {
        restoredSummary[table] = 'Table Missing';
      }
    }
    console.table(restoredSummary);

    console.log(`\n======================================================`);
    console.log(`🎉 DATABASE RESTORE COMPLETED SUCCESSFULLY!`);
    console.log(`======================================================\n`);

    return {
      success: true,
      restoredSummary
    };
  } catch (err: any) {
    console.error('❌ Restore Failed:', err);
    throw err;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const customFile = process.argv[2] || null;
  runRestore(customFile)
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
