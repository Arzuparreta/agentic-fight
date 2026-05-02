import { GameState, SimEvent } from '@shared/index';
export interface AgentAction {
    action: string;
    reasoning: string;
}
export interface ActionResult {
    valid: boolean;
    error?: string;
}
export declare function validateAction(state: GameState, agentId: string, action: AgentAction, availableMoves: string[]): ActionResult;
export declare function applyActions(state: GameState, actions: Record<string, AgentAction>): SimEvent[];
//# sourceMappingURL=actions.d.ts.map