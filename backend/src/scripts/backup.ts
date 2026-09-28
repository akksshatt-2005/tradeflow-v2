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

export async function runBackup(outputDir: string | null = null) {
  const backupsDir = outputDir || path.resolve(__dirname, '../../../backups');
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }

  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const sqlFilePath = path.join(backupsDir, `tradeflow_backup_${timestamp}.sql`);
  const jsonFilePath = path.join(backupsDir, `tradeflow_backup_${timestamp}.json`);

  console.log(`\n======================================================`);
  console.log(`📦 Trade Flow v2 Database Backup Starting...`);
  console.log(`🕒 Timestamp: ${now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} (IST)`);
  console.log(`======================================================\n`);

  try {
    const backupData: Record<string, any> = {
      meta: {
        version: '2.0.0',
        createdAt: now.toISOString(),
        tables: {}
      },
      data: {}
    };

    let sqlDump = `-- Trade Flow v2 PostgreSQL Database Backup\n`;
    sqlDump += `-- Generated: ${now.toISOString()}\n\n`;

    const summary: Record<string, number> = {};

    for (const table of APP_TABLES) {
      try {
        const rows: any[] = await prisma.$queryRawUnsafe(`SELECT * FROM "${table}" ORDER BY 1 ASC`);
        backupData.data[table] = rows;
        backupData.meta.tables[table] = rows.length;
        summary[table] = rows.length;

        console.log(`✅ Table "${table}": Exported ${rows.length} rows`);

        if (rows.length > 0) {
          sqlDump += `-- Data for table: ${table} (${rows.length} rows)\n`;
          sqlDump += `TRUNCATE TABLE "${table}" CASCADE;\n`;

          const columns = Object.keys(rows[0]);
          const colList = columns.map(c => `"${c}"`).join(', ');

          for (const row of rows) {
            const values = columns.map(col => {
              const val = row[col];
              if (val === null || val === undefined) return 'NULL';
              if (typeof val === 'number') return val;
              if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
              if (val instanceof Date) return `'${val.toISOString()}'`;
              if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
              return `'${String(val).replace(/'/g, "''")}'`;
            }).join(', ');

            sqlDump += `INSERT INTO "${table}" (${colList}) VALUES (${values});\n`;
          }
          sqlDump += `\n`;
        }
      } catch (err: any) {
        console.warn(`⚠️ Notice querying table ${table}:`, err.message);
      }
    }

    fs.writeFileSync(sqlFilePath, sqlDump, 'utf8');
    fs.writeFileSync(jsonFilePath, JSON.stringify(backupData, null, 2), 'utf8');

    console.log(`\n======================================================`);
    console.log(`🎉 BACKUP COMPLETED SUCCESSFULLY!`);
    console.log(`📄 SQL Dump:  ${sqlFilePath}`);
    console.log(`📊 JSON Dump: ${jsonFilePath}`);
    console.log(`📈 Row Counts Summary:`);
    console.table(summary);
    console.log(`======================================================\n`);

    return {
      success: true,
      sqlFile: sqlFilePath,
      jsonFile: jsonFilePath,
      summary
    };
  } catch (err: any) {
    console.error('❌ Backup Failed:', err);
    throw err;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runBackup()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
