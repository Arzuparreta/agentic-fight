import {
  AgentState,
  AgentPhysics,
  Vec2,
  Stats,
  ARENA,
  AGENT_HITBOX_RADIUS,
  ACCELERATION,
  FRICTION,
  TURN_SPEED,
  DODGE_BURST_SPEED,
  ATTACK_FACING_TOLERANCE,
  getMoveDef,
} from '@shared/index';

/* ─── Helpers ─── */

export function createDefaultPhysics(stats: Stats): AgentPhysics {
  return {
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    maxSpeed: stats.movementSpeed,
    acceleration: ACCELERATION,
    friction: FRICTION,
    turnSpeed: TURN_SPEED,
    facingAngle: 0,
  };
}

function vecLen(v: Vec2): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

function vecNormalize(v: Vec2): Vec2 {
  const len = vecLen(v);
  if (len === 0) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/* ─── Movement ─── */

/**
 * Apply acceleration toward an input angle.
 * `speedMult` reduces effective max speed (e.g. during recovery frames).
 */
export function applyMovementInput(agent: AgentState, inputAngle: number, speedMult: number = 1.0): void {
  const phys = agent.physics;
  const ax = Math.cos(inputAngle) * phys.acceleration;
  const ay = Math.sin(inputAngle) * phys.acceleration;

  phys.velocity.x += ax;
  phys.velocity.y += ay;

  const currentSpeed = vecLen(phys.velocity);
  const max = phys.maxSpeed * speedMult;
  if (currentSpeed > max) {
    const scale = max / currentSpeed;
    phys.velocity.x *= scale;
    phys.velocity.y *= scale;
  }
}

/**
 * Zero out velocity (gradual stop handled by friction normally).
 */
export function zeroVelocity(agent: AgentState): void {
  agent.physics.velocity = { x: 0, y: 0 };
}

/**
 * Apply friction and update position.
 */
export function stepPhysics(agent: AgentState): void {
  const phys = agent.physics;
  phys.velocity.x *= phys.friction;
  phys.velocity.y *= phys.friction;

  // Stop micro-drifting
  if (Math.abs(phys.velocity.x) < 0.05) phys.velocity.x = 0;
  if (Math.abs(phys.velocity.y) < 0.05) phys.velocity.y = 0;

  phys.position.x += phys.velocity.x;
  phys.position.y += phys.velocity.y;
}

/**
 * Clamp agent position to arena bounds, zeroing velocity component that hits wall.
 */
export function clampToArena(agent: AgentState): void {
  const phys = agent.physics;
  const r = AGENT_HITBOX_RADIUS;
  if (phys.position.x < r) {
    phys.position.x = r;
    phys.velocity.x = Math.max(0, phys.velocity.x);
  }
  if (phys.position.x > ARENA.width - r) {
    phys.position.x = ARENA.width - r;
    phys.velocity.x = Math.min(0, phys.velocity.x);
  }
  if (phys.position.y < r) {
    phys.position.y = r;
    phys.velocity.y = Math.max(0, phys.velocity.y);
  }
  if (phys.position.y > ARENA.height - r) {
    phys.position.y = ARENA.height - r;
    phys.velocity.y = Math.min(0, phys.velocity.y);
  }
}

/* ─── Collision ─── */

/**
 * Resolve overlap between two agents.
 * Uses continuous-style response: pushes apart and dampens velocities toward each other.
 */
export function resolveAgentCollision(a: AgentState, b: AgentState): void {
  const dx = b.physics.position.x - a.physics.position.x;
  const dy = b.physics.position.y - a.physics.position.y;
  const distSq = dx * dx + dy * dy;
  const minDist = AGENT_HITBOX_RADIUS * 2;

  if (distSq >= minDist * minDist || distSq === 0) return;

  const dist = Math.sqrt(distSq);
  const overlap = minDist - dist;
  const nx = dx / dist;
  const ny = dy / dist;

  // Position separation (70% of overlap for snappy feel)
  const sep = overlap * 0.5;
  a.physics.position.x -= nx * sep;
  a.physics.position.y -= ny * sep;
  b.physics.position.x += nx * sep;
  b.physics.position.y += ny * sep;

  // Velocity damping along collision normal (agents slide past each other instead of sticking)
  const vRelX = b.physics.velocity.x - a.physics.velocity.x;
  const vRelY = b.physics.velocity.y - a.physics.velocity.y;
  const vDotN = vRelX * nx + vRelY * ny;

  if (vDotN > 0) {
    const damp = 0.4; // how much to kill approach velocity
    const impulseX = nx * vDotN * damp;
    const impulseY = ny * vDotN * damp;
    a.physics.velocity.x += impulseX;
    a.physics.velocity.y += impulseY;
    b.physics.velocity.x -= impulseX;
    b.physics.velocity.y -= impulseY;
  }
}

/* ─── Facing ─── */

/**
 * Smoothly turn facing angle toward a target angle.
 */
export function turnToward(agent: AgentState, targetAngle: number): void {
  const phys = agent.physics;
  let diff = normalizeAngle(targetAngle - phys.facingAngle);
  const step = Math.min(Math.abs(diff), phys.turnSpeed);
  phys.facingAngle += Math.sign(diff) * step;
  phys.facingAngle = normalizeAngle(phys.facingAngle);

  // Legacy compat
  agent.facingAngle = phys.facingAngle;
}

/**
 * Instant snap to target angle (e.g. attack commitment).
 */
export function snapFacing(agent: AgentState, angle: number): void {
  agent.physics.facingAngle = normalizeAngle(angle);
  agent.facingAngle = agent.physics.facingAngle;
}

/**
 * Is the agent roughly facing a target position? (within ±90°)
 */
export function isFacingTarget(agent: AgentState, target: Vec2): boolean {
  const dx = target.x - agent.physics.position.x;
  const dy = target.y - agent.physics.position.y;
  const targetAngle = Math.atan2(dy, dx);
  const diff = Math.abs(normalizeAngle(targetAngle - agent.physics.facingAngle));
  return diff <= ATTACK_FACING_TOLERANCE;
}

/**
 * Angle from agent to target.
 */
export function angleToTarget(agent: AgentState, target: Vec2): number {
  const dx = target.x - agent.physics.position.x;
  const dy = target.y - agent.physics.position.y;
  return Math.atan2(dy, dx);
}

/**
 * Euclidean distance between two agents (center to center).
 */
export function distanceBetweenAgents(a: AgentState, b: AgentState): number {
  const dx = b.physics.position.x - a.physics.position.x;
  const dy = b.physics.position.y - a.physics.position.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function distanceBetween(a: Vec2, b: Vec2): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/* ─── Dodge ─── */

/**
 * Apply a burst of velocity in a dodge direction.
 * The burst decays naturally via friction over the next few ticks.
 */
export function applyDodgeBurst(agent: AgentState, direction: string): void {
  const phys = agent.physics;
  let dx = 0;
  let dy = 0;

  if (direction.includes('left')) dx -= 1;
  if (direction.includes('right')) dx += 1;
  if (direction.includes('up') && !direction.includes('left') && !direction.includes('right')) dy -= 1;
  if (direction.includes('down') && !direction.includes('left') && !direction.includes('right')) dy += 1;
  if (direction === 'dodge_up_left') { dx = -1; dy = -1; }
  if (direction === 'dodge_up_right') { dx = 1; dy = -1; }
  if (direction === 'dodge_down_left') { dx = -1; dy = 1; }
  if (direction === 'dodge_down_right') { dx = 1; dy = 1; }

  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  phys.velocity.x = (dx / len) * DODGE_BURST_SPEED;
  phys.velocity.y = (dy / len) * DODGE_BURST_SPEED;
}

/* ─── Speed Multipliers ─── */

/**
 * Get how much the agent's movement speed should be reduced right now.
 * Based on attack phase.
 */
export function getCurrentSpeedMultiplier(agent: AgentState): number {
  const atk = agent.attackState;
  if (atk.phase === 'idle') return 1.0;

  const def = getMoveDef(atk.moveId || 'basic_attack');
  if (!def || !def.attackProfile) return 1.0;

  const prof = def.attackProfile;
  if (atk.phase === 'windup') return prof.windupMoveSpeedMult;
  if (atk.phase === 'recovery' || atk.phase === 'whiff') return prof.recoveryMoveSpeedMult;
  return 1.0; // active phase — full speed (you commit forward with momentum)
}

/* ─── Position helpers ─── */

export function getPosition(agent: AgentState): Vec2 {
  return agent.physics.position;
}

export function setPosition(agent: AgentState, pos: Vec2): void {
  agent.physics.position = { ...pos };
}
