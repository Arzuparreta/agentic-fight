/** Aggregated per-round combat telemetry (server-only). */
export interface PerAgentSimulationMetrics {
    actionHistogram: Record<string, number>;
    /** Normalized validation error messages -> count */
    validationFailures: Record<string, number>;
    adjustments: {
        dodgeCooldownToMove: number;
        rangeToMove: number;
        moveToIdle: number;
        invalidToIdle: number;
    };
    idleTicks: number;
    totalTicks: number;
}
export interface PlanFetchMetrics {
    llmSuccess: number;
    llmDefault: number;
    retryRecovery: number;
    totalDurationMs: number;
    lastErrors: string[];
}
export interface SimulationMetrics {
    perAgent: Record<string, PerAgentSimulationMetrics>;
    planFetches: PlanFetchMetrics;
}
export declare function createSimulationMetrics(agentIds: string[]): SimulationMetrics;
export declare function recordAction(metrics: SimulationMetrics, agentId: string, action: string): void;
export declare function recordValidationFailure(metrics: SimulationMetrics, agentId: string, error: string | undefined): void;
export declare function recordPlanFetch(metrics: SimulationMetrics, kind: 'llm_success' | 'default' | 'retry_recovery', durationMs: number, err?: string): void;
export declare function recordAdjustment(metrics: SimulationMetrics, agentId: string, kind: keyof PerAgentSimulationMetrics['adjustments']): void;
//# sourceMappingURL=simulation-metrics.d.ts.map