import { describe, expect, it } from 'vitest';
import { stepTurn } from './TurnSystem';

describe('TurnSystem', () => {
  it('does not decrement timer in training', () => {
    const res = stepTurn({ mode: 'training', hasFiredThisTurn: false, isStable: true, turnTimeLeft: 30, dtTimer: 1 });
    expect(res.turnTimeLeft).toBe(30);
    expect(res.nextTurn).toBe(false);
  });

  it('ends turn in training after firing when stable', () => {
    const res = stepTurn({ mode: 'training', hasFiredThisTurn: true, isStable: true, turnTimeLeft: 30, dtTimer: 1 });
    expect(res.nextTurn).toBe(true);
    expect(res.turnTimeLeft).toBe(30);
  });

  it('decrements timer outside training and ends when timer reaches zero (stable)', () => {
    const r1 = stepTurn({ mode: 'ai', hasFiredThisTurn: false, isStable: true, turnTimeLeft: 0.5, dtTimer: 1 });
    expect(r1.turnTimeLeft).toBe(0);
    expect(r1.nextTurn).toBe(true);
  });
});

