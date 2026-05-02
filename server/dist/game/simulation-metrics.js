/** Aggregated per-round combat telemetry (server-only). */
function emptyPerAgent() {
    return {
        actionHistogram: {},
        validationFailures: {},
        adjustments: {
            dodgeCooldownToMove: 0,
            rangeToMove: 0,
            moveToIdle: 0,
            invalidToIdle: 0,
        },
        idleTicks: 0,
        totalTicks: 0,
    };
}
export function createSimulationMetrics(agentIds) {
    const perAgent = {};
    for (const id of agentIds) {
        perAgent[id] = emptyPerAgent();
    }
    return {
        perAgent,
        planFetches: {
            llmSuccess: 0,
            llmDefault: 0,
            retryRecovery: 0,
            totalDurationMs: 0,
            lastErrors: [],
        },
    };
}
export function recordAction(metrics, agentId, action) {
    const m = metrics.perAgent[agentId];
    if (!m)
        return;
    m.actionHistogram[action] = (m.actionHistogram[action] ?? 0) + 1;
    m.totalTicks++;
    if (action === 'idle')
        m.idleTicks++;
}
export function recordValidationFailure(metrics, agentId, error) {
    if (!error)
        return;
    const m = metrics.perAgent[agentId];
    if (!m)
        return;
    const key = error.length > 120 ? `${error.slice(0, 117)}...` : error;
    m.validationFailures[key] = (m.validationFailures[key] ?? 0) + 1;
}
export function recordPlanFetch(metrics, kind, durationMs, err) {
    const p = metrics.planFetches;
    p.totalDurationMs += durationMs;
    if (kind === 'llm_success')
        p.llmSuccess++;
    else if (kind === 'default')
        p.llmDefault++;
    else if (kind === 'retry_recovery')
        p.retryRecovery++;
    if (err && p.lastErrors.length < 20)
        p.lastErrors.push(err);
}
export function recordAdjustment(metrics, agentId, kind) {
    const m = metrics.perAgent[agentId];
    if (!m)
        return;
    m.adjustments[kind]++;
}
//# sourceMappingURL=simulation-metrics.js.map