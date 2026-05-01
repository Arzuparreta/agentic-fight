import { AgentState, TacticalPlan, ParsedDirective } from '@shared/index';
export interface ActionHistoryEntry {
    tick: number;
    agentId: string;
    action: string;
    position: {
        x: number;
        y: number;
    };
    hp: number;
    maxHp: number;
    distance: number;
    statusEffects: string[];
}
export interface OpponentTendencies {
    preferredMoves: Record<string, number>;
    dodgeFrequency: number;
    approachRetreatRatio: number;
    comboUsage: number;
    averageDistance: number;
    shieldUsage: number;
}
export interface BehaviorContext {
    agent: AgentState;
    opponent: AgentState;
    plan: TacticalPlan;
    hpRatio: number;
    opponentHpRatio: number;
    distance: number;
    idealDistance: number;
    history: ActionHistoryEntry[];
    opponentHistory: ActionHistoryEntry[];
    tick: number;
    maxTicks: number;
    tendencies: OpponentTendencies;
    directives: ParsedDirective[];
    comboState: ComboState;
}
export interface ComboState {
    currentCombo: string[] | null;
    comboStep: number;
    comboWaitTicks: number;
}
export declare function chooseAction(ctx: BehaviorContext): {
    action: string;
    reasoning: string;
};
export declare function analyzeOpponentTendencies(history: ActionHistoryEntry[]): OpponentTendencies;
export declare function buildBehaviorContext(agent: AgentState, opponent: AgentState, plan: TacticalPlan, history: ActionHistoryEntry[], opponentHistory: ActionHistoryEntry[], tick: number, maxTicks: number, directives: ParsedDirective[], comboState: ComboState): BehaviorContext;
//# sourceMappingURL=behavior.d.ts.map