import { GameState, SimEvent, AgentState } from '@shared/index';
import { AgentConfig } from './state';
import { AgentAction } from './actions';
import { AgentPlan } from '../llm/ollama';
export interface LLMClient {
    getAction: (agent: AgentState, opponent: AgentState, state: GameState, playstyleMemory: string, characterDescription: string, errorContext?: string) => Promise<AgentAction>;
}
export interface PlanClient {
    getPlan: (agent: AgentState, opponent: AgentState, state: GameState, playstyleMemory: string, characterDescription: string, errorContext?: string) => Promise<AgentPlan>;
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
export declare function simulateRound(agentA: AgentConfig, agentB: AgentConfig, planClient?: PlanClient): Promise<SimulationResult>;
//# sourceMappingURL=engine.d.ts.map