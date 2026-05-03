import type { Env } from './index';
import { getSpriteSets, createSpriteSet, updateSpriteSet, deleteSpriteSet } from './controllers/spritesets';
import { getWeapons, createWeapon, updateWeapon, deleteWeapon } from './controllers/weapons';
import { capturePayPalOrder, createPayPalOrder } from './controllers/payments';
import { getTurnIceServers } from './controllers/turn';
import { handleSignalingSignal, handleSignalingSnapshot, handleSignalingWS } from './controllers/signaling';
import { createRoom, joinRandomRoom, heartbeatRoom, leaveRoom, joinRoomState, getRoomState } from './controllers/rooms';
import { handleRegister, handleLogin, handleVerify, handleSession, handleDailyReset, handleUpdateProfile, getProfile, handleUpdatePassword } from './controllers/auth';
import { getTurnTime, updateTurnTime, getAirdropPhysics, updateAirdropPhysics, getGameSettings, getBotSettings, updateBotSettings } from './controllers/settings';
import { getAdminUsers, updateAdminUser, deleteAdminUser, addAdminUserTime } from './controllers/adminUsers';
import { checkAdminAuth } from './services/adminAuth';
import { getMaps, getMapById, getMapImage, createMap, updateMap, deleteMap } from './controllers/maps';
import { getLogos, createLogo, updateLogo, deleteLogo } from './controllers/logos';
import { startMatch, reportMatchEnd } from './controllers/matches';
import { handleContactEmail } from './controllers/contact';
import { uploadAIVaiLog } from './controllers/aivaiLogs';
import { getAIVaiLog, listAIVaiLogs } from './controllers/adminAivaiLogs';
import { getAIVaiLogExtract, getAIVaiLogMeta, getAIVaiLogStats } from './controllers/aivaiLogPublic';
import { getAIVaiCasesBootstrap, getAIVaiCasesTop, ingestAIVaiCases } from './controllers/aivaiCases';

export type DiagFn = <T extends Response>(request: Request, handler: (reqId: string) => Promise<T>) => Promise<Response>;

type RouteHandler = (request: Request, env: Env, corsHeaders: Record<string, string>) => Promise<Response> | Response;

type RouteDef = {
  method?: string;
  match: (url: URL) => boolean;
  handler: RouteHandler;
};

export async function dispatchRequest(
  request: Request,
  url: URL,
  env: Env,
  corsHeaders: Record<string, string>,
  deps: {
    jsonOk: (body: unknown, status?: number) => Response;
    diag: DiagFn;
    logEvent: (event: string, data: Record<string, unknown>) => void;
    maskId: (id: string | null | undefined) => string | null;
  }
): Promise<Response> {
  const routes: RouteDef[] = [
    {
      method: 'GET',
      match: (u) => u.pathname === '/api/ping',
      handler: async () => deps.jsonOk({ status: 'ok', time: Date.now() })
    },
    { method: 'POST', match: (u) => u.pathname === '/api/auth/register', handler: (r, e) => handleRegister(r, e, corsHeaders) },
    { method: 'POST', match: (u) => u.pathname === '/api/auth/login', handler: (r, e) => handleLogin(r, e, corsHeaders) },
    { method: 'GET', match: (u) => u.pathname === '/api/auth/verify', handler: (r, e) => handleVerify(r, e) },
    { method: 'GET', match: (u) => u.pathname === '/api/auth/session', handler: (r, e) => handleSession(r, e, corsHeaders) },
    { method: 'POST', match: (u) => u.pathname === '/api/auth/daily-reset', handler: (r, e) => handleDailyReset(r, e, corsHeaders) },
    {
      match: (u) => u.pathname === '/api/auth/profile',
      handler: async (r, e) => {
        if (r.method === 'PUT') return await handleUpdateProfile(r, e, corsHeaders);
        if (r.method === 'GET') return await deps.diag(r, async () => await getProfile(r, e, corsHeaders));
        return new Response('Method Not Allowed', { status: 405 });
      }
    },
    { method: 'PUT', match: (u) => u.pathname === '/api/auth/password', handler: (r, e) => handleUpdatePassword(r, e, corsHeaders) },

    { method: 'GET', match: (u) => u.pathname === '/api/settings/turn_time', handler: (r, e) => getTurnTime(r, e, corsHeaders) },
    { method: 'PUT', match: (u) => u.pathname === '/api/settings/turn_time', handler: (r, e) => updateTurnTime(r, e, corsHeaders) },
    { method: 'GET', match: (u) => u.pathname === '/api/settings/game', handler: (r, e) => getGameSettings(r, e, corsHeaders) },
    { method: 'GET', match: (u) => u.pathname === '/api/settings/airdrop_physics', handler: (r, e) => getAirdropPhysics(r, e, corsHeaders) },
    { method: 'PUT', match: (u) => u.pathname === '/api/settings/airdrop_physics', handler: (r, e) => updateAirdropPhysics(r, e, corsHeaders) },
    { method: 'GET', match: (u) => u.pathname === '/api/settings/bot', handler: (r, e) => getBotSettings(r, e, corsHeaders) },
    { method: 'PUT', match: (u) => u.pathname === '/api/settings/bot', handler: (r, e) => updateBotSettings(r, e, corsHeaders) },

    { method: 'GET', match: (u) => u.pathname === '/api/admin/users', handler: (r, e) => getAdminUsers(r, e, corsHeaders) },
    { method: 'POST', match: (u) => u.pathname === '/api/admin/users', handler: (r, e) => updateAdminUser(r, e, corsHeaders) },
    { method: 'DELETE', match: (u) => u.pathname === '/api/admin/users', handler: (r, e) => deleteAdminUser(r, e, corsHeaders) },
    { method: 'POST', match: (u) => u.pathname === '/api/admin/users/time', handler: (r, e) => addAdminUserTime(r, e, corsHeaders) },

    { method: 'POST', match: (u) => u.pathname === '/api/contact', handler: (r, e) => handleContactEmail(r, e, corsHeaders) },

    { method: 'POST', match: (u) => u.pathname === '/api/match/start', handler: (r, e) => startMatch(r, e, corsHeaders) },
    { method: 'POST', match: (u) => u.pathname === '/api/match/end', handler: (r, e) => reportMatchEnd(r, e, corsHeaders) },

    { method: 'POST', match: (u) => u.pathname === '/api/payment/paypal/create-order', handler: (r, e) => createPayPalOrder(r, e, corsHeaders) },
    { method: 'POST', match: (u) => u.pathname === '/api/payment/paypal/capture', handler: (r, e) => capturePayPalOrder(r, e, corsHeaders) },

    { method: 'POST', match: (u) => u.pathname === '/api/aivai/logs', handler: (r, e) => uploadAIVaiLog(r, e, corsHeaders) },
    { method: 'GET', match: (u) => u.pathname === '/api/aivai/log/meta', handler: (r, e) => getAIVaiLogMeta(r, e, corsHeaders) },
    { method: 'GET', match: (u) => u.pathname === '/api/aivai/log/stats', handler: (r, e) => getAIVaiLogStats(r, e, corsHeaders) },
    { method: 'GET', match: (u) => u.pathname === '/api/aivai/log/extract', handler: (r, e) => getAIVaiLogExtract(r, e, corsHeaders) },
    { method: 'POST', match: (u) => u.pathname === '/api/aivai/cases/ingest', handler: (r, e) => ingestAIVaiCases(r, e, corsHeaders) },
    { method: 'GET', match: (u) => u.pathname === '/api/aivai/cases/top', handler: (r, e) => getAIVaiCasesTop(r, e, corsHeaders) },
    { method: 'GET', match: (u) => u.pathname === '/api/aivai/cases/bootstrap', handler: (r, e) => getAIVaiCasesBootstrap(r, e, corsHeaders) },
    { method: 'GET', match: (u) => u.pathname === '/api/admin/aivai/logs', handler: (r, e) => listAIVaiLogs(r, e, corsHeaders) },
    { method: 'GET', match: (u) => u.pathname === '/api/admin/aivai/log', handler: (r, e) => getAIVaiLog(r, e, corsHeaders) },

    { method: 'GET', match: (u) => u.pathname === '/api/logos', handler: (_r, e) => getLogos(e, corsHeaders) },
    {
      match: (u) => u.pathname === '/api/admin/logos',
      handler: async (r, e) => {
        if (r.method === 'POST') return await createLogo(r, e, corsHeaders);
        if (r.method === 'PUT') return await updateLogo(r, e, corsHeaders);
        if (r.method === 'DELETE') return await deleteLogo(r, e, corsHeaders);
        return new Response('Method Not Allowed', { status: 405 });
      }
    },

    { method: 'GET', match: (u) => u.pathname === '/api/maps', handler: (r, e) => deps.diag(r, async () => await getMaps(r, e, corsHeaders)) },
    { method: 'GET', match: (u) => u.pathname.startsWith('/api/maps/') && u.pathname.endsWith('/image'), handler: (r, e) => getMapImage(r, e, corsHeaders) },
    { method: 'GET', match: (u) => u.pathname.startsWith('/api/maps/'), handler: (r, e) => getMapById(r, e, corsHeaders) },
    { method: 'POST', match: (u) => u.pathname === '/api/admin/maps', handler: (r, e) => createMap(r, e, corsHeaders) },
    { method: 'PUT', match: (u) => u.pathname.startsWith('/api/admin/maps/'), handler: (r, e) => updateMap(r, e, corsHeaders) },
    { method: 'DELETE', match: (u) => u.pathname.startsWith('/api/admin/maps/'), handler: (r, e) => deleteMap(r, e, corsHeaders) },

    { method: 'GET', match: (u) => u.pathname === '/api/spritesets', handler: (_r, e) => getSpriteSets(e) },
    {
      match: (u) => u.pathname === '/api/admin/spritesets',
      handler: async (r, e) => {
        if (r.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
        if (!(await checkAdminAuth(r, e))) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
        return await createSpriteSet(r, e);
      }
    },
    {
      match: (u) => u.pathname.startsWith('/api/admin/spritesets/'),
      handler: async (r, e) => {
        if (r.method !== 'PUT' && r.method !== 'DELETE') return new Response('Method Not Allowed', { status: 405 });
        if (!(await checkAdminAuth(r, e))) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
        if (r.method === 'PUT') return await updateSpriteSet(r, e);
        return await deleteSpriteSet(r, e);
      }
    },

    { method: 'GET', match: (u) => u.pathname === '/api/weapons', handler: (r, e) => deps.diag(r, async () => await getWeapons(e, corsHeaders)) },
    {
      match: (u) => u.pathname === '/api/admin/weapons',
      handler: async (r, e) => {
        if (r.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
        if (!(await checkAdminAuth(r, e))) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
        return await createWeapon(r, e);
      }
    },
    {
      match: (u) => u.pathname.startsWith('/api/admin/weapons/'),
      handler: async (r, e) => {
        if (r.method !== 'PUT' && r.method !== 'DELETE') return new Response('Method Not Allowed', { status: 405 });
        if (!(await checkAdminAuth(r, e))) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
        if (r.method === 'PUT') return await updateWeapon(r, e);
        return await deleteWeapon(r, e);
      }
    },

    { method: 'POST', match: (u) => u.pathname === '/api/rooms', handler: (r, e) => createRoom(r, e, deps.logEvent) },
    { method: 'POST', match: (u) => u.pathname === '/api/rooms/random', handler: (r, e) => joinRandomRoom(r, e, corsHeaders, deps.logEvent, deps.maskId) },
    { method: 'GET', match: (u) => u.pathname === '/api/turn/ice-servers', handler: (r, e) => getTurnIceServers(r, e, corsHeaders, deps.logEvent) },
    { method: 'POST', match: (u) => u.pathname.startsWith('/api/rooms/') && u.pathname.endsWith('/join'), handler: (r, e) => joinRoomState(r, e, corsHeaders, deps.logEvent, deps.maskId) },
    { method: 'GET', match: (u) => u.pathname.startsWith('/api/rooms/') && u.pathname.endsWith('/ws'), handler: (r, e) => handleSignalingWS(r, e, corsHeaders) },
    { method: 'GET', match: (u) => u.pathname.startsWith('/api/rooms/') && u.pathname.endsWith('/snapshot'), handler: (r, e) => handleSignalingSnapshot(r, e, corsHeaders) },
    { method: 'POST', match: (u) => u.pathname.startsWith('/api/rooms/') && u.pathname.endsWith('/signal'), handler: (r, e) => handleSignalingSignal(r, e, corsHeaders) },
    { method: 'POST', match: (u) => u.pathname.startsWith('/api/rooms/') && u.pathname.endsWith('/heartbeat'), handler: (r, e) => heartbeatRoom(r, e, corsHeaders, deps.logEvent, deps.maskId) },
    { method: 'POST', match: (u) => u.pathname.startsWith('/api/rooms/') && u.pathname.endsWith('/leave'), handler: (r, e) => leaveRoom(r, e, corsHeaders, deps.logEvent, deps.maskId) },
    { method: 'GET', match: (u) => u.pathname.startsWith('/api/rooms/') && u.pathname.endsWith('/state'), handler: (r, e) => getRoomState(r, e, corsHeaders) }
  ];

  for (const rt of routes) {
    if (rt.method && rt.method !== request.method) continue;
    if (!rt.match(url)) continue;
    return await rt.handler(request, env, corsHeaders);
  }

  return new Response('Not Found', { status: 404 });
}

