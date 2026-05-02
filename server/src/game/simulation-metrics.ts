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

function emptyPerAgent(): PerAgentSimulationMetrics {
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

export function createSimulationMetrics(agentIds: string[]): SimulationMetrics {
  const perAgent: Record<string, PerAgentSimulationMetrics> = {};
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

export function recordAction(metrics: SimulationMetrics, agentId: string, action: string): void {
  const m = metrics.perAgent[agentId];
  if (!m) return;
  m.actionHistogram[action] = (m.actionHistogram[action] ?? 0) + 1;
  m.totalTicks++;
  if (action === 'idle') m.idleTicks++;
}

export function recordValidationFailure(metrics: SimulationMetrics, agentId: string, error: string | undefined): void {
  if (!error) return;
  const m = metrics.perAgent[agentId];
  if (!m) return;
  const key = error.length > 120 ? `${error.slice(0, 117)}...` : error;
  m.validationFailures[key] = (m.validationFailures[key] ?? 0) + 1;
}

export function recordPlanFetch(
  metrics: SimulationMetrics,
  kind: 'llm_success' | 'default' | 'retry_recovery',
  durationMs: number,
  err?: string
): void {
  const p = metrics.planFetches;
  p.totalDurationMs += durationMs;
  if (kind === 'llm_success') p.llmSuccess++;
  else if (kind === 'default') p.llmDefault++;
  else if (kind === 'retry_recovery') p.retryRecovery++;
  if (err && p.lastErrors.length < 20) p.lastErrors.push(err);
}

export function recordAdjustment(
  metrics: SimulationMetrics,
  agentId: string,
  kind: keyof PerAgentSimulationMetrics['adjustments']
): void {
  const m = metrics.perAgent[agentId];
  if (!m) return;
  m.adjustments[kind]++;
}
