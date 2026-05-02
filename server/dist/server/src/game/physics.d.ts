import { AgentState, AgentPhysics, Vec2, Stats } from '@shared/index';
export declare function createDefaultPhysics(stats: Stats): AgentPhysics;
/**
 * Apply acceleration toward an input angle.
 * `speedMult` reduces effective max speed (e.g. during recovery frames).
 */
export declare function applyMovementInput(agent: AgentState, inputAngle: number, speedMult?: number): void;
/**
 * Zero out velocity (gradual stop handled by friction normally).
 */
export declare function zeroVelocity(agent: AgentState): void;
/**
 * Apply friction and update position.
 */
export declare function stepPhysics(agent: AgentState): void;
/**
 * Clamp agent position to arena bounds, zeroing velocity component that hits wall.
 */
export declare function clampToArena(agent: AgentState): void;
/**
 * Resolve overlap between two agents.
 * Uses continuous-style response: pushes apart and dampens velocities toward each other.
 */
export declare function resolveAgentCollision(a: AgentState, b: AgentState): void;
/**
 * Smoothly turn facing angle toward a target angle.
 */
export declare function turnToward(agent: AgentState, targetAngle: number): void;
/**
 * Instant snap to target angle (e.g. attack commitment).
 */
export declare function snapFacing(agent: AgentState, angle: number): void;
/**
 * Is the agent roughly facing a target position? (within ±90°)
 */
export declare function isFacingTarget(agent: AgentState, target: Vec2): boolean;
/**
 * Angle from agent to target.
 */
export declare function angleToTarget(agent: AgentState, target: Vec2): number;
/**
 * Euclidean distance between two agents (center to center).
 */
export declare function distanceBetweenAgents(a: AgentState, b: AgentState): number;
export declare function distanceBetween(a: Vec2, b: Vec2): number;
/**
 * Apply a burst of velocity in a dodge direction.
 * The burst decays naturally via friction over the next few ticks.
 */
export declare function applyDodgeBurst(agent: AgentState, direction: string): void;
/**
 * Get how much the agent's movement speed should be reduced right now.
 * Based on attack phase.
 */
export declare function getCurrentSpeedMultiplier(agent: AgentState): number;
export declare function getPosition(agent: AgentState): Vec2;
export declare function setPosition(agent: AgentState, pos: Vec2): void;
//# sourceMappingURL=physics.d.ts.map