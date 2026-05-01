// Game balance constants — APPROVED in Phase 2
// These are intentionally centralized so they can be tweaked easily.

export const ARENA_WIDTH = 1000;
export const TICK_RATE = 20; // ticks per second of game time
export const MAX_TICKS_PER_ROUND = 600; // 30 seconds of game time
export const STARTING_HP = 150;
export const BASIC_ATTACK_DAMAGE = 8;
export const BASIC_ATTACK_RANGE = 80;
export const BASIC_ATTACK_COOLDOWN = 20; // ticks
export const MOVEMENT_SPEED = 3; // units per tick — baseline, modifiable by items

// Derived
export const TICK_DURATION_MS = 1000 / TICK_RATE; // 50ms per tick

// Economy — Phase 3
export const WINNER_EARNINGS = 3000;
export const LOSER_EARNINGS = 1400;
export const STARTING_MONEY = 800;
export const CONSECUTIVE_LOSS_BONUS = 200;
export const MAX_CONSECUTIVE_LOSS_BONUS = 600;
