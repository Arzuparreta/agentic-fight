import {
  AgentState,
  GameState,
  Stats,
  ARENA,
  MAX_TICKS_PER_ROUND,
  STARTING_HP,
} from '@shared/index';
import { createDefaultPhysics } from './physics';

export interface AgentConfig {
  id: string;
  name: string;
  stats: Stats;
  moves: string[];
  playstyleMemory: string;
  characterDescription: string;
}

export function createInitialState(agentA: AgentConfig, agentB: AgentConfig): GameState {
  const aPhys = createDefaultPhysics(agentA.stats);
  aPhys.position = { x: Math.floor(ARENA.width * 0.25), y: Math.floor(ARENA.height * 0.5) };
  aPhys.facingAngle = 0;

  const bPhys = createDefaultPhysics(agentB.stats);
  bPhys.position = { x: Math.floor(ARENA.width * 0.75), y: Math.floor(ARENA.height * 0.5) };
  bPhys.facingAngle = Math.PI;

  const a: AgentState = {
    id: agentA.id,
    name: agentA.name,
    hp: agentA.stats.maxHp,
    maxHp: agentA.stats.maxHp,
    stats: agentA.stats,
    cooldowns: {},
    moves: agentA.moves,
    statusEffects: [],
    status: 'alive',
    physics: aPhys,
    dodgeCooldown: 0,
    dodgeInvincibleUntilTick: 0,
    isDodging: false,
    dodgeDirection: null,
    attackState: {
      phase: 'idle',
      moveId: null,
      ticksInPhase: 0,
      hasHit: false,
      facingAtStart: 0,
    },
    sequenceExecution: null,
    lastPlanTick: -999,
    facingAngle: 0,
  };

  const b: AgentState = {
    id: agentB.id,
    name: agentB.name,
    hp: agentB.stats.maxHp,
    maxHp: agentB.stats.maxHp,
    stats: agentB.stats,
    cooldowns: {},
    moves: agentB.moves,
    statusEffects: [],
    status: 'alive',
    physics: bPhys,
    dodgeCooldown: 0,
    dodgeInvincibleUntilTick: 0,
    isDodging: false,
    dodgeDirection: null,
    attackState: {
      phase: 'idle',
      moveId: null,
      ticksInPhase: 0,
      hasHit: false,
      facingAtStart: Math.PI,
    },
    sequenceExecution: null,
    lastPlanTick: -999,
    facingAngle: Math.PI,
  };

  return {
    tick: 0,
    maxTicks: MAX_TICKS_PER_ROUND,
    agents: { [a.id]: a, [b.id]: b },
    eventLog: [],
    whiffWindows: {},
  };
}

export function getOpponent(state: GameState, agentId: string): AgentState {
  const ids = Object.keys(state.agents);
  const oppId = ids.find((id) => id !== agentId)!;
  return state.agents[oppId];
}

export function advanceCooldowns(state: GameState): void {
  for (const agent of Object.values(state.agents)) {
    for (const key of Object.keys(agent.cooldowns)) {
      if (agent.cooldowns[key] > 0) {
        agent.cooldowns[key]--;
      }
    }
    if (agent.dodgeCooldown > 0) {
      agent.dodgeCooldown--;
    }
    // isDodging is managed by the engine loop based on dodgeInvincibleUntilTick
    // agent.isDodging = false;
    agent.statusEffects = agent.statusEffects.filter((se) => {
      se.remainingTicks--;
      return se.remainingTicks > 0;
    });
  }
}
