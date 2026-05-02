import { AgentState, GameState, ActionSequence } from '@shared/index';
export interface MacroResult {
    inputAngle: number | null;
    speedMult: number;
    moveId: string | null;
    dodgeDir: string | null;
    done: boolean;
    reasoning: string;
}
export declare function checkInterrupts(agent: AgentState, opponent: AgentState, state: GameState, conditions: string[]): {
    triggered: boolean;
    reason: string;
};
export declare function initSequenceExecution(seq: ActionSequence): {
    sequence: ActionSequence;
    currentActionIndex: number;
    ticksInCurrentAction: number;
};
export declare function tickSequenceExecution(exec: NonNullable<AgentState['sequenceExecution']>, agent: AgentState, opponent: AgentState, state: GameState): {
    result: MacroResult;
    advanced: boolean;
    events: {
        type: string;
        payload: Record<string, unknown>;
    }[];
};
//# sourceMappingURL=macros.d.ts.map