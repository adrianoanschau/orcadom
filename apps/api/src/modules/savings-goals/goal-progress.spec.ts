import { describe, expect, it } from 'vitest';
import { computeGoalProgress, isGoalReached } from './goal-progress.js';

describe('computeGoalProgress', () => {
  it('meta sem nenhuma transferência ainda', () => {
    expect(computeGoalProgress(0, 5000)).toEqual({
      saved: 0,
      ratio: 0,
      remaining: 5000,
    });
  });

  it('meta com entradas e saídas', () => {
    expect(computeGoalProgress(800, 5000)).toEqual({
      saved: 800,
      ratio: 0.16,
      remaining: 4200,
    });
  });

  it('meta que já atingiu o alvo', () => {
    expect(computeGoalProgress(5000, 5000)).toEqual({
      saved: 5000,
      ratio: 1,
      remaining: 0,
    });
    expect(computeGoalProgress(5500, 5000)).toEqual({
      saved: 5500,
      ratio: 1.1,
      remaining: -500,
    });
  });
});

describe('isGoalReached', () => {
  it('só marca conclusão no alvo ou acima', () => {
    expect(isGoalReached(0, 5000)).toBe(false);
    expect(isGoalReached(4999.99, 5000)).toBe(false);
    expect(isGoalReached(5000, 5000)).toBe(true);
    expect(isGoalReached(5000, 0)).toBe(false);
  });
});
