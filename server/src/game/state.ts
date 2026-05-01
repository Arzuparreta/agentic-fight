import {
  AgentState,
  GameState,
  SimEvent,
  Stats,
  ARENA,
  MAX_TICKS_PER_ROUND,
  STARTING_HP,
  MOVEMENT_SPEED,
  Vec2,
} from '@shared/index';

export interface AgentConfig {
  id: string;
  name: string;
  stats: Stats;
  moves: string[];
  playstyleMemory: string;
  characterDescription: string;
}

export function createInitialState(agentA: AgentConfig, agentB: AgentConfig): GameState {
  const a: AgentState = {
    id: agentA.id,
    name: agentA.name,
    position: { x: Math.floor(ARENA.width * 0.25), y: Math.floor(ARENA.height * 0.5) },
    hp: agentA.stats.maxHp,
    maxHp: agentA.stats.maxHp,
    stats: agentA.stats,
    cooldowns: {},
    moves: agentA.moves,
    statusEffects: [],
    status: 'alive',
    dodgeCooldown: 0,
    invincibleUntilTick: 0,
    isDodging: false,
    dodgeDirection: null,
    facingAngle: 0,
  };

  const b: AgentState = {
    id: agentB.id,
    name: agentB.name,
    position: { x: Math.floor(ARENA.width * 0.75), y: Math.floor(ARENA.height * 0.5) },
    hp: agentB.stats.maxHp,
    maxHp: agentB.stats.maxHp,
    stats: agentB.stats,
    cooldowns: {},
    moves: agentB.moves,
    statusEffects: [],
    status: 'alive',
    dodgeCooldown: 0,
    invincibleUntilTick: 0,
    isDodging: false,
    dodgeDirection: null,
    facingAngle: Math.PI,
  };

  return {
    tick: 0,
    maxTicks: MAX_TICKS_PER_ROUND,
    agents: { [a.id]: a, [b.id]: b },
    eventLog: [],
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
    agent.isDodging = false;
    agent.dodgeDirection = null;
    agent.statusEffects = agent.statusEffects.filter((se) => {
      se.remainingTicks--;
      return se.remainingTicks > 0;
    });
  }
}
