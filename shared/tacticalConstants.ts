import type { MovementPattern, ReactionOption } from './types';

/** Canonical enums for LLM prompts and validation — keep in sync with MovementPattern / ReactionOption types. */
export const VALID_MOVEMENT_PATTERNS: readonly MovementPattern[] = [
  'approach_direct',
  'circle_strafe_left',
  'circle_strafe_right',
  'hit_and_retreat',
  'dodge_and_counter',
  'rush',
  'kite',
  'hold_position',
  'feint_approach',
  'retreat',
];

export const VALID_REACTION_OPTIONS: readonly ReactionOption[] = [
  'retreat',
  'rush',
  'use_ranged',
  'wait',
  'dodge_close',
  'hold',
  'berserk',
  'shield',
  'kite',
];
