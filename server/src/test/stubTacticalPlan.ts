import type { TacticalPlan } from '@shared/index';

/** Deterministic tactical plan for benchmarks/tests without LLM. */
export const STUB_TACTICAL_PLAN: TacticalPlan = {
  strategy: 'Stub plan for deterministic simulation.',
  movementPattern: 'approach_direct',
  primaryMove: 'basic_attack',
  dodgeFrequency: 25,
  aggressionLevel: 65,
  reactions: {
    ifOpponentShields: 'use_ranged',
    ifOpponentRetreats: 'rush',
    ifLowHP: 'berserk',
    ifOpponentUsesRanged: 'dodge_close',
  },
  reasoning: 'stub',
};
