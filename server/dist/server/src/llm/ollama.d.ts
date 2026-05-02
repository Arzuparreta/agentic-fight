import { AgentState, GameState, PlaystyleProfile, CoachingMessage, ActionSequence, ActionHistoryEntry, RoundSummary } from '@shared/index';
export interface AgentAction {
    action: string;
    reasoning: string;
}
export type SequenceSource = 'llm' | 'default' | 'retry_llm';
export interface SequenceCallResult {
    sequence: ActionSequence;
    source: SequenceSource;
    durationMs: number;
    error?: string;
}
export declare function getSequenceWithTrace(agent: AgentState, opponent: AgentState, state: GameState, playstyleMemory: string, characterDescription: string, actionHistory: ActionHistoryEntry[], opponentHistory: ActionHistoryEntry[], roundSummaries: RoundSummary[], errorContext?: string): Promise<SequenceCallResult>;
export declare function getTacticalPlanWithTrace(agent: AgentState, opponent: AgentState, state: GameState, playstyleMemory: string, characterDescription: string, actionHistory: ActionHistoryEntry[], opponentHistory: ActionHistoryEntry[], roundSummaries: RoundSummary[], errorContext?: string): Promise<any>;
export interface CoachingContext {
    agentName: string;
    characterDescription: string;
    lastRoundResult?: {
        won: boolean;
        score: string;
        notes: string;
    };
    opponentCharacter?: string;
    roundNumber: number;
}
export declare function generateAgentOpeningMessage(ctx: CoachingContext): Promise<string>;
export declare function generateAgentResponse(ctx: CoachingContext, conversation: CoachingMessage[], playerMessage: string): Promise<string>;
export declare function synthesizePlaystyle(ctx: CoachingContext, conversation: CoachingMessage[]): Promise<PlaystyleProfile>;
export declare function generateRoundSummary(agentName: string, characterDescription: string, eventLog: Array<{
    tick: number;
    agentId: string;
    type: string;
    payload: Record<string, unknown>;
}>, won: boolean, agentId: string, opponentId: string): Promise<RoundSummary>;
//# sourceMappingURL=ollama.d.ts.map