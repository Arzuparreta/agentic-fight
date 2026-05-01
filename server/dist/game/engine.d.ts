import { GameState, SimEvent, AgentState, TacticalPlan, ActionHistoryEntry, RoundSummary } from '@shared/index';
import { AgentConfig } from './state';
import { AgentAction } from './actions';
export interface LLMClient {
    getAction: (agent: AgentState, opponent: AgentState, state: GameState, playstyleMemory: string, characterDescription: string, errorContext?: string) => Promise<AgentAction>;
}
export interface PlanClient {
    getPlan: (agent: AgentState, opponent: AgentState, state: GameState, playstyleMemory: string, characterDescription: string, errorContext?: string) => Promise<AgentPlan>;
    getTacticalPlan?: (agent: AgentState, opponent: AgentState, state: GameState, playstyleMemory: string, characterDescription: string, actionHistory: ActionHistoryEntry[], opponentHistory: ActionHistoryEntry[], roundSummaries: RoundSummary[]) => Promise<TacticalPlan>;
}
export interface AgentPlan {
    plan: 'approach' | 'retreat' | 'attack' | 'defend' | 'idle';
    preferredMove: string;
    reasoning: string;
}
export interface SimulationResult {
    eventLog: SimEvent[];
    reasoningLog: Record<string, {
        tick: number;
        action: string;
        reasoning: string;
    }[]>;
    winnerId: string | null;
    finalTick: number;
}
export declare function simulateRound(agentA: AgentConfig, agentB: AgentConfig, planClient?: any): Promise<SimulationResult>;
//# sourceMappingURL=engine.d.ts.map