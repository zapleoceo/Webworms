export function buildPlanMessage(params: {
  jobId: string;
  rngSeed: number;
  difficulty: any;
  mapSeed?: number;
  gravity: number;
  wind: number;
  teamAmmo: any;
  worms: any[];
  shooterId: string;
  botCfg: any;
  executeSeconds: number;
  ropeRemaining: number;
  shotMemory: any[];
  bestPractices?: any;
  seedBins?: any;
}): any {
  const msg: any = {
    kind: 'plan',
    jobId: params.jobId,
    rngSeed: params.rngSeed,
    difficulty: params.difficulty,
    gravity: params.gravity,
    wind: params.wind,
    teamAmmo: params.teamAmmo,
    worms: params.worms,
    shooterId: params.shooterId,
    botCfg: params.botCfg,
    executeSeconds: params.executeSeconds,
    ropeRemaining: params.ropeRemaining,
    shotMemory: params.shotMemory
  };
  if (params.mapSeed !== undefined) msg.mapSeed = params.mapSeed;
  if (params.bestPractices !== undefined) msg.bestPractices = params.bestPractices;
  if (params.seedBins !== undefined) msg.seedBins = params.seedBins;
  return msg;
}

