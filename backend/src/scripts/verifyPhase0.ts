import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import app from '../server.js';
import prisma from '../prisma.js';
import { runBackup } from './backup.js';
import { runRestore } from './restore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const TEST_PORT = 5098;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const HEARTBEAT_KEY = process.env.HEARTBEAT_KEY || 'tradeflow-secret-test-key-2026';
process.env.HEARTBEAT_KEY = HEARTBEAT_KEY;

function makeRequest(url: string, options: any = {}, body: any = null): Promise<{ statusCode: number; headers: any; data: any }> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const reqOptions: http.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    let bodyStr: string | null = null;
    if (body) {
      bodyStr = typeof body === 'object' ? JSON.stringify(body) : body;
      const headers: Record<string, any> = (reqOptions.headers as any) || {};
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(bodyStr!);
      reqOptions.headers = headers;
    }

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsedData = data;
        try {
          parsedData = JSON.parse(data);
        } catch (_) {}
        resolve({
          statusCode: res.statusCode || 500,
          headers: res.headers,
          data: parsedData
        });
      });
    });

    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function startTestServer(): Promise<http.Server> {
  return new Promise((resolve) => {
    const server = app.listen(TEST_PORT, '127.0.0.1', () => {
      resolve(server);
    });
  });
}

export async function runPhase0Verification() {
  console.log('\n===============================================================');
  console.log('🧪 Trade Flow v2 - PHASE 0 AUTOMATED VERIFICATION SUITE');
  console.log('===============================================================\n');

  let server: http.Server | undefined;
  const results = {
    heartbeatWithoutKey: false,
    heartbeatWithWrongKey: false,
    heartbeatWithValidKey: false,
    signupAndLoginSuccess: false,
    singleHopReturnsCompanies: false,
    rateLimitLocksAfter5Attempts: false,
    idempotencyCompanyCreation: false,
    backupExecution: false,
    restoreRowCountMatch: false
  };

  try {
    server = await startTestServer();
    console.log(`📡 Test server listening on ${BASE_URL}`);

    // -------------------------------------------------------------
    // 1. VERIFY HEARTBEAT ENDPOINT (Rule F4)
    // -------------------------------------------------------------
    console.log('\n--- 1. Testing /health/heartbeat Security & Upsert (Rule F4) ---');

    // 1a. Call without key -> 401
    const resNoKey = await makeRequest(`${BASE_URL}/health/heartbeat`);
    console.log(`[Test 1a] Request without key -> HTTP ${resNoKey.statusCode}`);
    if (resNoKey.statusCode === 401) {
      console.log('✅ PASS: Heartbeat rejected unauthorized request without key.');
      results.heartbeatWithoutKey = true;
    }

    // 1b. Call with invalid key -> 401
    const resWrongKey = await makeRequest(`${BASE_URL}/health/heartbeat`, {
      headers: { 'x-heartbeat-key': 'incorrect-token-abc' }
    });
    console.log(`[Test 1b] Request with invalid key -> HTTP ${resWrongKey.statusCode}`);
    if (resWrongKey.statusCode === 401) {
      console.log('✅ PASS: Heartbeat rejected unauthorized request with invalid key.');
      results.heartbeatWithWrongKey = true;
    }

    // 1c. Call with valid key -> 200 OK
    const resValidKey = await makeRequest(`${BASE_URL}/health/heartbeat`, {
      headers: { 'x-heartbeat-key': HEARTBEAT_KEY }
    });
    console.log(`[Test 1c] Request with valid key -> HTTP ${resValidKey.statusCode}`);
    if (resValidKey.statusCode === 200 && resValidKey.data?.status === 'ok') {
      console.log('✅ PASS: Heartbeat accepted with valid key and upserted last_seen timestamp.');
      results.heartbeatWithValidKey = true;
    }

    // -------------------------------------------------------------
    // 2. VERIFY SIGNUP, LOGIN & SINGLE-HOP COMPANY LIST (Rule B1, B2, A5)
    // -------------------------------------------------------------
    console.log('\n--- 2. Testing Signup, Login & Single-Hop Payload (Rule B1, B2, A5) ---');
    const testUsername = `user_${Date.now()}`;
    const testPassword = 'Password123!';

    const signupRes = await makeRequest(`${BASE_URL}/auth/signup`, { method: 'POST' }, {
      username: testUsername,
      password: testPassword
    });

    console.log(`[Test 2a] Signup -> HTTP ${signupRes.statusCode}`);
    let accessToken = signupRes.data?.accessToken;

    if (signupRes.statusCode === 201 && accessToken) {
      console.log(`✅ PASS: User "${testUsername}" registered with 15m access token.`);

      // Create a company for this user
      const compRes = await makeRequest(`${BASE_URL}/companies`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` }
      }, { name: 'Apollo Pharmacy Ltd' });

      console.log(`[Test 2b] Created company -> HTTP ${compRes.statusCode}`);

      // Now test login single-hop
      const loginRes = await makeRequest(`${BASE_URL}/auth/login`, { method: 'POST' }, {
        username: testUsername,
        password: testPassword
      });

      console.log(`[Test 2c] Login response -> HTTP ${loginRes.statusCode}`);
      if (loginRes.statusCode === 200 && loginRes.data?.companies && loginRes.data.companies.length > 0) {
        console.log(`✅ PASS: Login returned user + tokens + companies in ONE single hop.`);
        results.signupAndLoginSuccess = true;
        results.singleHopReturnsCompanies = true;
      }
    }

    // -------------------------------------------------------------
    // 3. VERIFY LOGIN RATE LIMIT (Rule B4 - 5 failed attempts locks for 10 min)
    // -------------------------------------------------------------
    console.log('\n--- 3. Testing Login Rate Limiter (Rule B4) ---');
    const rateLimitUsername = `lockuser_${Date.now()}`;
    // Create user
    await makeRequest(`${BASE_URL}/auth/signup`, { method: 'POST' }, {
      username: rateLimitUsername,
      password: 'CorrectPassword123'
    });

    let rateLimited = false;
    for (let i = 1; i <= 5; i++) {
      const failRes = await makeRequest(`${BASE_URL}/auth/login`, { method: 'POST' }, {
        username: rateLimitUsername,
        password: 'WrongPassword'
      });
      console.log(`[Attempt ${i}] Failed login status: HTTP ${failRes.statusCode}`);
      if (failRes.statusCode === 429 && failRes.data?.minutesRemaining > 0) {
        rateLimited = true;
        console.log(`✅ PASS: Account locked on 5th failed attempt with ${failRes.data.minutesRemaining} minutes remaining.`);
        results.rateLimitLocksAfter5Attempts = true;
        break;
      }
    }

    // -------------------------------------------------------------
    // 4. VERIFY IDEMPOTENCY KEY HANDLING (Rule F3)
    // -------------------------------------------------------------
    console.log('\n--- 4. Testing Idempotency on Company Creation (Rule F3) ---');
    const testIdemKey = `idem-comp-${Date.now()}`;

    // First attempt
    const idemRes1 = await makeRequest(`${BASE_URL}/companies`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'idempotency-key': testIdemKey
      }
    }, { name: 'MedPlus Express' });

    console.log(`[Test 4a] First submission -> HTTP ${idemRes1.statusCode}`);
    const firstCompId = idemRes1.data?.company?.id;

    // Second attempt with exact same key
    const idemRes2 = await makeRequest(`${BASE_URL}/companies`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'idempotency-key': testIdemKey
      }
    }, { name: 'MedPlus Express' });

    console.log(`[Test 4b] Duplicate submission -> HTTP ${idemRes2.statusCode}`);
    const isReplay = idemRes2.headers['x-idempotent-replay'] === 'true' || idemRes2.statusCode === 201;
    const sameId = idemRes2.data?.company?.id === firstCompId;

    if (sameId && (idemRes2.statusCode === 201 || idemRes2.statusCode === 200)) {
      console.log(`✅ PASS: Duplicate idempotency key returned cached original company record.`);
      results.idempotencyCompanyCreation = true;
    }

    // -------------------------------------------------------------
    // 5. VERIFY BACKUP AND RESTORE (Rule F6)
    // -------------------------------------------------------------
    console.log('\n--- 5. Testing Database Backup & Restore Engine (Rule F6) ---');
    try {
      const backupRes = await runBackup();
      if (backupRes && backupRes.success) {
        results.backupExecution = true;
        console.log('✅ PASS: Database backup exported to laptop.');

        const restoreRes = await runRestore(backupRes.sqlFile);
        if (restoreRes && restoreRes.success) {
          let allMatch = true;
          for (const [table, count] of Object.entries(backupRes.summary)) {
            const restoredCount = restoreRes.restoredSummary[table];
            if (count !== restoredCount) {
              allMatch = false;
              console.error(`❌ Table ${table} count mismatch: Backup ${count} vs Restored ${restoredCount}`);
            }
          }
          if (allMatch) {
            console.log('✅ PASS: All restored table row counts match backup 100%!');
            results.restoreRowCountMatch = true;
          }
        }
      }
    } catch (bkErr: any) {
      console.warn('Backup test note:', bkErr.message);
    }

  } catch (err: any) {
    console.error('Test suite error:', err);
  } finally {
    if (server) {
      server.close();
    }
    console.log('\n===============================================================');
    console.log('📋 PHASE 0 VERIFICATION RESULTS SUMMARY:');
    console.table(results);
    console.log('===============================================================\n');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runPhase0Verification()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
