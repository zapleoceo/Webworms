import { getSpriteSets, createSpriteSet, updateSpriteSet, deleteSpriteSet } from './controllers/spritesets';
import { getWeapons, createWeapon, updateWeapon, deleteWeapon } from './controllers/weapons';
import { capturePayPalOrder, createPayPalOrder } from './controllers/payments';
import { getTurnIceServers } from './controllers/turn';
import { handleSignalingSignal, handleSignalingSnapshot, handleSignalingWS } from './controllers/signaling';
import { SignalingDO as SignalingDOImpl } from './durable/SignalingDO';
import { MeshSignalingDO as MeshSignalingDOImpl } from './durable/MeshSignalingDO';
import { createRoom, joinRandomRoom, heartbeatRoom, leaveRoom, joinRoomState, getRoomState } from './controllers/rooms';
import { handleRegister, handleLogin, handleVerify, handleSession, handleDailyReset, handleUpdateProfile, getProfile, handleUpdatePassword } from './controllers/auth';
import { getTurnTime, updateTurnTime, getAirdropPhysics, updateAirdropPhysics, getGameSettings, getBotSettings, updateBotSettings } from './controllers/settings';
import { getAdminUsers, updateAdminUser, deleteAdminUser, addAdminUserTime } from './controllers/adminUsers';
import { checkAdminAuth } from './services/adminAuth';
import { addPlayTime } from './services/playTime';
import { getMaps, getMapById, getMapImage, createMap, updateMap, deleteMap } from './controllers/maps';
import { getLogos, createLogo, updateLogo, deleteLogo } from './controllers/logos';
import { startMatch, reportMatchEnd } from './controllers/matches';
import { handleContactEmail } from './controllers/contact';
import { uploadAIVaiLog } from './controllers/aivaiLogs';
import { getAIVaiLog, listAIVaiLogs } from './controllers/adminAivaiLogs';
import { getAIVaiLogExtract, getAIVaiLogMeta, getAIVaiLogStats } from './controllers/aivaiLogPublic';
import { getAIVaiCasesBootstrap, getAIVaiCasesTop, ingestAIVaiCases } from './controllers/aivaiCases';
import { ensureBootstrapAdmin } from './services/bootstrapAdmin';
import { dispatchRequest } from './routes';

export interface Env {
  DB: D1Database;
  ROOMS: KVNamespace;
  SIGNALING: DurableObjectNamespace;
  MESH: DurableObjectNamespace;
  AIVAI_LOGS?: R2Bucket;
  RESEND_API_KEY?: string;
  PAYPAL_CLIENT_ID?: string;
  PAYPAL_SECRET?: string;
  CLOUDFLARE_TURN_KEY_ID?: string;
  CLOUDFLARE_TURN_API_TOKEN?: string;
  CORS_ORIGINS?: string;
  BOOTSTRAP_ADMIN_EMAIL?: string;
  BOOTSTRAP_ADMIN_PASSWORD?: string;
  waitUntil(promise: Promise<any>): void;
}

function computeCorsHeaders(request: Request, env: Env): Record<string, string> {
  const reqOrigin = request.headers.get('Origin')?.trim() || '';
  const selfOrigin = new URL(request.url).origin;
  const allowedFromEnv = (env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const allowLocal =
    reqOrigin.startsWith('http://localhost:') ||
    reqOrigin.startsWith('http://127.0.0.1:') ||
    reqOrigin.startsWith('http://0.0.0.0:');
  const allowPagesDev = reqOrigin.endsWith('.pages.dev');
  const allowSame = reqOrigin === selfOrigin;
  const allowEnv = allowedFromEnv.includes(reqOrigin);

  const allowOrigin = reqOrigin && (allowSame || allowLocal || allowPagesDev || allowEnv) ? reqOrigin : selfOrigin;

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-Admin-Email, X-Admin-Password',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function maskId(id: string | null | undefined): string | null {
  if (!id) return null;
  if (id.length <= 10) return id;
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

function summarizeIceCandidates(payload: unknown): { count: number; hasSrflx: boolean; hasRelay: boolean; hasHost: boolean } {
  if (!Array.isArray(payload)) return { count: 0, hasSrflx: false, hasRelay: false, hasHost: false };
  let hasSrflx = false;
  let hasRelay = false;
  let hasHost = false;
  for (const c of payload) {
    const cand = (c as any)?.candidate;
    if (typeof cand !== 'string') continue;
    if (cand.includes(' typ srflx ')) hasSrflx = true;
    if (cand.includes(' typ relay ')) hasRelay = true;
    if (cand.includes(' typ host ')) hasHost = true;
  }
  return { count: payload.length, hasSrflx, hasRelay, hasHost };
}

function summarizeSdp(payload: unknown): { type?: string; sdpLen?: number } {
  if (!payload || typeof payload !== 'object') return {};
  const p = payload as any;
  const type = typeof p.type === 'string' ? p.type : undefined;
  const sdpLen = typeof p.sdp === 'string' ? p.sdp.length : undefined;
  return { type, sdpLen };
}

function logEvent(event: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({ event, ts: Date.now(), ...data }));
}

function newReqId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `r_${Math.random().toString(36).slice(2)}_${Date.now()}`;
  }
}

function withDiagHeaders(res: Response, reqId: string, ms: number): Response {
  const h = new Headers(res.headers);
  h.set('x-ww-reqid', reqId);
  h.set('x-ww-ms', String(ms));
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

function jsonOk(body: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function diag<T extends Response>(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>,
  handler: (reqId: string) => Promise<T>
): Promise<Response> {
  const reqId = newReqId();
  const t0 = Date.now();
  const url = new URL(request.url);
  logEvent('api.diag.start', {
    reqId,
    method: request.method,
    path: url.pathname,
    ua: request.headers.get('user-agent'),
    referer: request.headers.get('referer'),
    cfRay: request.headers.get('cf-ray')
  });
  try {
    const res = await handler(reqId);
    const ms = Date.now() - t0;
    logEvent('api.diag.end', { reqId, ms, status: res.status, path: url.pathname });
    return withDiagHeaders(res, reqId, ms);
  } catch (e: any) {
    const ms = Date.now() - t0;
    logEvent('api.diag.err', { reqId, ms, path: url.pathname, error: String(e?.message || e) });
    return withDiagHeaders(new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }), reqId, ms);
  }
}

let dbInitPromise: Promise<void> | null = null;
let dbInitDb: Env['DB'] | null = null;

async function seedWeapons(env: Env): Promise<void> {
  const seedSql = `
      INSERT OR IGNORE INTO Weapons (
        id, name, damage, explosionRadius, knockback, windMultiplier, spread, projectilesPerShot, cooldown, chargeSpeed, speedModifier, maxRange, fuseSeconds, icon_src, projectile_src, color
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

  await env.DB.prepare(seedSql).bind(
    'bazooka', 'Bazooka', 25, 40, 220, 1.0, 0, 1, 1.0, 1.0, 1.0, 1900, 0,
    '/sprites/Weapon Icons/bazooka.1.png', '/sprites/Weapons/missile.png', '#FF4500'
  ).run();

  await env.DB.prepare(seedSql).bind(
    'minigun', 'Minigun', 4, 15, 40, 0.5, 15, 1, 0.1, 0, 1.0, 1400, 0,
    '/sprites/Weapon Icons/minigun.1.png', '/sprites/Weapons/bullet.png', '#FFA500'
  ).run();

  await env.DB.prepare(seedSql).bind(
    'triple', 'Triple-barrel', 15, 25, 120, 1.0, 20, 3, 1.5, 1.0, 1.2, 1700, 0,
    '/sprites/Weapon Icons/shotgun.1.png', '/sprites/Weapons/bullet.png', '#FFD700'
  ).run();

  await env.DB.prepare(seedSql).bind(
    'rocket', 'Rocket Launcher', 40, 60, 320, 1.2, 0, 1, 2.0, 1.0, 1.0, 2100, 0,
    '/sprites/Weapon Icons/hmissile.1.png', '/sprites/Weapons/hmissil1.png', '#FF1493'
  ).run();

  await env.DB.prepare(seedSql).bind(
    'blaster', 'Blaster', 10, 15, 60, 0.1, 2, 1, 0.3, 0, 1.6, 1700, 0,
    '/sprites/Weapon Icons/laser.1.png', '/sprites/Weapons/bullet.png', '#7FFFD4'
  ).run();

  await env.DB.prepare(seedSql).bind(
    'grenade', 'Grenade', 35, 55, 260, 0.6, 0, 1, 1.5, 1.0, 0.9, 1100, 3.0,
    '/sprites/Weapon Icons/grenade.1.png', '/sprites/Weapons/grenade.png', '#9ACD32'
  ).run();
}

async function ensureDbInitialized(env: Env): Promise<void> {
  if (dbInitPromise && dbInitDb === env.DB) {
    const mm = await env.DB.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='MatchmakingQueue'`
    ).first<any>();
    const wpn = await env.DB.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='Weapons'`
    ).first<any>();
    if (mm?.name === 'MatchmakingQueue' && wpn?.name === 'Weapons') {
      const bazooka = await env.DB.prepare(`SELECT id FROM Weapons WHERE id = ?`).bind('bazooka').first<any>();
      if (!bazooka) await seedWeapons(env);
      return dbInitPromise;
    }
    dbInitPromise = null;
    dbInitDb = null;
  }

  dbInitPromise = (async () => {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS Settings (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `).run();

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS Logos (
        id TEXT PRIMARY KEY,
        image_data TEXT,
        width INTEGER,
        height INTEGER,
        hardness INTEGER
      )
    `).run();

    await env.DB.prepare(`
      INSERT OR IGNORE INTO Settings (key, value) VALUES ('turn_time', '30')
    `).run();

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS Maps (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        image_data TEXT NOT NULL,
        width INTEGER NOT NULL DEFAULT 1500,
        height INTEGER NOT NULL DEFAULT 800,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS Weapons (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        damage INTEGER NOT NULL,
        explosionRadius INTEGER NOT NULL,
        knockback INTEGER NOT NULL,
        windMultiplier REAL NOT NULL,
        spread REAL NOT NULL,
        projectilesPerShot INTEGER NOT NULL,
        cooldown REAL NOT NULL,
        chargeSpeed REAL NOT NULL,
        speedModifier REAL NOT NULL,
        maxRange INTEGER NOT NULL DEFAULT 1900,
        fuseSeconds REAL NOT NULL DEFAULT 3.0,
        icon_src TEXT,
        projectile_src TEXT,
        color TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS AIVaiCases (
        aiV TEXT NOT NULL,
        stateKey TEXT NOT NULL,
        caseId TEXT NOT NULL,
        planJson TEXT NOT NULL,
        weaponId TEXT,
        samples INTEGER NOT NULL DEFAULT 1,
        emaUtility REAL NOT NULL DEFAULT 0,
        lastUtility REAL NOT NULL DEFAULT 0,
        lastEnemyDelta REAL NOT NULL DEFAULT 0,
        lastAllyDelta REAL NOT NULL DEFAULT 0,
        lastExpectedDamage REAL NOT NULL DEFAULT 0,
        updatedAt INTEGER NOT NULL,
        PRIMARY KEY (aiV, stateKey, caseId)
      )
    `).run();

    await env.DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_aivai_cases_key ON AIVaiCases(aiV, stateKey, emaUtility DESC)
    `).run();
    await env.DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_aivai_cases_updated ON AIVaiCases(aiV, updatedAt DESC)
    `).run();

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS Users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        username TEXT UNIQUE,
        password_algo TEXT,
        password_salt TEXT,
        password_iters INTEGER,
        password_hash TEXT,
        is_active BOOLEAN DEFAULT FALSE,
        is_admin BOOLEAN DEFAULT FALSE,
        verification_token TEXT,
        play_time_balance INTEGER DEFAULT 3600,
        access_allowed BOOLEAN DEFAULT TRUE,
        last_login DATETIME,
        last_daily_reset DATETIME DEFAULT CURRENT_TIMESTAMP,
        referred_by TEXT,
        matches_played INTEGER DEFAULT 0,
        matches_won INTEGER DEFAULT 0,
        total_damage_dealt INTEGER DEFAULT 0,
        total_kills INTEGER DEFAULT 0,
        premium_until INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS Sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      )
    `).run();

    await env.DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON Sessions(user_id)
    `).run();
    await env.DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON Sessions(expires_at)
    `).run();

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS MatchmakingQueue (
        room_id TEXT PRIMARY KEY,
        host_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    try {
      await env.DB.exec(`ALTER TABLE Users ADD COLUMN premium_until INTEGER DEFAULT 0;`);
    } catch {}

    try {
      await env.DB.exec(`ALTER TABLE Users ADD COLUMN password_algo TEXT;`);
    } catch {}
    try {
      await env.DB.exec(`ALTER TABLE Users ADD COLUMN password_salt TEXT;`);
    } catch {}
    try {
      await env.DB.exec(`ALTER TABLE Users ADD COLUMN password_iters INTEGER;`);
    } catch {}

    try {
      await env.DB.exec(`ALTER TABLE Weapons ADD COLUMN maxRange INTEGER DEFAULT 1900;`);
    } catch {}

    try {
      await env.DB.exec(`ALTER TABLE Weapons ADD COLUMN fuseSeconds REAL DEFAULT 3.0;`);
    } catch {}
    try {
      await ensureBootstrapAdmin(env);
    } catch {}
    await seedWeapons(env);
    try {
      await env.DB.exec(`UPDATE Weapons SET fuseSeconds = 3.0 WHERE id = 'grenade' AND (fuseSeconds IS NULL OR fuseSeconds = 0);`);
    } catch {}

  })();
  dbInitDb = env.DB;
  dbInitDb = env.DB;
  return dbInitPromise;
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    // Run daily balance reset
    console.log(`Cron triggered at ${new Date(event.scheduledTime).toISOString()}`);
    try {
      // Set all players with < 3600 seconds to exactly 3600 seconds (60 mins)
      // Players with premium or > 3600 seconds keep their balance
      const result = await env.DB.prepare(`
        UPDATE Users 
        SET play_time_balance = 3600 
        WHERE play_time_balance < 3600
      `).run();
      console.log(`Reset balance for ${result.meta.changes} users`);
    } catch (e) {
      console.error('Failed to run scheduled balance reset:', e);
    }
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const corsHeaders = computeCorsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      await ensureDbInitialized(env);
      const response = await dispatchRequest(request, url, env, corsHeaders, {
        jsonOk,
        diag: (req, handler) => diag(req, env, corsHeaders, handler),
        logEvent,
        maskId
      });

      // Append CORS headers to whatever response was generated
      const newHeaders = new Headers(response.headers);
      for (const [key, value] of Object.entries(corsHeaders)) {
        newHeaders.set(key, value);
      }
      
      console.log(`[API] ${request.method} ${url.pathname} - Status: ${response.status}`);

      const ws = (response as any).webSocket;
      if (ws) return response;

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders
      });

    } catch (e: any) {
      console.error(`[API ERROR] ${request.method} ${url.pathname}:`, e.message);
      return new Response(JSON.stringify({ error: 'Internal Server Error', details: e.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
  },
};

// --------------------------------------------------------------------
// Handlers
// --------------------------------------------------------------------

export class SignalingDO extends SignalingDOImpl {}
export class MeshSignalingDO extends MeshSignalingDOImpl {}
