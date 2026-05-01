import {
  GameState,
  SimEvent,
  AgentState,
  getAvailableMoves,
} from '@shared/index';
import { AgentConfig, createInitialState, getOpponent, advanceCooldowns } from './state';
import { AgentAction, validateAction, applyActions } from './actions';
import { getAgentPlan, AgentPlan } from '../llm/ollama';

export interface LLMClient {
  getAction: (
    agent: AgentState,
    opponent: AgentState,
    state: GameState,
    playstyleMemory: string,
    characterDescription: string,
    errorContext?: string
  ) => Promise<AgentAction>;
}

export interface PlanClient {
  getPlan: (
    agent: AgentState,
    opponent: AgentState,
    state: GameState,
    playstyleMemory: string,
    characterDescription: string,
    errorContext?: string
  ) => Promise<AgentPlan>;
}

export interface SimulationResult {
  eventLog: SimEvent[];
  reasoningLog: Record<string, { tick: number; action: string; reasoning: string }[]>;
  winnerId: string | null;
  finalTick: number;
}

const MAX_RETRIES = 2;
const PLAN_INTERVAL = 20; // Call LLM every 20 ticks (1 second of game time)

interface AgentRuntime {
  plan: AgentPlan;
  planExpiresAt: number;
}

function executePlan(
  agent: AgentState,
  opponent: AgentState,
  runtime: AgentRuntime
): AgentAction {
  const dist = Math.abs(agent.position - opponent.position);
  const plan = runtime.plan;

  // Determine preferred move availability
  const preferredMove = plan.preferredMove || 'basic_attack';
  const preferredOffCooldown = (agent.cooldowns[preferredMove] ?? 0) <= 0;
  const basicOffCooldown = (agent.cooldowns['basic_attack'] ?? 0) <= 0;

  // Check if preferred move is in range (for moves with defined range)
  const availableMoves = getAvailableMoves(agent);

  switch (plan.plan) {
    case 'approach': {
      // Move toward opponent. Attack with preferred move if in range and off cooldown.
      const moveDir = agent.position < opponent.position ? 'move_right' : 'move_left';
      if (dist <= 80 && basicOffCooldown) {
        return { action: 'basic_attack', reasoning: `${plan.reasoning} (executing: close and strike)` };
      }
      return { action: moveDir, reasoning: `${plan.reasoning} (executing: advancing)` };
    }

    case 'retreat': {
      // Move away from opponent
      const moveDir = agent.position < opponent.position ? 'move_left' : 'move_right';
      if (dist <= 80 && basicOffCooldown) {
        // Even when retreating, throw a parting shot if possible
        return { action: 'basic_attack', reasoning: `${plan.reasoning} (executing: parting shot)` };
      }
      return { action: moveDir, reasoning: `${plan.reasoning} (executing: falling back)` };
    }

    case 'attack': {
      // Aggressively close distance and use preferred move
      const moveDir = agent.position < opponent.position ? 'move_right' : 'move_left';
      if (dist <= 80 && basicOffCooldown) {
        return { action: 'basic_attack', reasoning: `${plan.reasoning} (executing: full assault)` };
      }
      return { action: moveDir, reasoning: `${plan.reasoning} (executing: pushing forward)` };
    }

    case 'defend': {
      // Hold position, only counter-attack if opponent is very close
      if (dist <= 60 && basicOffCooldown) {
        return { action: 'basic_attack', reasoning: `${plan.reasoning} (executing: counter-strike)` };
      }
      return { action: 'idle', reasoning: `${plan.reasoning} (executing: holding ground)` };
    }

    case 'idle':
    default: {
      return { action: 'idle', reasoning: `${plan.reasoning} (executing: waiting)` };
    }
  }
}

async function resolveAgentAction(
  state: GameState,
  agent: AgentState,
  config: AgentConfig,
  planClient: PlanClient,
  runtimes: Map<string, AgentRuntime>,
  retries = 0
): Promise<AgentAction> {
  const opponent = getOpponent(state, agent.id);
  let runtime = runtimes.get(agent.id);

  // If no plan or plan expired, get a new one from LLM
  if (!runtime || state.tick >= runtime.planExpiresAt) {
    const plan = await planClient.getPlan(
      agent,
      opponent,
      state,
      config.playstyleMemory,
      config.characterDescription
    );

    // Validate the plan
    const available = getAvailableMoves(agent);
    if (!['approach', 'retreat', 'attack', 'defend', 'idle'].includes(plan.plan)) {
      if (retries < MAX_RETRIES) {
        console.log(`[Tick ${state.tick}] Agent ${agent.id} invalid plan "${plan.plan}". Retrying...`);
        return resolveAgentAction(state, agent, config, planClient, runtimes, retries + 1);
      }
      console.log(`[Tick ${state.tick}] Agent ${agent.id} exhausted plan retries. Falling back to approach.`);
      runtime = { plan: { plan: 'approach', preferredMove: 'basic_attack', reasoning: 'Fallback plan.' }, planExpiresAt: state.tick + PLAN_INTERVAL };
    } else if (
      plan.preferredMove !== 'idle' &&
      plan.preferredMove !== 'move_left' &&
      plan.preferredMove !== 'move_right' &&
      !available.includes(plan.preferredMove)
    ) {
      if (retries < MAX_RETRIES) {
        console.log(`[Tick ${state.tick}] Agent ${agent.id} preferred move "${plan.preferredMove}" unavailable. Retrying...`);
        return resolveAgentAction(state, agent, config, planClient, runtimes, retries + 1);
      }
      runtime = { plan: { ...plan, preferredMove: 'basic_attack' }, planExpiresAt: state.tick + PLAN_INTERVAL };
    } else {
      runtime = { plan, planExpiresAt: state.tick + PLAN_INTERVAL };
    }

    runtimes.set(agent.id, runtime);
  }

  // Execute the plan deterministically
  const action = executePlan(agent, opponent, runtime);

  const available = getAvailableMoves(agent);
  const validation = validateAction(state, agent.id, action, available);

  if (validation.valid) {
    return action;
  }

  // If plan execution produces invalid action, try to salvage
  if (action.action === 'basic_attack' && validation.error?.includes('range')) {
    // Out of range, move toward instead
    const moveDir = agent.position < opponent.position ? 'move_right' : 'move_left';
    return { action: moveDir, reasoning: `${action.reasoning} (adjusted: out of range)` };
  }

  if (action.action.startsWith('move_')) {
    // Movement blocked or invalid, just idle
    return { action: 'idle', reasoning: `${action.reasoning} (adjusted: cannot move)` };
  }

  return { action: 'idle', reasoning: `${action.reasoning} (adjusted: invalid, idling)` };
}

export async function simulateRound(
  agentA: AgentConfig,
  agentB: AgentConfig,
  planClient?: PlanClient
): Promise<SimulationResult> {
  const state = createInitialState(agentA, agentB);
  const reasoningLog: Record<string, { tick: number; action: string; reasoning: string }[]> = {
    [agentA.id]: [],
    [agentB.id]: [],
  };

  const runtimes = new Map<string, AgentRuntime>();
  const client = planClient || { getPlan: getAgentPlan };

  console.log(`[Engine] Starting simulation: ${agentA.name} vs ${agentB.name}`);

  while (state.tick < state.maxTicks) {
    const agents = Object.values(state.agents);

    // Check if anyone is already dead before tick
    const alive = agents.filter((a) => a.status === 'alive');
    if (alive.length < 2) {
      break;
    }

    // Get actions from both agents in parallel
    const configs = { [agentA.id]: agentA, [agentB.id]: agentB };
    const actionPromises = alive.map((agent) =>
      resolveAgentAction(state, agent, configs[agent.id], client, runtimes)
    );
    const resolvedActions = await Promise.all(actionPromises);

    const actions: Record<string, AgentAction> = {};
    alive.forEach((agent, i) => {
      actions[agent.id] = resolvedActions[i];
      reasoningLog[agent.id].push({
        tick: state.tick,
        action: resolvedActions[i].action,
        reasoning: resolvedActions[i].reasoning,
      });
    });

    // Apply actions simultaneously
    const tickEvents = applyActions(state, actions);
    state.eventLog.push(...tickEvents);

    // Advance cooldowns
    advanceCooldowns(state);

    // Check win condition
    const stillAlive = agents.filter((a) => a.status === 'alive');
    if (stillAlive.length < 2) {
      state.tick++;
      break;
    }

    state.tick++;
  }

  const aliveAgents = Object.values(state.agents).filter((a) => a.status === 'alive');
  let winnerId: string | null = null;

  if (aliveAgents.length === 1) {
    winnerId = aliveAgents[0].id;
  } else if (aliveAgents.length === 2) {
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
