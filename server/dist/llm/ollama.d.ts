import { AgentState, GameState, PlaystyleProfile, CoachingMessage } from '@shared/index';
export interface AgentAction {
    action: string;
    reasoning: string;
}
export interface AgentPlan {
    plan: 'approach' | 'retreat' | 'attack' | 'defend' | 'idle';
    preferredMove: string;
    reasoning: string;
}
export declare function getAgentPlan(agent: AgentState, opponent: AgentState, state: GameState, playstyleMemory: string, characterDescription: string, errorContext?: string): Promise<AgentPlan>;
export declare function getAgentAction(agent: AgentState, opponent: AgentState, state: GameState, playstyleMemory: string, characterDescription: string, errorContext?: string): Promise<AgentAction>;
export interface CoachingContext {
    agentName: string;
    characterDescription: string;
    money: number;
    ownedMoves: string[];
    ownedBoosts: string[];
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
//# sourceMappingURL=ollama.d.ts.map