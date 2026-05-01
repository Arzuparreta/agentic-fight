import { AgentState, GameState, SimEvent, getMoveDef, StatusEffect, ARENA, AGENT_HITBOX_RADIUS } from '@shared/index';

export interface AgentAction {
  action: string;
  reasoning: string;
}

export interface ActionResult {
  valid: boolean;
  error?: string;
}

export function validateAction(
  state: GameState,
  agentId: string,
  action: AgentAction,
  availableMoves: string[]
): ActionResult {
  const agent = state.agents[agentId];
  const opponent = Object.values(state.agents).find((a) => a.id !== agentId)!;

  const act = action.action;

  if (act === 'idle' || act === 'move_left' || act === 'move_right' || act === 'move_up' || act === 'move_down') {
    return { valid: true };
  }

  if (!availableMoves.includes(act)) {
    return { valid: false, error: `Move "${act}" is not available.` };
  }

  if ((agent.cooldowns[act] ?? 0) > 0) {
    return { valid: false, error: `Move "${act}" is on cooldown (${agent.cooldowns[act]} ticks remaining).` };
  }

  const def = getMoveDef(act);
  if (def && def.type === 'move' && def.range !== undefined && def.range > 0) {
    const dist = euclideanDistance(agent.position, opponent.position);
    if (dist > def.range) {
      return { valid: false, error: `Opponent is out of range (${dist.toFixed(0)} units, need <= ${def.range}).` };
    }
  }

  return { valid: true };
}

function euclideanDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function calculateDamage(agent: AgentState, baseDamage: number): number {
  let damage = baseDamage + agent.stats.attackDamage - 10;

  const damageBoost = agent.statusEffects
    .filter((se) => se.type === 'damage_boost')
    .reduce((sum, se) => sum + se.value, 0);
  damage += damageBoost;

  return Math.max(1, Math.floor(damage));
}

function applyDamage(target: AgentState, rawDamage: number): number {
  const reduction = target.statusEffects
    .filter((se) => se.type === 'damage_reduction')
    .reduce((sum, se) => sum + se.value, 0);

  let damage = rawDamage;
  if (reduction > 0) {
    damage = Math.floor(damage * (1 - Math.min(reduction, 0.9)));
  }

  target.hp = Math.max(0, target.hp - damage);
  return damage;
}

function getCooldown(agent: AgentState, moveId: string, baseCooldown: number): number {
  const slow = agent.statusEffects
    .filter((se) => se.type === 'cooldown_slow')
    .reduce((sum, se) => sum + se.value, 0);

  return baseCooldown + slow;
}

export function applyActions(
  state: GameState,
  actions: Record<string, AgentAction>
): SimEvent[] {
  const events: SimEvent[] = [];
  const agentIds = Object.keys(state.agents);

  for (const id of agentIds) {
    const agent = state.agents[id];
    if (agent.status === 'dead') continue;

    const act = actions[id].action;
    const speed = agent.stats.movementSpeed;
    const oldPos = { x: agent.position.x, y: agent.position.y };

    if (act === 'move_left') {
      agent.position.x = Math.max(0, agent.position.x - speed);
    } else if (act === 'move_right') {
      agent.position.x = Math.min(ARENA.width, agent.position.x + speed);
    } else if (act === 'move_up') {
      agent.position.y = Math.max(0, agent.position.y - speed);
    } else if (act === 'move_down') {
      agent.position.y = Math.min(ARENA.height, agent.position.y + speed);
    }

    if (agent.position.x !== oldPos.x || agent.position.y !== oldPos.y) {
      events.push({
        tick: state.tick,
        agentId: id,
        type: 'move',
        payload: {
          newPosition: { x: agent.position.x, y: agent.position.y },
          speed,
        },
      });
    }
  }

  const agents = Object.values(state.agents);
  if (agents.length === 2 && agents[0].status === 'alive' && agents[1].status === 'alive') {
    const [a, b] = agents;
    const dx = b.position.x - a.position.x;
    const dy = b.position.y - a.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const minDist = AGENT_HITBOX_RADIUS * 2;

    if (dist < minDist && dist > 0) {
      const overlap = minDist - dist;
      const nx = dx / dist;
      const ny = dy / dist;

      a.position.x = Math.max(0, Math.round(a.position.x - nx * overlap * 0.5));
      a.position.y = Math.max(0, Math.round(a.position.y - ny * overlap * 0.5));
      b.position.x = Math.min(ARENA.width, Math.round(b.position.x + nx * overlap * 0.5));
      b.position.y = Math.min(ARENA.height, Math.round(b.position.y + ny * overlap * 0.5));
    }
  }

  for (const id of agentIds) {
    const agent = state.agents[id];
    const opponent = Object.values(state.agents).find((ag) => ag.id !== id)!;
    if (agent.status === 'dead' || opponent.status === 'dead') continue;

    const act = actions[id].action;
    const def = getMoveDef(act);

    if (!def || def.type !== 'move') continue;

    if (def.damage !== undefined && def.range !== undefined) {
      const dist = euclideanDistance(agent.position, opponent.position);
      if (dist <= def.range) {
        const rawDamage = calculateDamage(agent, def.damage);
        const actualDamage = applyDamage(opponent, rawDamage);
        const cd = getCooldown(agent, act, def.cooldown ?? 20);
        agent.cooldowns[act] = cd;

        events.push({
          tick: state.tick,
          agentId: id,
          type: 'attack',
          payload: { targetId: opponent.id, damage: actualDamage, move: act },
        });
        events.push({
          tick: state.tick,
          agentId: opponent.id,
          type: 'hit',
          payload: { fromId: id, damage: actualDamage, hpRemaining: opponent.hp },
        });
        if (opponent.hp <= 0) {
          opponent.status = 'dead';
          events.push({ tick: state.tick, agentId: opponent.id, type: 'death', payload: { killerId: id } });
        }
      }
    }

    if (def.statusEffect && def.duration) {
      const dist = euclideanDistance(agent.position, opponent.position);
      const rangeValid = def.range === 0 || dist <= (def.range ?? 0);

      if (rangeValid) {
        const cd = getCooldown(agent, act, def.cooldown ?? 20);
        agent.cooldowns[act] = cd;

        const effect: StatusEffect = {
          id: def.statusEffect.id,
          type: def.statusEffect.type,
          value: def.statusEffect.value,
          remainingTicks: def.duration,
        };

        if (def.statusEffect.type === 'damage_reduction' || def.statusEffect.type === 'damage_boost') {
          agent.statusEffects.push(effect);
        } else if (def.statusEffect.type === 'cooldown_slow') {
          opponent.statusEffects.push(effect);
        }

        events.push({
          tick: state.tick,
          agentId: id,
          type: 'special',
          payload: { move: act, effect: def.statusEffect.type, targetId: def.statusEffect.type === 'cooldown_slow' ? opponent.id : id },
        });
      }
    }
  }

  for (const id of agentIds) {
    const act = actions[id].action;
    if (act === 'idle') {
      events.push({ tick: state.tick, agentId: id, type: 'idle', payload: {} });
    }
  }

  return events;
}
