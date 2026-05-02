import { AgentState, GameState, SimEvent } from '@shared/index';
/**
 * Begin an attack if the move is available, off cooldown, and in range.
 * Returns events (windup + optional move event).
 */
export declare function startAttack(agent: AgentState, opponent: AgentState, moveId: string, tick: number): {
    success: boolean;
    events: SimEvent[];
};
/**
 * Tick the attack state machine for one agent.
 * Returns events generated this tick.
 */
export declare function tickAttackState(agent: AgentState, opponent: AgentState, state: GameState): SimEvent[];
/**
 * Is the agent currently in a state where they can initiate a new attack?
 */
export declare function canInitiateAttack(agent: AgentState): boolean;
/**
 * Is the agent currently vulnerable (in recovery or whiff)?
 */
export declare function isVulnerable(agent: AgentState): boolean;
/**
 * Is the agent in windup (telegraphing an attack)?
 */
export declare function isWindingUp(agent: AgentState): boolean;
//# sourceMappingURL=attack.d.ts.map