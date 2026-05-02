import { GameState, SimEvent, AgentState, ActionSequence, ActionHistoryEntry, RoundSummary } from '@shared/index';
import { AgentConfig } from './state';
import { type SimulationMetrics } from './simulation-metrics';
export interface TacticalSequenceClient {
    getSequence(agent: AgentState, opponent: AgentState, state: GameState, playstyleMemory: string, characterDescription: string, actionHistory: ActionHistoryEntry[], opponentHistory: ActionHistoryEntry[], roundSummaries: RoundSummary[]): Promise<ActionSequence>;
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
    metrics: SimulationMetrics;
}
export declare function simulateRound(agentA: AgentConfig, agentB: AgentConfig, sequenceClient?: TacticalSequenceClient): Promise<SimulationResult>;
//# sourceMappingURL=engine.d.ts.map