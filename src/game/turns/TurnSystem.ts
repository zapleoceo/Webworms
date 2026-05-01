export type TurnMode = 'training' | 'ai' | 'aivai' | 'friend' | 'random';

export type TurnStepInput = {
  mode: TurnMode;
  hasFiredThisTurn: boolean;
  isStable: boolean;
  turnTimeLeft: number;
  dtTimer: number;
};

export type TurnStepOutput = {
  nextTurn: boolean;
  turnTimeLeft: number;
};

export function stepTurn(input: TurnStepInput): TurnStepOutput {
  const mode = input.mode;
  const dtTimer = Math.max(0, input.dtTimer);
  let ttl = typeof input.turnTimeLeft === 'number' ? Math.max(0, input.turnTimeLeft) : 0;

  if (ttl > 0 && mode !== 'training') {
    ttl -= dtTimer;
    if (ttl <= 0) ttl = 0;
  }

  const isStable = !!input.isStable;
  const fired = !!input.hasFiredThisTurn;

  if (fired && isStable) {
    return { nextTurn: true, turnTimeLeft: ttl };
  }

  if (ttl <= 0 && mode !== 'training' && isStable) {
    return { nextTurn: true, turnTimeLeft: ttl };
  }

  return { nextTurn: false, turnTimeLeft: ttl };
}
