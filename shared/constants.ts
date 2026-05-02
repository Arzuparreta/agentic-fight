export const ARENA = { width: 1000, height: 600 };
export const AGENT_HITBOX_RADIUS = 28;

export const TICK_RATE = 20;
export const MAX_TICKS_PER_ROUND = 400;
export const STARTING_HP = 200;

// ── Attack tuning ──
export const BASIC_ATTACK_DAMAGE = 15;
export const BASIC_ATTACK_RANGE = 90;
export const BASIC_ATTACK_COOLDOWN = 12;

// ── Movement physics ──
export const MOVEMENT_SPEED = 10;        // max speed units/tick
export const ACCELERATION = 2.5;         // units/tick²
export const FRICTION = 0.85;            // velocity multiplier per tick
export const TURN_SPEED = 0.35;          // radians per tick
export const DIAGONAL_SPEED_FACTOR = Math.SQRT1_2;

// ── Dodge physics ──
export const DODGE_BURST_SPEED = 22;     // initial burst speed
export const DODGE_DURATION_TICKS = 4;   // how long burst lasts
export const DODGE_COOLDOWN = 45;
export const DODGE_INVINCIBILITY_TICKS = 5;

// ── Planning ──
export const PLAN_INTERVAL = 40;         // ticks between LLM plan refreshes

export const TICK_DURATION_MS = 1000 / TICK_RATE;

// ── Economy ──
export const WINNER_EARNINGS = 3000;
export const LOSER_EARNINGS = 1400;
export const STARTING_MONEY = 800;
export const CONSECUTIVE_LOSS_BONUS = 200;
export const MAX_CONSECUTIVE_LOSS_BONUS = 600;

// ── Attack facing ──
export const ATTACK_FACING_TOLERANCE = Math.PI / 2; // ±90°
