import {
  GameState,
  SimEvent,
  AgentState,
  getAvailableMoves,
  getMoveDef,
  PlaystyleProfile,
  PlaystyleParameters,
  TacticalPlan,
  ActionHistoryEntry,
  OpponentTendencies,
  RoundSummary,
  PLAN_INTERVAL,
} from '@shared/index';
import { AgentConfig, createInitialState, getOpponent, advanceCooldowns } from './state';
import { AgentAction, validateAction, applyActions } from './actions';
import { getTacticalPlan } from '../llm/ollama';
import {
  chooseAction,
  buildBehaviorContext,
  analyzeOpponentTendencies,
  ComboState,
} from './behavior';
import { parseDirectives, mergeDirectivesIntoPlan } from './directives';

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
  getTacticalPlan?: (
    agent: AgentState,
    opponent: AgentState,
    state: GameState,
    playstyleMemory: string,
    characterDescription: string,
    actionHistory: ActionHistoryEntry[],
    opponentHistory: ActionHistoryEntry[],
    roundSummaries: RoundSummary[]
  ) => Promise<TacticalPlan>;
}

export interface AgentPlan {
  plan: 'approach' | 'retreat' | 'attack' | 'defend' | 'idle';
  preferredMove: string;
  reasoning: string;
}

export interface SimulationResult {
  eventLog: SimEvent[];
  reasoningLog: Record<string, { tick: number; action: string; reasoning: string }[]>;
  winnerId: string | null;
  finalTick: number;
}

function euclideanDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function parsePlaystyleProfile(memory: string): PlaystyleProfile | null {
  if (!memory) return null;
  try {
    return JSON.parse(memory);
  } catch {
    return null;
  }
}

interface AgentRuntime {
  plan: TacticalPlan;
  planExpiresAt: number;
  playstyleProfile: PlaystyleProfile | null;
  actionHistory: ActionHistoryEntry[];
  opponentActionHistory: ActionHistoryEntry[];
  comboState: ComboState;
}

function createDefaultPlan(aggressionLevel: number = 50): TacticalPlan {
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

async function resolveAgentAction(
  state: GameState,
  agent: AgentState,
  config: AgentConfig,
  tacticalClient: TacticalPlanClient,
  runtimes: Map<string, AgentRuntime>,
  retries: number = 0
): Promise<AgentAction> {
  const opponent = getOpponent(state, agent.id);
  let runtime = runtimes.get(agent.id);

  if (!runtime || state.tick >= runtime.planExpiresAt) {
    let newPlan: TacticalPlan;
    try {
      const history = runtime?.actionHistory ?? [];
      const oppHistory = runtime?.opponentActionHistory ?? [];
      const roundSummaries: RoundSummary[] = [];

      newPlan = await tacticalClient.getPlan(
        agent, opponent, state,
        config.playstyleMemory,
        config.characterDescription,
        history, oppHistory, roundSummaries
      );
    } catch (err) {
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

  const ctx = buildBehaviorContext(
    agent, opponent, runtime.plan,
    runtime.actionHistory, runtime.opponentActionHistory,
    state.tick, state.maxTicks,
    runtime.playstyleProfile ? parseDirectives(runtime.playstyleProfile.directives) : [],
    runtime.comboState
  );

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

interface TacticalPlanClient {
  getPlan(
    agent: AgentState,
    opponent: AgentState,
    state: GameState,
    playstyleMemory: string,
    characterDescription: string,
    actionHistory: ActionHistoryEntry[],
    opponentHistory: ActionHistoryEntry[],
    roundSummaries: RoundSummary[]
  ): Promise<TacticalPlan>;
}

function createDefaultTacticalClient(): TacticalPlanClient {
  return {
    async getPlan(agent, opponent, state, playstyleMemory, characterDescription, actionHistory, opponentHistory, roundSummaries) {
      return getTacticalPlan(agent, opponent, state, playstyleMemory, characterDescription, actionHistory, opponentHistory, roundSummaries);
    },
  };
}

export async function simulateRound(
  agentA: AgentConfig,
  agentB: AgentConfig,
  planClient?: any
): Promise<SimulationResult> {
  const state = createInitialState(agentA, agentB);
  const reasoningLog: Record<string, { tick: number; action: string; reasoning: string }[]> = {
    [agentA.id]: [],
    [agentB.id]: [],
  };

  const runtimes = new Map<string, AgentRuntime>();
  const client = createDefaultTacticalClient();

  console.log(`[Engine] Starting simulation: ${agentA.name} vs ${agentB.name}`);

  while (state.tick < state.maxTicks) {
    const agents = Object.values(state.agents);

    const alive = agents.filter((a) => a.status === 'alive');
    if (alive.length < 2) {
      break;
    }

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