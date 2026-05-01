import {
  GameState,
  SimEvent,
  AgentState,
  getAvailableMoves,
  getMoveDef,
  PlaystyleProfile,
  PlaystyleParameters,
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
const PLAN_INTERVAL = 20;

interface AgentRuntime {
  plan: AgentPlan;
  planExpiresAt: number;
  playstyleProfile: PlaystyleProfile | null;
  lastOpponentMoves: Record<string, number>;
}

function euclideanDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function mapRange(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
}

function parsePlaystyleProfile(memory: string): PlaystyleProfile | null {
  if (!memory) return null;
  try {
    return JSON.parse(memory);
  } catch {
    return null;
  }
}

function getOpponentCooldownEstimate(runtime: AgentRuntime, moveId: string): number {
  return Math.max(0, (runtime.lastOpponentMoves[moveId] ?? 0) - 0);
}

function isOpponentMoveLikelyOnCooldown(runtime: AgentRuntime, moveId: string): boolean {
  const def = getMoveDef(moveId);
  if (!def || !def.cooldown) return false;
  return getOpponentCooldownEstimate(runtime, moveId) > 0;
}

function chooseMovement(
  agent: AgentState,
  opponent: AgentState,
  plan: string,
  params: PlaystyleParameters,
  hpRatio: number
): { action: string; reasoning: string } {
  const dist = euclideanDistance(agent.position, opponent.position);
  const idealDistance = mapRange(params.preferred_range, 0, 100, 60, 350);
  const tolerance = 40;

  const hpRetreatThreshold = mapRange(100 - params.risk_tolerance, 0, 100, 0.15, 0.55);
  const effectivePlan = hpRatio < hpRetreatThreshold ? 'retreat' : plan;

  if (effectivePlan === 'retreat') {
    const dx = agent.position.x - opponent.position.x;
    const dy = agent.position.y - opponent.position.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (absDx > absDy) {
      return dx > 0
        ? { action: 'move_right', reasoning: 'Retreating horizontally' }
        : { action: 'move_left', reasoning: 'Retreating horizontally' };
    } else {
      return dy > 0
        ? { action: 'move_down', reasoning: 'Retreating vertically' }
        : { action: 'move_up', reasoning: 'Retreating vertically' };
    }
  }

  if (effectivePlan === 'defend' && params.defensiveness > 60) {
    if (dist < idealDistance - tolerance) {
      const awayX = agent.position.x < opponent.position.x ? 'move_left' : 'move_right';
      return { action: awayX, reasoning: 'Creating defensive space' };
    }
    return { action: 'idle', reasoning: 'Holding defensive position' };
  }

  const dx = opponent.position.x - agent.position.x;
  const dy = opponent.position.y - agent.position.y;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  if (dist > idealDistance + tolerance) {
    if (absDx > absDy) {
      return dx > 0
        ? { action: 'move_right', reasoning: 'Closing distance horizontally' }
        : { action: 'move_left', reasoning: 'Closing distance horizontally' };
    } else {
      return dy > 0
        ? { action: 'move_down', reasoning: 'Closing distance vertically' }
        : { action: 'move_up', reasoning: 'Closing distance vertically' };
    }
  }

  if (dist < idealDistance - tolerance && params.preferred_range > 60) {
    if (absDx > absDy) {
      return dx > 0
        ? { action: 'move_left', reasoning: 'Creating range for kiting' }
        : { action: 'move_right', reasoning: 'Creating range for kiting' };
    } else {
      return dy > 0
        ? { action: 'move_up', reasoning: 'Creating range for kiting' }
        : { action: 'move_down', reasoning: 'Creating range for kiting' };
    }
  }

  if (params.patience > 60 && dist <= idealDistance + tolerance && dist >= idealDistance - tolerance) {
    let preferredStrafe: string;
    if (absDx > absDy) {
      preferredStrafe = dy >= 0 ? 'move_up' : 'move_down';
    } else {
      preferredStrafe = dx >= 0 ? 'move_left' : 'move_right';
    }

    return { action: preferredStrafe, reasoning: 'Circle-strafing for position' };
  }

  if (absDx > absDy) {
    return dx > 0
      ? { action: 'move_right', reasoning: 'Closing in for attack' }
      : { action: 'move_left', reasoning: 'Closing in for attack' };
  } else {
    return dy > 0
      ? { action: 'move_down', reasoning: 'Closing in for attack' }
      : { action: 'move_up', reasoning: 'Closing in for attack' };
  }
}

function chooseAction(
  agent: AgentState,
  opponent: AgentState,
  plan: string,
  params: PlaystyleParameters,
  hpRatio: number,
  opponentHpRatio: number,
  runtime: AgentRuntime
): { action: string; reasoning: string } {
  const dist = euclideanDistance(agent.position, opponent.position);
  const available = getAvailableMoves(agent);
  const combatMoves = available.filter(m => {
    const def = getMoveDef(m);
    return def && def.type === 'move' && def.damage !== undefined && def.damage > 0;
  });
  const buffMoves = available.filter(m => {
    const def = getMoveDef(m);
    return def && def.type === 'move' && def.statusEffect && def.statusEffect.type === 'damage_boost';
  });
  const debuffMoves = available.filter(m => {
    const def = getMoveDef(m);
    return def && def.type === 'move' && def.statusEffect && def.statusEffect.type === 'cooldown_slow';
  });
  const defenseMoves = available.filter(m => {
    const def = getMoveDef(m);
    return def && def.type === 'move' && def.statusEffect && def.statusEffect.type === 'damage_reduction';
  });

  const hasDamageBoost = agent.statusEffects.some(se => se.type === 'damage_boost' && se.remainingTicks > 10);

  if (params.combo_preference > 60 && buffMoves.length > 0 && !hasDamageBoost && dist < 200) {
    const buff = buffMoves[0];
    if ((agent.cooldowns[buff] ?? 0) <= 0) {
      return { action: buff, reasoning: 'Buffing before engaging (combo strategy)' };
    }
  }

  if (params.defensiveness > 60 && defenseMoves.length > 0 && opponentHpRatio > 0.6) {
    const defense = defenseMoves[0];
    if ((agent.cooldowns[defense] ?? 0) <= 0 && dist < 150) {
      return { action: defense, reasoning: 'Raising defenses before opponent strikes' };
    }
  }

  if (debuffMoves.length > 0 && params.aggressiveness > 50) {
    const debuff = debuffMoves[0];
    const def = getMoveDef(debuff);
    if (def && def.range && dist <= def.range && (agent.cooldowns[debuff] ?? 0) <= 0) {
      return { action: debuff, reasoning: 'Debuffing opponent to gain advantage' };
    }
  }

  let bestMove: string | null = null;
  let bestScore = -1;

  for (const move of combatMoves) {
    const def = getMoveDef(move);
    if (!def || !def.range) continue;
    if ((agent.cooldowns[move] ?? 0) > 0) continue;
    if (dist > def.range) continue;

    let score = def.damage;

    if (move === runtime.plan.preferredMove) {
      score += 10;
    }

    if (hasDamageBoost) {
      score += 5;
    }

    if (isOpponentMoveLikelyOnCooldown(runtime, 'shield_block')) {
      score += 8;
    }

    if (params.combo_preference > 70 && hasDamageBoost) {
      score += 15;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  if (bestMove) {
    const def = getMoveDef(bestMove);
    const moveName = def?.name || bestMove;
    return { action: bestMove, reasoning: `Striking with ${moveName}` };
  }

  if (combatMoves.length > 0 && (agent.cooldowns['basic_attack'] ?? 0) <= 0) {
    const basicDef = getMoveDef('basic_attack');
    if (basicDef && dist <= basicDef.range) {
      return { action: 'basic_attack', reasoning: 'Using basic attack while waiting for abilities' };
    }
  }

  const anyMoveInRange = combatMoves.some(m => {
    const def = getMoveDef(m);
    return def && def.range && dist <= def.range;
  });
  const basicDef = getMoveDef('basic_attack');
  const basicInRange = basicDef && dist <= basicDef.range;

  if (anyMoveInRange || basicInRange) {
    return { action: 'idle', reasoning: 'In range, waiting for cooldowns' };
  }

  return chooseMovement(agent, opponent, plan, params, hpRatio);
}

function executePlan(
  agent: AgentState,
  opponent: AgentState,
  runtime: AgentRuntime
): AgentAction {
  const plan = runtime.plan;
  const profile = runtime.playstyleProfile;

  const params: PlaystyleParameters = profile?.parameters ?? {
    aggressiveness: 50,
    risk_tolerance: 50,
    preferred_range: 50,
    patience: 50,
    defensiveness: 50,
    combo_preference: 50,
  };

  const hpRatio = agent.hp / agent.maxHp;
  const opponentHpRatio = opponent.hp / opponent.maxHp;

  const actionChoice = chooseAction(agent, opponent, plan.plan, params, hpRatio, opponentHpRatio, runtime);

  return {
    action: actionChoice.action,
    reasoning: `${profile?.narrative || 'Fighting to win.'} ${actionChoice.reasoning}`,
  };
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

  if (!runtime || state.tick >= runtime.planExpiresAt) {
    const plan = await planClient.getPlan(
      agent,
      opponent,
      state,
      config.playstyleMemory,
      config.characterDescription
    );

    const available = getAvailableMoves(agent);
    if (!['approach', 'retreat', 'attack', 'defend', 'idle'].includes(plan.plan)) {
      if (retries < MAX_RETRIES) {
        console.log(`[Tick ${state.tick}] Agent ${agent.id} invalid plan "${plan.plan}". Retrying...`);
        return resolveAgentAction(state, agent, config, planClient, runtimes, retries + 1);
      }
      console.log(`[Tick ${state.tick}] Agent ${agent.id} exhausted plan retries. Falling back to approach.`);
      runtime = {
        plan: { plan: 'approach', preferredMove: 'basic_attack', reasoning: 'Fallback plan.' },
        planExpiresAt: state.tick + PLAN_INTERVAL,
        playstyleProfile: parsePlaystyleProfile(config.playstyleMemory),
        lastOpponentMoves: runtime?.lastOpponentMoves ?? {},
      };
    } else if (
      plan.preferredMove !== 'idle' &&
      plan.preferredMove !== 'move_left' &&
      plan.preferredMove !== 'move_right' &&
      plan.preferredMove !== 'move_up' &&
      plan.preferredMove !== 'move_down' &&
      !available.includes(plan.preferredMove)
    ) {
      if (retries < MAX_RETRIES) {
        console.log(`[Tick ${state.tick}] Agent ${agent.id} preferred move "${plan.preferredMove}" unavailable. Retrying...`);
        return resolveAgentAction(state, agent, config, planClient, runtimes, retries + 1);
      }
      runtime = {
        plan: { ...plan, preferredMove: 'basic_attack' },
        planExpiresAt: state.tick + PLAN_INTERVAL,
        playstyleProfile: parsePlaystyleProfile(config.playstyleMemory),
        lastOpponentMoves: runtime?.lastOpponentMoves ?? {},
      };
    } else {
      runtime = {
        plan,
        planExpiresAt: state.tick + PLAN_INTERVAL,
        playstyleProfile: parsePlaystyleProfile(config.playstyleMemory),
        lastOpponentMoves: runtime?.lastOpponentMoves ?? {},
      };
    }

    runtimes.set(agent.id, runtime);
  }

  const action = executePlan(agent, opponent, runtime);

  const available = getAvailableMoves(agent);
  const validation = validateAction(state, agent.id, action, available);

  if (validation.valid) {
    return action;
  }

  if (action.action === 'basic_attack' && validation.error?.includes('range')) {
    const moveDir = agent.position.x < opponent.position.x ? 'move_right' : 'move_left';
    return { action: moveDir, reasoning: `${action.reasoning} (adjusted: out of range)` };
  }

  if (action.action.startsWith('move_')) {
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
        for (const key of Object.keys(opp.cooldowns)) {
          if (opp.cooldowns[key] > 0) {
            runtime.lastOpponentMoves[key] = opp.cooldowns[key];
          }
        }
      }
    }

    advanceCooldowns(state);

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
