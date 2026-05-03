export type TerrainSyncState = {
  ready: boolean;
  dimKey: string;
  dfEventIndex: number;
};

export function syncTerrainForPlanning(params: {
  worker: Worker;
  terrain: any;
  state: TerrainSyncState;
}): TerrainSyncState {
  const { worker, terrain } = params;
  const grid = terrain?.grid;
  if (!(grid instanceof Uint8Array)) return params.state;
  const dfEvents: any[] = Array.isArray((terrain as any)?.dfEvents) ? (terrain as any).dfEvents : [];
  const dimKey = `${terrain.width}x${terrain.height}`;
  const needInit = !params.state.ready || params.state.dimKey !== dimKey || !Number.isFinite(params.state.dfEventIndex);

  if (needInit) {
    const bufInit = grid.slice().buffer;
    worker.postMessage({
      kind: 'terrainInit',
      width: terrain.width,
      height: terrain.height,
      grid: bufInit,
      dfEventIndex: dfEvents.length,
      revision: terrain.revision || 0
    }, [bufInit]);
    return { ready: true, dimKey, dfEventIndex: dfEvents.length };
  }

  if (dfEvents.length > params.state.dfEventIndex) {
    const delta = dfEvents.slice(params.state.dfEventIndex);
    const resetSeen = delta.some((e: any) => e && e.kind === 'reset');
    if (resetSeen) {
      const bufInit = grid.slice().buffer;
      worker.postMessage({
        kind: 'terrainInit',
        width: terrain.width,
        height: terrain.height,
        grid: bufInit,
        dfEventIndex: dfEvents.length,
        revision: terrain.revision || 0
      }, [bufInit]);
      return { ready: true, dimKey, dfEventIndex: dfEvents.length };
    }

    worker.postMessage({
      kind: 'terrainPatch',
      fromEventIndex: params.state.dfEventIndex,
      toEventIndex: dfEvents.length,
      events: delta,
      revision: terrain.revision || 0
    });
    return { ...params.state, dfEventIndex: dfEvents.length };
  }

  return { ...params.state, dimKey };
}

