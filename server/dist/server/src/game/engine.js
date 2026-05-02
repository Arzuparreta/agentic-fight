import { PLAN_INTERVAL, } from '@shared/index';
import { createInitialState, getOpponent, advanceCooldowns } from './state';
import { stepPhysics, clampToArena, applyMovementInput, applyDodgeBurst, getCurrentSpeedMultiplier, resolveAgentCollision, distanceBetweenAgents, } from './physics';
import { startAttack, tickAttackState, canInitiateAttack } from './attack';
import { tickSequenceExecution, initSequenceExecution, } from './macros';
import { createSimulationMetrics, recordAction, recordPlanFetch, } from './simulation-metrics';
import { getSequenceWithTrace } from '../llm/ollama';
function euclideanDistance(a, b) {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}
function parsePlaystyleProfile(memory) {
    if (!memory)
        return null;
    try {
        const parsed = JSON.parse(memory);
        return { narrative: parsed.narrative || '', directives: parsed.directives || [] };
    }
    catch {
        return null;
    }
}
function createDefaultSequence() {
    return {
        strategy: 'Closing distance and attacking.',
        actions: [{ macro: 'approach', duration: 20 }, { macro: 'attack' }],
        interruptConditions: ['opponent_winding_up'],
        reasoning: 'Default sequence: approach and attack.',
    };
}
/* ─── Agent tick ─── */
function tickAgent(state, agent, opponent, metrics) {
    const events = [];
    // 1. Sequence execution
    let macroResult;
    if (agent.sequenceExecution) {
        const exec = tickSequenceExecution(agent.sequenceExecution, agent, opponent, state);
        macroResult = exec.result;
    }
    else {
        macroResult = defaultIdleBehavior(agent, opponent);
    }
    recordAction(metrics, agent.id, macroResult.reasoning);
    // 2. Apply dodge burst
    if (macroResult.dodgeDir && agent.dodgeCooldown <= 0 && !agent.isDodging) {
        applyDodgeBurst(agent, macroResult.dodgeDir);
        agent.dodgeCooldown = 45; // DODGE_COOLDOWN
        agent.dodgeInvincibleUntilTick = state.tick + 5; // DODGE_INVINCIBILITY_TICKS
        agent.isDodging = true;
        agent.dodgeDirection = macroResult.dodgeDir;
        events.push({
            tick: state.tick,
            agentId: agent.id,
            type: 'dodge_start',
            payload: { direction: macroResult.dodgeDir, position: { ...agent.physics.position } },
        });
    }
    // 3. Apply movement input
    const speedMult = getCurrentSpeedMultiplier(agent) * macroResult.speedMult;
    if (macroResult.inputAngle !== null) {
        applyMovementInput(agent, macroResult.inputAngle, speedMult);
    }
    // 4. Initiate attack
    if (macroResult.moveId && canInitiateAttack(agent)) {
        const atkRes = startAttack(agent, opponent, macroResult.moveId, state.tick);
        if (atkRes.success) {
            events.push(...atkRes.events);
        }
    }
    // 5. Tick attack state machine
    const attackEvents = tickAttackState(agent, opponent, state);
    events.push(...attackEvents);
    // 6. Step physics
    stepPhysics(agent);
    // 7. Generate movement event if position changed significantly
    // (We track last position in a way... actually we can just emit every tick for alive agents)
    events.push({
        tick: state.tick,
        agentId: agent.id,
        type: 'move',
        payload: {
            newPosition: { x: agent.physics.position.x, y: agent.physics.position.y },
            velocity: { x: agent.physics.velocity.x, y: agent.physics.velocity.y },
            facing: agent.physics.facingAngle,
            hp: agent.hp,
            maxHp: agent.maxHp,
        },
    });
    // 8. Dodge end check
    if (agent.isDodging && state.tick >= agent.dodgeInvincibleUntilTick) {
        agent.isDodging = false;
        agent.dodgeDirection = null;
        events.push({
            tick: state.tick,
            agentId: agent.id,
            type: 'dodge_end',
            payload: { position: { ...agent.physics.position } },
        });
    }
    return { events, reasoning: macroResult.reasoning };
}
function defaultIdleBehavior(agent, opponent) {
    // Face opponent, slight drift
    const toOpp = Math.atan2(opponent.physics.position.y - agent.physics.position.y, opponent.physics.position.x - agent.physics.position.x);
    return {
        inputAngle: null,
        speedMult: 1,
        moveId: null,
        dodgeDir: null,
        done: false,
        reasoning: 'Idle: waiting for next sequence',
    };
}
/* ─── Plan fetching ─── */
async function refreshPlanIfNeeded(agent, opponent, state, config, client, runtime, metrics) {
    if (state.tick < agent.lastPlanTick + PLAN_INTERVAL)
        return;
    try {
        const roundSummaries = [];
        const seq = await client.getSequence(agent, opponent, state, config.playstyleMemory, config.characterDescription, runtime.actionHistory, runtime.opponentActionHistory, roundSummaries);
        agent.sequenceExecution = initSequenceExecution(seq);
        agent.lastPlanTick = state.tick;
        recordPlanFetch(metrics, 'llm_success', 0); // duration tracked outside ideally
    }
    catch (err) {
        console.error(`[Tick ${state.tick}] Error getting sequence for ${agent.id}:`, err);
        agent.sequenceExecution = initSequenceExecution(createDefaultSequence());
        agent.lastPlanTick = state.tick;
        recordPlanFetch(metrics, 'default', 0, String(err));
    }
}
/* ─── Main simulation ─── */
export async function simulateRound(agentA, agentB, sequenceClient) {
    const state = createInitialState(agentA, agentB);
    const reasoningLog = {
        [agentA.id]: [],
        [agentB.id]: [],
    };
    const metrics = createSimulationMetrics([agentA.id, agentB.id]);
    const runtimes = {
        [agentA.id]: { actionHistory: [], opponentActionHistory: [] },
        [agentB.id]: { actionHistory: [], opponentActionHistory: [] },
    };
    const configs = { [agentA.id]: agentA, [agentB.id]: agentB };
    // Default client uses real LLM if none provided
    const client = sequenceClient ?? {
        async getSequence(agent, opponent, state, playstyleMemory, characterDescription, actionHistory, opponentHistory, roundSummaries) {
            const r = await getSequenceWithTrace(agent, opponent, state, playstyleMemory, characterDescription, actionHistory, opponentHistory, roundSummaries);
            return r.sequence;
        },
    };
    console.log(`[Engine] Starting simulation: ${agentA.name} vs ${agentB.name}`);
    while (state.tick < state.maxTicks) {
        const agents = Object.values(state.agents);
        const alive = agents.filter((a) => a.status === 'alive');
        if (alive.length < 2)
            break;
        // Fetch plans asynchronously for both agents
        const planPromises = alive.map((agent) => {
            const opponent = getOpponent(state, agent.id);
            return refreshPlanIfNeeded(agent, opponent, state, configs[agent.id], client, runtimes[agent.id], metrics);
        });
        await Promise.all(planPromises);
        // Tick each agent
        const tickResults = alive.map((agent) => {
            const opponent = getOpponent(state, agent.id);
            return tickAgent(state, agent, opponent, metrics);
        });
        // Collect events
        for (let i = 0; i < alive.length; i++) {
            const agent = alive[i];
            const res = tickResults[i];
            state.eventLog.push(...res.events);
            reasoningLog[agent.id].push({
                tick: state.tick,
                action: agent.attackState.moveId || agent.sequenceExecution?.sequence.actions[agent.sequenceExecution.currentActionIndex]?.macro || 'idle',
                reasoning: res.reasoning,
            });
        }
        // Post-tick physics resolution
        if (alive.length === 2) {
            resolveAgentCollision(alive[0], alive[1]);
        }
        for (const agent of alive) {
            clampToArena(agent);
        }
        // Advance cooldowns & status effects
        advanceCooldowns(state);
        // Record history
        for (const agent of alive) {
            const opponent = getOpponent(state, agent.id);
            const runtime = runtimes[agent.id];
            runtime.actionHistory.push({
                tick: state.tick,
                agentId: agent.id,
                action: agent.attackState.moveId || agent.sequenceExecution?.sequence.actions[agent.sequenceExecution.currentActionIndex]?.macro || 'idle',
                position: { x: agent.physics.position.x, y: agent.physics.position.y },
                hp: agent.hp,
                maxHp: agent.maxHp,
                distance: distanceBetweenAgents(agent, opponent),
                statusEffects: agent.statusEffects.map((se) => se.type),
            });
            runtime.opponentActionHistory.push({
                tick: state.tick,
                agentId: opponent.id,
                action: opponent.attackState.moveId || opponent.sequenceExecution?.sequence.actions[opponent.sequenceExecution.currentActionIndex]?.macro || 'idle',
                position: { x: opponent.physics.position.x, y: opponent.physics.position.y },
                hp: opponent.hp,
                maxHp: opponent.maxHp,
                distance: distanceBetweenAgents(agent, opponent),
                statusEffects: opponent.statusEffects.map((se) => se.type),
            });
            if (runtime.actionHistory.length > 30)
                runtime.actionHistory = runtime.actionHistory.slice(-30);
            if (runtime.opponentActionHistory.length > 30)
                runtime.opponentActionHistory = runtime.opponentActionHistory.slice(-30);
        }
        // Clean expired whiff windows
        for (const key of Object.keys(state.whiffWindows)) {
            if (state.tick > state.whiffWindows[key].untilTick) {
                delete state.whiffWindows[key];
            }
        }
        // Win check
        const stillAlive = Object.values(state.agents).filter((a) => a.status === 'alive');
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
        metrics,
    };
}
//# sourceMappingURL=engine.js.map