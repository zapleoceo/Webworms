import { getSpriteSets, createSpriteSet, updateSpriteSet, deleteSpriteSet } from './controllers/spritesets';
import { getWeapons, createWeapon, updateWeapon, deleteWeapon } from './controllers/weapons';
import { capturePayPalOrder } from './controllers/payments';
import { getTurnIceServers } from './controllers/turn';
import { handleSignalingSignal, handleSignalingSnapshot, handleSignalingWS } from './controllers/signaling';
import { SignalingDO as SignalingDOImpl } from './durable/SignalingDO';
import { createRoom, joinRandomRoom, heartbeatRoom, joinRoomState, getRoomState } from './controllers/rooms';
import { handleRegister, handleLogin, handleVerify, handleSession, handleDailyReset, handleUpdateProfile, getProfile, handleUpdatePassword } from './controllers/auth';
import { getTurnTime, updateTurnTime, getAirdropPhysics, updateAirdropPhysics, getGameSettings, getBotSettings, updateBotSettings } from './controllers/settings';
import { getAdminUsers, updateAdminUser, deleteAdminUser, addAdminUserTime } from './controllers/adminUsers';
import { checkAdminAuth } from './services/adminAuth';
import { addPlayTime } from './services/playTime';
import { getMaps, getMapById, getMapImage, createMap, updateMap, deleteMap } from './controllers/maps';
import { getLogos, createLogo, updateLogo, deleteLogo } from './controllers/logos';
import { startMatch, reportMatchEnd } from './controllers/matches';
import { handleContactEmail } from './controllers/contact';

export interface Env {
  DB: D1Database;
  ROOMS: KVNamespace;
  SIGNALING: DurableObjectNamespace;
  RESEND_API_KEY?: string;
  PAYPAL_CLIENT_ID?: string;
  PAYPAL_SECRET?: string;
  CLOUDFLARE_TURN_KEY_ID?: string;
  CLOUDFLARE_TURN_API_TOKEN?: string;
  waitUntil(promise: Promise<any>): void;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-Admin-Email, X-Admin-Password',
  'Access-Control-Max-Age': '86400',
};

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

let dbInitPromise: Promise<void> | null = null;
let dbInitDb: Env['DB'] | null = null;

async function ensureDbInitialized(env: Env): Promise<void> {
  if (dbInitPromise && dbInitDb === env.DB) {
    const mm = await env.DB.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='MatchmakingQueue'`
    ).first<any>();
    const wpn = await env.DB.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='Weapons'`
    ).first<any>();
    if (mm?.name === 'MatchmakingQueue' && wpn?.name === 'Weapons') return dbInitPromise;
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
        icon_src TEXT,
        projectile_src TEXT,
        color TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS Users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        username TEXT UNIQUE,
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
      await env.DB.exec(`ALTER TABLE Weapons ADD COLUMN maxRange INTEGER DEFAULT 1900;`);
    } catch {}

    const seed = await env.DB.prepare(`
      INSERT OR IGNORE INTO Weapons (
        id, name, damage, explosionRadius, knockback, windMultiplier, spread, projectilesPerShot, cooldown, chargeSpeed, speedModifier, maxRange, icon_src, projectile_src, color
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    await seed.bind(
      'bazooka', 'Bazooka', 25, 40, 220, 1.0, 0, 1, 1.0, 1.0, 1.0, 1900,
      '/sprites/Weapon Icons/bazooka.1.png', '/sprites/Weapons/missile.png', '#FF4500'
    ).run();

    await seed.bind(
      'minigun', 'Minigun', 4, 15, 40, 0.5, 15, 1, 0.1, 0, 1.0, 1400,
      '/sprites/Weapon Icons/minigun.1.png', '/sprites/Weapons/bullet.png', '#FFA500'
    ).run();

    await seed.bind(
      'triple', 'Triple-barrel', 15, 25, 120, 1.0, 20, 3, 1.5, 1.0, 1.2, 1700,
      '/sprites/Weapon Icons/shotgun.1.png', '/sprites/Weapons/bullet.png', '#FFD700'
    ).run();

    await seed.bind(
      'rocket', 'Rocket Launcher', 40, 60, 320, 1.2, 0, 1, 2.0, 1.0, 1.0, 2100,
      '/sprites/Weapon Icons/hmissile.1.png', '/sprites/Weapons/hmissil1.png', '#FF1493'
    ).run();

    await seed.bind(
      'blaster', 'Blaster', 10, 15, 60, 0.1, 2, 1, 0.3, 0, 1.6, 1700,
      '/sprites/Weapon Icons/laser.1.png', '/sprites/Weapons/bullet.png', '#7FFFD4'
    ).run();

    await seed.bind(
      'grenade', 'Grenade', 35, 55, 260, 0.6, 0, 1, 1.5, 1.0, 0.9, 1100,
      '/sprites/Weapon Icons/grenade.1.png', '/sprites/Weapons/grenade.png', '#9ACD32'
    ).run();
  })();
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
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    try {
      await ensureDbInitialized(env);

      let response: Response;

      // 1. Healthcheck / Ping
      if (url.pathname === '/api/ping') {
        response = new Response(JSON.stringify({ status: 'ok', time: Date.now() }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // 2. Auth Routes
      else if (url.pathname === '/api/auth/register' && request.method === 'POST') {
        response = await handleRegister(request, env, corsHeaders);
      }
      
      else if (url.pathname === '/api/auth/login' && request.method === 'POST') {
        response = await handleLogin(request, env, corsHeaders);
      }
      
      else if (url.pathname === '/api/auth/verify' && request.method === 'GET') {
        response = await handleVerify(request, env);
      }

      else if (url.pathname === '/api/auth/session' && request.method === 'GET') {
        response = await handleSession(request, env, corsHeaders);
      }

      else if (url.pathname === '/api/auth/daily-reset' && request.method === 'POST') {
        response = await handleDailyReset(request, env, corsHeaders);
      }
      
      else if (url.pathname === '/api/auth/profile') {
        if (request.method === 'PUT') {
          response = await handleUpdateProfile(request, env, corsHeaders);
        } else if (request.method === 'GET') {
          response = await getProfile(request, env, corsHeaders);
        }
      }

      else if (url.pathname === '/api/auth/password' && request.method === 'PUT') {
        response = await handleUpdatePassword(request, env, corsHeaders);
      }

      else if (url.pathname === '/api/settings/turn_time' && request.method === 'GET') {
        response = await getTurnTime(request, env, corsHeaders);
      }
      else if (url.pathname === '/api/settings/turn_time' && request.method === 'PUT') {
        response = await updateTurnTime(request, env, corsHeaders);
      }
      else if (url.pathname === '/api/settings/game' && request.method === 'GET') {
        response = await getGameSettings(request, env, corsHeaders);
      }
      else if (url.pathname === '/api/settings/airdrop_physics' && request.method === 'GET') {
        response = await getAirdropPhysics(request, env, corsHeaders);
      }
      else if (url.pathname === '/api/settings/airdrop_physics' && request.method === 'PUT') {
        response = await updateAirdropPhysics(request, env, corsHeaders);
      }
      else if (url.pathname === '/api/settings/bot' && request.method === 'GET') {
        response = await getBotSettings(request, env, corsHeaders);
      }
      else if (url.pathname === '/api/settings/bot' && request.method === 'PUT') {
        response = await updateBotSettings(request, env, corsHeaders);
      }
      else if (url.pathname === '/api/admin/users' && request.method === 'GET') {
        response = await getAdminUsers(request, env, corsHeaders);
      }
      
      else if (url.pathname === '/api/admin/users' && request.method === 'POST') {
        response = await updateAdminUser(request, env, corsHeaders);
      }
      else if (url.pathname === '/api/admin/users' && request.method === 'DELETE') {
        response = await deleteAdminUser(request, env, corsHeaders);
      }
      
      else if (url.pathname === '/api/contact' && request.method === 'POST') {
        response = await handleContactEmail(request, env, corsHeaders);
      }
      
      // 6. Match Endpoints
      else if (url.pathname === '/api/match/start' && request.method === 'POST') {
        response = await startMatch(request, env, corsHeaders);
      }
      else if (url.pathname === '/api/match/end' && request.method === 'POST') {
        response = await reportMatchEnd(request, env, corsHeaders);
      }
      else if (url.pathname === '/api/payment/paypal/capture' && request.method === 'POST') {
        response = await capturePayPalOrder(request, env, corsHeaders);
      }
      else if (url.pathname === '/api/admin/users/time' && request.method === 'POST') {
        response = await addAdminUserTime(request, env, corsHeaders);
      }
      else if (url.pathname === '/api/logos' && request.method === 'GET') {
        response = await getLogos(env, corsHeaders);
      }
      else if (url.pathname === '/api/admin/logos' && request.method === 'POST') {
        response = await createLogo(request, env, corsHeaders);
      }
      else if (url.pathname === '/api/admin/logos' && request.method === 'PUT') {
        response = await updateLogo(request, env, corsHeaders);
      }
      else if (url.pathname === '/api/admin/logos' && request.method === 'DELETE') {
        response = await deleteLogo(request, env, corsHeaders);
      }

      // Maps Endpoints
      else if (url.pathname === '/api/maps' && request.method === 'GET') {
        response = await getMaps(request, env, corsHeaders);
      }
      else if (url.pathname.startsWith('/api/maps/') && url.pathname.endsWith('/image') && request.method === 'GET') {
        response = await getMapImage(request, env, corsHeaders);
      }
      else if (url.pathname.startsWith('/api/maps/') && request.method === 'GET') {
        response = await getMapById(request, env, corsHeaders);
      }
      else if (url.pathname === '/api/admin/maps' && request.method === 'POST') {
        response = await createMap(request, env, corsHeaders);
      }
      else if (url.pathname.startsWith('/api/admin/maps/') && request.method === 'PUT') {
        response = await updateMap(request, env, corsHeaders);
      }
      else if (url.pathname.startsWith('/api/admin/maps/') && request.method === 'DELETE') {
        response = await deleteMap(request, env, corsHeaders);
      }

      // SpriteSets Endpoints
      else if (url.pathname === '/api/spritesets' && request.method === 'GET') {
        response = await getSpriteSets(env);
      }
      else if (url.pathname === '/api/admin/spritesets' && request.method === 'POST') {
        if (!(await checkAdminAuth(request, env))) {
          response = new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
        } else {
          response = await createSpriteSet(request, env);
        }
      }
      else if (url.pathname.startsWith('/api/admin/spritesets/') && request.method === 'PUT') {
        if (!(await checkAdminAuth(request, env))) {
          response = new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
        } else {
          response = await updateSpriteSet(request, env);
        }
      }
      else if (url.pathname.startsWith('/api/admin/spritesets/') && request.method === 'DELETE') {
        if (!(await checkAdminAuth(request, env))) {
          response = new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
        } else {
          response = await deleteSpriteSet(request, env);
        }
      }

      // Weapons Endpoints
      else if (url.pathname === '/api/weapons' && request.method === 'GET') {
        response = await getWeapons(env);
      }
      else if (url.pathname === '/api/admin/weapons' && request.method === 'POST') {
        if (!(await checkAdminAuth(request, env))) {
          response = new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
        } else {
          response = await createWeapon(request, env);
        }
      }
      else if (url.pathname.startsWith('/api/admin/weapons/') && request.method === 'PUT') {
        if (!(await checkAdminAuth(request, env))) {
          response = new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
        } else {
          response = await updateWeapon(request, env);
        }
      }
      else if (url.pathname.startsWith('/api/admin/weapons/') && request.method === 'DELETE') {
        if (!(await checkAdminAuth(request, env))) {
          response = new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
        } else {
          response = await deleteWeapon(request, env);
        }
      }
      
      else if (url.pathname === '/api/rooms' && request.method === 'POST') {
        response = await createRoom(request, env, logEvent);
      }
      
      // Matchmaking
      else if (url.pathname === '/api/rooms/random' && request.method === 'POST') {
        response = await joinRandomRoom(request, env, corsHeaders, logEvent, maskId);
      }

      else if (url.pathname === '/api/turn/ice-servers' && request.method === 'GET') {
        response = await getTurnIceServers(request, env, corsHeaders, logEvent);
      }

      // Signaling endpoints
      else if (url.pathname.startsWith('/api/rooms/') && url.pathname.endsWith('/join') && request.method === 'POST') {
        response = await joinRoomState(request, env, corsHeaders, logEvent, maskId);
      }
      else if (url.pathname.startsWith('/api/rooms/') && url.pathname.endsWith('/ws') && request.method === 'GET') {
        response = await handleSignalingWS(request, env, corsHeaders);
      }
      else if (url.pathname.startsWith('/api/rooms/') && url.pathname.endsWith('/snapshot') && request.method === 'GET') {
        response = await handleSignalingSnapshot(request, env, corsHeaders);
      }
      else if (url.pathname.startsWith('/api/rooms/') && url.pathname.endsWith('/signal') && request.method === 'POST') {
        response = await handleSignalingSignal(request, env, corsHeaders);
      }
      else if (url.pathname.startsWith('/api/rooms/') && url.pathname.endsWith('/heartbeat') && request.method === 'POST') {
        response = await heartbeatRoom(request, env, corsHeaders, logEvent, maskId);
      }
      
      else if (url.pathname.startsWith('/api/rooms/') && url.pathname.endsWith('/state') && request.method === 'GET') {
        response = await getRoomState(request, env, corsHeaders);
      }
      else {
        response = new Response('Not Found', { status: 404 });
      }

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
