import { getAvailableMoves, PLAN_INTERVAL, } from '@shared/index';
import { createInitialState, getOpponent, advanceCooldowns } from './state';
import { validateAction, applyActions } from './actions';
import { getTacticalPlan } from '../llm/ollama';
import { chooseAction, buildBehaviorContext, } from './behavior';
import { parseDirectives, mergeDirectivesIntoPlan } from './directives';
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
        strategy: 'Adapt to the situation.',
        movementPattern: 'approach_direct',
        primaryMove: 'basic_attack',
        dodgeFrequency: 30,
        aggressionLevel,
        reactions: {
            ifOpponentShields: 'wait',
            ifOpponentRetreats: 'hold',
            ifLowHP: 'retreat',
            ifOpponentUsesRanged: 'dodge_close',
        },
        reasoning: 'Default tactical plan.',
    };
}
async function resolveAgentAction(state, agent, config, tacticalClient, runtimes, retries = 0) {
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
        };
        runtimes.set(agent.id, runtime);
    }
    const ctx = buildBehaviorContext(agent, opponent, runtime.plan, runtime.actionHistory, runtime.opponentActionHistory, state.tick, state.maxTicks, runtime.playstyleProfile ? parseDirectives(runtime.playstyleProfile.directives) : [], runtime.comboState);
    const result = chooseAction(ctx);
    const available = getAvailableMoves(agent);
    const validation = validateAction(state, agent.id, result, available);
    if (validation.valid) {
        return result;
    }
    if (result.action.startsWith('dodge_') && agent.dodgeCooldown > 0) {
        const dx = opponent.position.x - agent.position.x;
        const dy = opponent.position.y - agent.position.y;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        if (absDx > absDy) {
            return { action: dx > 0 ? 'move_right' : 'move_left', reasoning: `${result.reasoning} (dodge on cooldown, moving instead)` };
        }
        return { action: dy > 0 ? 'move_down' : 'move_up', reasoning: `${result.reasoning} (dodge on cooldown, moving instead)` };
    }
    if (result.action === 'basic_attack' && validation.error?.includes('range')) {
        const dx = opponent.position.x - agent.position.x;
        const dy = opponent.position.y - agent.position.y;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        if (absDx > absDy) {
            return { action: dx > 0 ? 'move_right' : 'move_left', reasoning: `${result.reasoning} (adjusted: out of range)` };
        }
        return { action: dy > 0 ? 'move_down' : 'move_up', reasoning: `${result.reasoning} (adjusted: out of range)` };
    }
    if (result.action.startsWith('move_')) {
        return { action: 'idle', reasoning: `${result.reasoning} (adjusted: cannot move)` };
    }
    return { action: 'idle', reasoning: `${result.reasoning} (adjusted: invalid, idling)` };
}
function createDefaultTacticalClient() {
    return {
        async getPlan(agent, opponent, state, playstyleMemory, characterDescription, actionHistory, opponentHistory, roundSummaries) {
            return getTacticalPlan(agent, opponent, state, playstyleMemory, characterDescription, actionHistory, opponentHistory, roundSummaries);
        },
    };
}
export async function simulateRound(agentA, agentB, planClient) {
    const state = createInitialState(agentA, agentB);
    const reasoningLog = {
        [agentA.id]: [],
        [agentB.id]: [],
    };
    const runtimes = new Map();
    const client = createDefaultTacticalClient();
    console.log(`[Engine] Starting simulation: ${agentA.name} vs ${agentB.name}`);
    while (state.tick < state.maxTicks) {
        const agents = Object.values(state.agents);
        const alive = agents.filter((a) => a.status === 'alive');
        if (alive.length < 2) {
            break;
        }
        const configs = { [agentA.id]: agentA, [agentB.id]: agentB };
        const actionPromises = alive.map((agent) => resolveAgentAction(state, agent, configs[agent.id], client, runtimes));
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
            if (runtime) {
                runtime.actionHistory.push({
                    tick: state.tick,
                    agentId: agent.id,
                    action: resolvedActions[alive.indexOf(agent)].action,
                    position: { x: agent.position.x, y: agent.position.y },
                    hp: agent.hp,
                    maxHp: agent.maxHp,
                    distance: euclideanDistance(agent.position, opp.position),
                    statusEffects: agent.statusEffects.map((se) => se.type),
                });
                runtime.opponentActionHistory.push({
                    tick: state.tick,
                    agentId: opp.id,
                    action: resolvedActions[alive.indexOf(opp) !== -1 ? alive.indexOf(opp) : 0]?.action ?? 'idle',
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
        // Clear invincibility if expired
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
    return {
        eventLog: state.eventLog,
        reasoningLog,
        winnerId,
        finalTick: state.tick,
    };
}
//# sourceMappingURL=engine.js.map