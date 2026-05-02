import { GameState, SimEvent, AgentState, TacticalPlan, ActionHistoryEntry, RoundSummary } from '@shared/index';
import { AgentConfig } from './state';
import { AgentAction } from './actions';
import { type SimulationMetrics } from './simulation-metrics';
export interface LLMClient {
    getAction: (agent: AgentState, opponent: AgentState, state: GameState, playstyleMemory: string, characterDescription: string, errorContext?: string) => Promise<AgentAction>;
}
/** Injectable tactical planner (e.g. LLM or deterministic stub for tests). */
export interface TacticalPlanClient {
    getPlan(agent: AgentState, opponent: AgentState, state: GameState, playstyleMemory: string, characterDescription: string, actionHistory: ActionHistoryEntry[], opponentHistory: ActionHistoryEntry[], roundSummaries: RoundSummary[]): Promise<TacticalPlan>;
}
/** @deprecated Use TacticalPlanClient — alias for room/tests */
export type PlanClient = TacticalPlanClient;
export interface SimulationResult {
    eventLog: SimEvent[];
    reasoningLog: Record<string, {
        tick: number;
        action: string;
        reasoning: string;
    }[]>;
    winnerId: string | null;
    finalTick: number;
    metrics: SimulationMetrics;
}
export declare function simulateRound(agentA: AgentConfig, agentB: AgentConfig, planClient?: TacticalPlanClient): Promise<SimulationResult>;
//# sourceMappingURL=engine.d.ts.map