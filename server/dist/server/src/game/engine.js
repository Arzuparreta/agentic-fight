import { PLAN_INTERVAL, getAvailableMoves, } from '@shared/index';
import { createInitialState, getOpponent, advanceCooldowns } from './state';
import { validateAction, applyActions } from './actions';
import { getTacticalPlanWithTrace } from '../llm/ollama';
import { chooseAction, buildBehaviorContext, } from './behavior';
import { parseDirectives, mergeDirectivesIntoPlan } from './directives';
import { tickRand } from './rng';
import { createSimulationMetrics, recordAction, recordValidationFailure, recordPlanFetch, recordAdjustment, } from './simulation-metrics';
function euclideanDistance(a, b) {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}
function parsePlaystyleProfile(memory) {
    if (!memory)
        return null;
    try {
        return JSON.parse(memory);
    }
    catch {
        return null;
    }
}
function createDefaultPlan(aggressionLevel = 50) {
    return {
        strategy: 'Closing distance and attacking.',
        movementPattern: 'approach_direct',
        primaryMove: 'basic_attack',
        dodgeFrequency: 20,
        aggressionLevel,
        reactions: {
            ifOpponentShields: 'use_ranged',
            ifOpponentRetreats: 'rush',
            ifLowHP: 'berserk',
            ifOpponentUsesRanged: 'dodge_close',
        },
        reasoning: 'Default plan: approach and attack.',
    };
}
function createLlmTacticalClient(metrics) {
    return {
        async getPlan(agent, opponent, state, playstyleMemory, characterDescription, actionHistory, opponentHistory, roundSummaries) {
            const r = await getTacticalPlanWithTrace(agent, opponent, state, playstyleMemory, characterDescription, actionHistory, opponentHistory, roundSummaries);
            if (r.source === 'llm') {
                recordPlanFetch(metrics, 'llm_success', r.durationMs, r.error);
            }
            else if (r.source === 'retry_llm') {
                recordPlanFetch(metrics, 'retry_recovery', r.durationMs, r.error);
            }
            else {
                recordPlanFetch(metrics, 'default', r.durationMs, r.error);
            }
            return r.plan;
        },
    };
}
async function resolveAgentAction(state, agent, config, tacticalClient, runtimes, metrics) {
    const opponent = getOpponent(state, agent.id);
    let runtime = runtimes.get(agent.id);
    if (!runtime || state.tick >= runtime.planExpiresAt) {
        let newPlan;
        try {
            const history = runtime?.actionHistory ?? [];
            const oppHistory = runtime?.opponentActionHistory ?? [];
            const roundSummaries = [];
            newPlan = await tacticalClient.getPlan(agent, opponent, state, config.playstyleMemory, config.characterDescription, history, oppHistory, roundSummaries);
        }
        catch (err) {
            console.error(`[Tick ${state.tick}] Error getting plan for ${agent.id}:`, err);
            newPlan = createDefaultPlan();
        }
        const profile = parsePlaystyleProfile(config.playstyleMemory);
        const directives = profile ? parseDirectives(profile.directives) : [];
        newPlan = mergeDirectivesIntoPlan(newPlan, directives);
        runtime = {
            plan: newPlan,
            planExpiresAt: state.tick + PLAN_INTERVAL,
            playstyleProfile: profile,
            actionHistory: runtime?.actionHistory ?? [],
            opponentActionHistory: runtime?.opponentActionHistory ?? [],
            comboState: runtime?.comboState ?? { currentCombo: null, comboStep: 0, comboWaitTicks: 0 },
            strafeSign: runtime?.strafeSign ?? (tickRand(agent.id, state.tick, 992) < 0.5 ? -1 : 1),
            strafeCommitUntil: runtime?.strafeCommitUntil ?? state.tick + 8,
        };
        runtimes.set(agent.id, runtime);
    }
    const patience = runtime.playstyleProfile?.parameters?.patience ?? 50;
    if (state.tick >= runtime.strafeCommitUntil) {
        runtime.strafeSign = tickRand(agent.id, state.tick, 991) < 0.5 ? -1 : 1;
        const span = 10 + Math.floor((patience / 100) * 14);
        runtime.strafeCommitUntil = state.tick + span;
    }
    const directiveList = runtime.playstyleProfile?.directives ?? [];
    const ctx = buildBehaviorContext(agent, opponent, runtime.plan, runtime.actionHistory, runtime.opponentActionHistory, state.tick, state.maxTicks, parseDirectives(directiveList), runtime.comboState, runtime.playstyleProfile?.parameters ?? null, runtime.strafeSign);
    const result = chooseAction(ctx);
    const available = getAvailableMoves(agent);
    const validation = validateAction(state, agent.id, result, available);
    if (validation.valid) {
        recordAction(metrics, agent.id, result.action);
        return result;
    }
    recordValidationFailure(metrics, agent.id, validation.error);
    if (result.action.startsWith('dodge_') && agent.dodgeCooldown > 0) {
        recordAdjustment(metrics, agent.id, 'dodgeCooldownToMove');
        const dx = opponent.position.x - agent.position.x;
        const dy = opponent.position.y - agent.position.y;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        const adjusted = absDx > absDy
            ? { action: dx > 0 ? 'move_right' : 'move_left', reasoning: `${result.reasoning} (dodge on cooldown, moving instead)` }
            : { action: dy > 0 ? 'move_down' : 'move_up', reasoning: `${result.reasoning} (dodge on cooldown, moving instead)` };
        recordAction(metrics, agent.id, adjusted.action);
        return adjusted;
    }
    if (result.action === 'basic_attack' && validation.error?.includes('range')) {
        recordAdjustment(metrics, agent.id, 'rangeToMove');
        const dx = opponent.position.x - agent.position.x;
        const dy = opponent.position.y - agent.position.y;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        const adjusted = absDx > absDy
            ? { action: dx > 0 ? 'move_right' : 'move_left', reasoning: `${result.reasoning} (adjusted: out of range)` }
            : { action: dy > 0 ? 'move_down' : 'move_up', reasoning: `${result.reasoning} (adjusted: out of range)` };
        recordAction(metrics, agent.id, adjusted.action);
        return adjusted;
    }
    if (result.action.startsWith('move_')) {
        recordAdjustment(metrics, agent.id, 'moveToIdle');
        const idle = { action: 'idle', reasoning: `${result.reasoning} (adjusted: cannot move)` };
        recordAction(metrics, agent.id, 'idle');
        return idle;
    }
    recordAdjustment(metrics, agent.id, 'invalidToIdle');
    const idle = { action: 'idle', reasoning: `${result.reasoning} (adjusted: invalid, idling)` };
    recordAction(metrics, agent.id, 'idle');
    return idle;
}
export async function simulateRound(agentA, agentB, planClient) {
    const state = createInitialState(agentA, agentB);
    const reasoningLog = {
        [agentA.id]: [],
        [agentB.id]: [],
    };
    const metrics = createSimulationMetrics([agentA.id, agentB.id]);
    const runtimes = new Map();
    const client = planClient ?? createLlmTacticalClient(metrics);
    console.log(`[Engine] Starting simulation: ${agentA.name} vs ${agentB.name}`);
    while (state.tick < state.maxTicks) {
        const agents = Object.values(state.agents);
        const alive = agents.filter((a) => a.status === 'alive');
        if (alive.length < 2) {
            break;
        }
        const configs = { [agentA.id]: agentA, [agentB.id]: agentB };
        const idxById = new Map(alive.map((a, i) => [a.id, i]));
        const actionPromises = alive.map((agent) => resolveAgentAction(state, agent, configs[agent.id], client, runtimes, metrics));
        const resolvedActions = await Promise.all(actionPromises);
        const actions = {};
        alive.forEach((agent, i) => {
            actions[agent.id] = resolvedActions[i];
            reasoningLog[agent.id].push({
                tick: state.tick,
                action: resolvedActions[i].action,
                reasoning: resolvedActions[i].reasoning,
            });
        });
        const tickEvents = applyActions(state, actions);
        state.eventLog.push(...tickEvents);
        for (const agent of alive) {
            const opp = getOpponent(state, agent.id);
            const runtime = runtimes.get(agent.id);
            const ai = idxById.get(agent.id) ?? 0;
            const oi = idxById.get(opp.id) ?? 0;
            if (runtime) {
                runtime.actionHistory.push({
                    tick: state.tick,
                    agentId: agent.id,
                    action: resolvedActions[ai].action,
                    position: { x: agent.position.x, y: agent.position.y },
                    hp: agent.hp,
                    maxHp: agent.maxHp,
                    distance: euclideanDistance(agent.position, opp.position),
                    statusEffects: agent.statusEffects.map((se) => se.type),
                });
                runtime.opponentActionHistory.push({
                    tick: state.tick,
                    agentId: opp.id,
                    action: resolvedActions[oi]?.action ?? 'idle',
                    position: { x: opp.position.x, y: opp.position.y },
                    hp: opp.hp,
                    maxHp: opp.maxHp,
                    distance: euclideanDistance(agent.position, opp.position),
                    statusEffects: opp.statusEffects.map((se) => se.type),
                });
                if (runtime.actionHistory.length > 30) {
                    runtime.actionHistory = runtime.actionHistory.slice(-30);
                }
                if (runtime.opponentActionHistory.length > 30) {
                    runtime.opponentActionHistory = runtime.opponentActionHistory.slice(-30);
                }
            }
        }
        advanceCooldowns(state);
        for (const agent of alive) {
            if (state.tick >= agent.invincibleUntilTick) {
                agent.isDodging = false;
            }
        }
        const stillAlive = agents.filter((a) => a.status === 'alive');
        if (stillAlive.length < 2) {
            state.tick++;
            break;
        }
        state.tick++;
    }
    const aliveAgents = Object.values(state.agents).filter((a) => a.status === 'alive');
    let winnerId = null;
    if (aliveAgents.length === 1) {
        winnerId = aliveAgents[0].id;
    }
    else if (aliveAgents.length === 2) {
        const [a, b] = aliveAgents;
        if (a.hp !== b.hp) {
            winnerId = a.hp > b.hp ? a.id : b.id;
        }
    }
    console.log(`[Engine] Simulation complete at tick ${state.tick}. Winner: ${winnerId || 'draw'}`);
    console.log(`[Metrics] idle A:${metrics.perAgent[agentA.id]?.idleTicks}/${metrics.perAgent[agentA.id]?.totalTicks} B:${metrics.perAgent[agentB.id]?.idleTicks}/${metrics.perAgent[agentB.id]?.totalTicks} plans llm:${metrics.planFetches.llmSuccess} default:${metrics.planFetches.llmDefault} retry:${metrics.planFetches.retryRecovery}`);
    return {
        eventLog: state.eventLog,
        reasoningLog,
        winnerId,
        finalTick: state.tick,
        metrics,
    };
}
//# sourceMappingURL=engine.js.map