import { AI_V } from '../../AIVersion';

export function checkVoidAheadSafety(params: {
  presenter: any;
  player: any;
  now: number;
  turnNo: number;
  moveTo: { x: number; y: number };
  dir: 'left' | 'right';
  dxAbs: number;
  cliff: { isDeepVoid: boolean };
  lastReplanAt: number;
  replanCooldownSeconds: number;
  emitAIVai: (payload: any) => void;
  debugReplan: (payload: any) => void;
}): { blocked: boolean; didReplan: boolean; nextLastReplanAt: number } {
  if (!params.cliff.isDeepVoid || params.dxAbs <= 38) {
    return { blocked: false, didReplan: false, nextLastReplanAt: params.lastReplanAt };
  }

  params.emitAIVai({
    type: 'bot_safety_reject',
    t: params.now,
    team: params.player.team,
    wormId: String(params.presenter.state.currentPlayerIndex ?? params.player.id ?? ''),
    turnNo: params.turnNo,
    reason: 'void_ahead',
    dir: params.dir,
    pos: { x: params.player.x, y: params.player.y },
    moveTo: { x: params.moveTo.x, y: params.moveTo.y },
    aiV: AI_V
  });

  const canReplan = params.now - params.lastReplanAt > params.replanCooldownSeconds;
  if (!canReplan) {
    return { blocked: true, didReplan: false, nextLastReplanAt: params.lastReplanAt };
  }

  const bannedTurn = params.presenter?.state?.mode === 'aivai2' ? ['walk'] : [];
  params.debugReplan({ reason: 'void_ahead', banned: bannedTurn });
  return { blocked: true, didReplan: true, nextLastReplanAt: params.now };
}
