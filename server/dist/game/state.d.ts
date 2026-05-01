import { AgentState, GameState, Stats } from '@shared/index';
export interface AgentConfig {
    id: string;
    name: string;
    stats: Stats;
    moves: string[];
    playstyleMemory: string;
    characterDescription: string;
}
export declare function createInitialState(agentA: AgentConfig, agentB: AgentConfig): GameState;
export declare function getOpponent(state: GameState, agentId: string): AgentState;
export declare function advanceCooldowns(state: GameState): void;
//# sourceMappingURL=state.d.ts.map