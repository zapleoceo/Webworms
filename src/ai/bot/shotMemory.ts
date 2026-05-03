export function snapshotShotMemory(shotMemory: Map<string, any>, limit: number = 160): any[] {
  return Array.from(shotMemory.values())
    .sort((a, b) => (Number(b?.lastT) || 0) - (Number(a?.lastT) || 0))
    .slice(0, limit)
    .map((x) => ({
      stateKey: x.stateKey,
      shotKey: x.shotKey,
      noRes: x.noRes,
      ff: x.ff,
      targetId: x.targetId,
      lastT: x.lastT
    }));
}

