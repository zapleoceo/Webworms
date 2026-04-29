export interface AirdropPhysicsConfig {
  fixedStep: number;
  maxSubSteps: number;
  mass: number;
  restitution: number;
  friction: number;
  linearDampingAir: number;
  linearDampingGround: number;
  angularDampingAir: number;
  angularDampingGround: number;
  centerOfMassYOffset: number;
  contactSpacing: number;
  maxContactPoints: number;
  solverIterations: number;
  maxPenetration: number;
  penetrationCorrection: number;
  sleepLinear: number;
  sleepAngular: number;
  sleepTime: number;
  impactShakeTime: number;
}

export const DEFAULT_AIRDROP_PHYSICS: AirdropPhysicsConfig = {
  fixedStep: 1 / 60,
  maxSubSteps: 5,
  mass: 3.0,
  restitution: 0.05,
  friction: 0.7,
  linearDampingAir: 0.2,
  linearDampingGround: 6.0,
  angularDampingAir: 0.4,
  angularDampingGround: 10.0,
  centerOfMassYOffset: 0.18,
  contactSpacing: 26,
  maxContactPoints: 14,
  solverIterations: 6,
  maxPenetration: 10,
  penetrationCorrection: 0.55,
  sleepLinear: 6,
  sleepAngular: 0.35,
  sleepTime: 0.9,
  impactShakeTime: 0.3
};

const num = (v: any, fallback: number): number => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

export function normalizeAirdropPhysicsConfig(raw: any): AirdropPhysicsConfig {
  const r: any = raw && typeof raw === 'object' ? raw : {};
  const fixedStep = clamp(num(r.fixedStep, DEFAULT_AIRDROP_PHYSICS.fixedStep), 1 / 240, 1 / 20);
  return {
    fixedStep,
    maxSubSteps: Math.floor(clamp(num(r.maxSubSteps, DEFAULT_AIRDROP_PHYSICS.maxSubSteps), 1, 12)),
    mass: clamp(num(r.mass, DEFAULT_AIRDROP_PHYSICS.mass), 0.5, 50),
    restitution: clamp(num(r.restitution, DEFAULT_AIRDROP_PHYSICS.restitution), 0, 0.6),
    friction: clamp(num(r.friction, DEFAULT_AIRDROP_PHYSICS.friction), 0, 2),
    linearDampingAir: clamp(num(r.linearDampingAir, DEFAULT_AIRDROP_PHYSICS.linearDampingAir), 0, 10),
    linearDampingGround: clamp(num(r.linearDampingGround, DEFAULT_AIRDROP_PHYSICS.linearDampingGround), 0, 40),
    angularDampingAir: clamp(num(r.angularDampingAir, DEFAULT_AIRDROP_PHYSICS.angularDampingAir), 0, 20),
    angularDampingGround: clamp(num(r.angularDampingGround, DEFAULT_AIRDROP_PHYSICS.angularDampingGround), 0, 60),
    centerOfMassYOffset: clamp(num(r.centerOfMassYOffset, DEFAULT_AIRDROP_PHYSICS.centerOfMassYOffset), -0.5, 0.8),
    contactSpacing: clamp(num(r.contactSpacing, DEFAULT_AIRDROP_PHYSICS.contactSpacing), 10, 80),
    maxContactPoints: Math.floor(clamp(num(r.maxContactPoints, DEFAULT_AIRDROP_PHYSICS.maxContactPoints), 6, 40)),
    solverIterations: Math.floor(clamp(num(r.solverIterations, DEFAULT_AIRDROP_PHYSICS.solverIterations), 1, 20)),
    maxPenetration: clamp(num(r.maxPenetration, DEFAULT_AIRDROP_PHYSICS.maxPenetration), 2, 40),
    penetrationCorrection: clamp(num(r.penetrationCorrection, DEFAULT_AIRDROP_PHYSICS.penetrationCorrection), 0.05, 1),
    sleepLinear: clamp(num(r.sleepLinear, DEFAULT_AIRDROP_PHYSICS.sleepLinear), 0.2, 30),
    sleepAngular: clamp(num(r.sleepAngular, DEFAULT_AIRDROP_PHYSICS.sleepAngular), 0.02, 10),
    sleepTime: clamp(num(r.sleepTime, DEFAULT_AIRDROP_PHYSICS.sleepTime), 0.1, 5),
    impactShakeTime: clamp(num(r.impactShakeTime, DEFAULT_AIRDROP_PHYSICS.impactShakeTime), 0, 1)
  };
}
