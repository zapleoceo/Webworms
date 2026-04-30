import type { Landscape } from '../models/Landscape';
import type { BrandLogo } from '../models/BrandLogo';
import { DEFAULT_AIRDROP_PHYSICS, normalizeAirdropPhysicsConfig, type AirdropPhysicsConfig } from './AirdropConfig';

type Vec = { x: number; y: number };

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y;
const len = (v: Vec) => Math.hypot(v.x, v.y);
const norm = (v: Vec): Vec => {
  const l = len(v);
  if (l <= 1e-6) return { x: 0, y: -1 };
  return { x: v.x / l, y: v.y / l };
};
const crossSV = (s: number, v: Vec): Vec => ({ x: -s * v.y, y: s * v.x });
const crossVV = (a: Vec, b: Vec): number => a.x * b.y - a.y * b.x;
const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const mul = (v: Vec, s: number): Vec => ({ x: v.x * s, y: v.y * s });

const rot = (v: Vec, c: number, s: number): Vec => ({ x: v.x * c - v.y * s, y: v.x * s + v.y * c });

const solid = (landscape: Landscape, x: number, y: number): boolean => {
  if (y < 0) return false;
  return landscape.getMaterial(x, y) > 0;
};

const angleNorm = (a: number): number => {
  const TAU = Math.PI * 2;
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
};

export function buildAirdropContactPoints(hw: number, hh: number, cfg: AirdropPhysicsConfig): Vec[] {
  const spacing = Math.max(10, cfg.contactSpacing);
  const points: Vec[] = [];
  const push = (x: number, y: number) => {
    const k = `${Math.round(x)}:${Math.round(y)}`;
    if ((push as any)._seen?.has(k)) return;
    if (!(push as any)._seen) (push as any)._seen = new Set<string>();
    (push as any)._seen.add(k);
    points.push({ x, y });
  };

  const w = hw * 2;
  const h = hh * 2;
  const bottomCount = Math.floor(clamp(Math.round(w / spacing) + 1, 3, cfg.maxContactPoints));
  const sideCount = Math.floor(clamp(Math.round(h / (spacing * 1.4)) + 1, 2, 6));
  const topCount = Math.floor(clamp(Math.round(w / (spacing * 2.0)) + 1, 2, 4));

  for (let i = 0; i < bottomCount; i++) {
    const t = bottomCount === 1 ? 0.5 : i / (bottomCount - 1);
    push(-hw + t * w, hh);
  }
  for (let i = 0; i < topCount; i++) {
    const t = topCount === 1 ? 0.5 : i / (topCount - 1);
    push(-hw + t * w, -hh);
  }
  for (let i = 0; i < sideCount; i++) {
    const t = sideCount === 1 ? 0.5 : i / (sideCount - 1);
    push(-hw, -hh + t * h);
    push(hw, -hh + t * h);
  }

  return points.slice(0, cfg.maxContactPoints);
}

export function integrateAirdrop(
  logo: BrandLogo,
  dt: number,
  gravity: number,
  landscape: Landscape
): void {
  const cfg = normalizeAirdropPhysicsConfig((logo as any).airdropPhysics || DEFAULT_AIRDROP_PHYSICS);
  const h = cfg.fixedStep;
  const maxSubSteps = cfg.maxSubSteps;

  logo.physicsAccum += Math.max(0, dt);
  const maxAccum = h * maxSubSteps;
  if (logo.physicsAccum > maxAccum) logo.physicsAccum = maxAccum;

  const hw = logo.collisionWidth / 2;
  const hh = logo.collisionHeight / 2;

  if (!Array.isArray(logo.contactPointsLocal) || logo.contactPointsLocal.length === 0 || logo.lastCollisionW !== logo.collisionWidth || logo.lastCollisionH !== logo.collisionHeight) {
    logo.contactPointsLocal = buildAirdropContactPoints(hw, hh, cfg) as any;
    logo.lastCollisionW = logo.collisionWidth;
    logo.lastCollisionH = logo.collisionHeight;
  }

  const m = Math.max(0.01, cfg.mass);
  const invM = 1 / m;
  const I = m * ((hw * 2) * (hw * 2) + (hh * 2) * (hh * 2)) / 12;
  const invI = I > 1e-6 ? 1 / I : 0;
  const comLocal: Vec = { x: 0, y: hh * cfg.centerOfMassYOffset };

  const stepOnce = () => {
    logo.touchedGround = false;

    logo.vy += gravity * h;

    logo.x += logo.vx * h;
    logo.y += logo.vy * h;
    logo.angle = angleNorm(logo.angle + logo.angularVelocity * h);

    const trace = (logo as any).onTrace as ((e: any) => void) | undefined;
    const tracePos0 = { x: logo.x, y: logo.y };
    const traceVel0 = { vx: logo.vx, vy: logo.vy };
    const traceAng0 = { a: logo.angle, w: logo.angularVelocity };

    const c = Math.cos(logo.angle);
    const s = Math.sin(logo.angle);
    const comWorld = add({ x: logo.x, y: logo.y }, rot(comLocal, c, s));

    type Contact = { p: Vec; n: Vec; pen: number; r: Vec };
    const contacts: Contact[] = [];

    for (const lp of logo.contactPointsLocal as any as Vec[]) {
      const wp = add({ x: logo.x, y: logo.y }, rot(lp, c, s));
      const ix = Math.floor(wp.x);
      const iy = Math.floor(wp.y);
      if (!solid(landscape, ix, iy)) continue;

      const gx = (solid(landscape, ix + 1, iy) ? 1 : 0) - (solid(landscape, ix - 1, iy) ? 1 : 0);
      const gy = (solid(landscape, ix, iy + 1) ? 1 : 0) - (solid(landscape, ix, iy - 1) ? 1 : 0);
      let n = norm({ x: -gx, y: -gy });
      if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) n = { x: 0, y: -1 };

      let pen = 0;
      let out = wp;
      const maxPen = cfg.maxPenetration;
      for (let k = 0; k < maxPen; k++) {
        const tx = Math.floor(out.x);
        const ty = Math.floor(out.y);
        if (!solid(landscape, tx, ty)) break;
        out = add(out, n);
        pen += 1;
      }
      if (pen <= 0) continue;

      const r = sub(wp, comWorld);
      contacts.push({ p: wp, n, pen, r });
      if (contacts.length >= cfg.maxContactPoints) break;
    }

    if (contacts.length === 0) {
      logo.sleepAccum = 0;
      const air = Math.exp(-cfg.linearDampingAir * h);
      logo.vx *= air;
      logo.vy *= air;
      logo.angularVelocity *= Math.exp(-cfg.angularDampingAir * h);
      return;
    }

    let avgNx = 0;
    let avgNy = 0;
    let maxPen = 0;
    for (const ctc of contacts) {
      avgNx += ctc.n.x;
      avgNy += ctc.n.y;
      if (ctc.pen > maxPen) maxPen = ctc.pen;
      if (ctc.n.y < -0.35) logo.touchedGround = true;
      const slop = 1.0;
      const corr = clamp((ctc.pen - slop) * cfg.penetrationCorrection, 0, cfg.maxPenetration);
      logo.x += ctc.n.x * corr;
      logo.y += ctc.n.y * corr;
    }
    const invC = 1 / Math.max(1, contacts.length);
    avgNx *= invC;
    avgNy *= invC;

    const restitutionScale = Math.max(0, (logo as any).bounceFactor ?? 1);
    const restitution = cfg.restitution * restitutionScale;

    for (let it = 0; it < cfg.solverIterations; it++) {
      for (const ctc of contacts) {
        const v: Vec = { x: logo.vx, y: logo.vy };
        const w = logo.angularVelocity;
        const vp = add(v, crossSV(w, ctc.r));
        const vn = dot(vp, ctc.n);
        if (vn < 0) {
          const rn = crossVV(ctc.r, ctc.n);
          const denom = invM + rn * rn * invI;
          const jn = denom > 1e-6 ? (-(1 + restitution) * vn) / denom : 0;
          const impulseN = mul(ctc.n, jn);
          logo.vx += impulseN.x * invM;
          logo.vy += impulseN.y * invM;
          logo.angularVelocity += rn * jn * invI;

          const vt = sub(vp, mul(ctc.n, vn));
          const tl = len(vt);
          if (tl > 1e-6) {
            const t = { x: vt.x / tl, y: vt.y / tl };
            const rt = crossVV(ctc.r, t);
            const denomT = invM + rt * rt * invI;
            const jt0 = denomT > 1e-6 ? (-dot(vp, t)) / denomT : 0;
            const jt = clamp(jt0, -cfg.friction * jn, cfg.friction * jn);
            const impulseT = mul(t, jt);
            logo.vx += impulseT.x * invM;
            logo.vy += impulseT.y * invM;
            logo.angularVelocity += rt * jt * invI;
          }
        }
      }
    }

    const hasContact = contacts.length > 0;
    if (logo.touchedGround || hasContact) {
      const scale = logo.touchedGround ? 1 : 0.55;
      const dampLin = Math.exp(-(cfg.linearDampingGround * scale) * h);
      const dampAng = Math.exp(-(cfg.angularDampingGround * scale) * h);
      logo.vx *= dampLin;
      logo.vy *= dampLin;
      logo.angularVelocity *= dampAng;
    } else {
      const air = Math.exp(-cfg.linearDampingAir * h);
      logo.vx *= air;
      logo.vy *= air;
      logo.angularVelocity *= Math.exp(-cfg.angularDampingAir * h);
    }

    const speed = Math.hypot(logo.vx, logo.vy);
    const aw = Math.abs(logo.angularVelocity);
    if (hasContact && speed < cfg.sleepLinear && aw < cfg.sleepAngular) {
      logo.sleepAccum += h;
    } else {
      logo.sleepAccum = 0;
    }

    if (trace) {
      const ax = (logo as any).__aivaiTraceAccum;
      const next = (typeof ax === 'number' ? ax : 0) + h;
      const dv = Math.hypot((logo.vx - traceVel0.vx), (logo.vy - traceVel0.vy));
      const should = next >= 0.1 || dv > 65 || maxPen >= 3;
      (logo as any).__aivaiTraceAccum = should ? 0 : next;
      if (should) {
        try {
          trace({
            type: 'physics_collision',
            kind: 'airdrop_contact',
            x0: tracePos0.x,
            y0: tracePos0.y,
            x1: logo.x,
            y1: logo.y,
            v0: traceVel0,
            v1: { vx: logo.vx, vy: logo.vy },
            a0: traceAng0.a,
            w0: traceAng0.w,
            a1: logo.angle,
            w1: logo.angularVelocity,
            contacts: contacts.length,
            avgN: { x: avgNx, y: avgNy },
            maxPen,
            touchedGround: logo.touchedGround
          });
        } catch {}
      }
    }

    if (logo.sleepAccum >= cfg.sleepTime) {
      logo.isDynamic = false;
      logo.vx = 0;
      logo.vy = 0;
      logo.angularVelocity = 0;
      logo.bounceTime = 1.0;
    } else if (hasContact && logo.sleepAccum >= cfg.sleepTime * 0.45) {
      const vSnap = cfg.sleepLinear * 0.22;
      const wSnap = cfg.sleepAngular * 0.22;
      if (Math.abs(logo.vx) < vSnap) logo.vx = 0;
      if (Math.abs(logo.vy) < vSnap) logo.vy = 0;
      if (Math.abs(logo.angularVelocity) < wSnap) logo.angularVelocity = 0;
    }
  };

  let steps = 0;
  while (logo.physicsAccum >= h && steps < maxSubSteps && logo.isDynamic) {
    stepOnce();
    logo.physicsAccum -= h;
    steps++;
  }
}
