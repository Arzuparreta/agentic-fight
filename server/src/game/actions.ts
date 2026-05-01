import { AgentState, GameState, SimEvent, getMoveDef, StatusEffect } from '@shared/index';

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

  if (act === 'idle' || act === 'move_left' || act === 'move_right') {
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
    const dist = Math.abs(agent.position - opponent.position);
    if (dist > def.range) {
      return { valid: false, error: `Opponent is out of range (${dist.toFixed(0)} units, need <= ${def.range}).` };
    }
  }

  return { valid: true };
}

function calculateDamage(agent: AgentState, baseDamage: number): number {
  let damage = baseDamage + agent.stats.attackDamage - 10; // base attackDamage is 10 baseline

  // Apply damage_boost status effects
  const damageBoost = agent.statusEffects
    .filter((se) => se.type === 'damage_boost')
    .reduce((sum, se) => sum + se.value, 0);
  damage += damageBoost;

  return Math.max(1, Math.floor(damage));
}

function applyDamage(target: AgentState, rawDamage: number): number {
  // Apply damage_reduction status effects
  const reduction = target.statusEffects
    .filter((se) => se.type === 'damage_reduction')
    .reduce((sum, se) => sum + se.value, 0);

  let damage = rawDamage;
  if (reduction > 0) {
    damage = Math.floor(damage * (1 - Math.min(reduction, 0.9))); // cap at 90% reduction
  }

  target.hp = Math.max(0, target.hp - damage);
  return damage;
}

function getCooldown(agent: AgentState, moveId: string, baseCooldown: number): number {
  // Check if opponent has cooldown_slow on us
  // Actually, cooldown_slow is a status effect on the TARGET that makes THEIR cooldowns longer
  // But in our model, when agent A uses a move, agent B might have applied cooldown_slow to agent A
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

  // Phase 1: Resolve movements simultaneously
  for (const id of agentIds) {
    const agent = state.agents[id];
    if (agent.status === 'dead') continue;

    const act = actions[id].action;
    const speed = agent.stats.movementSpeed;
    if (act === 'move_left') {
      agent.position = Math.max(0, agent.position - speed);
      events.push({ tick: state.tick, agentId: id, type: 'move', payload: { direction: 'left', newPosition: agent.position, speed } });
    } else if (act === 'move_right') {
      agent.position = Math.min(1000, agent.position + speed);
      events.push({ tick: state.tick, agentId: id, type: 'move', payload: { direction: 'right', newPosition: agent.position, speed } });
    }
  }

  // Prevent agents from crossing each other (1D collision)
  const [a, b] = Object.values(state.agents);
  if (a.position > b.position) {
    const midpoint = Math.floor((a.position + b.position) / 2);
    a.position = midpoint;
    b.position = midpoint;
  }

  // Phase 2: Resolve attacks and special moves simultaneously
  for (const id of agentIds) {
    const agent = state.agents[id];
    const opponent = Object.values(state.agents).find((ag) => ag.id !== id)!;
    if (agent.status === 'dead' || opponent.status === 'dead') continue;

    const act = actions[id].action;
    const def = getMoveDef(act);

    if (!def || def.type !== 'move') continue;

    // Handle attack moves
    if (def.damage !== undefined && def.range !== undefined) {
      const dist = Math.abs(agent.position - opponent.position);
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

    // Handle status effect moves (shield_block, war_cry, inquisitor_curse)
    if (def.statusEffect && def.duration) {
      const dist = Math.abs(agent.position - opponent.position);
      // For self-buffs (shield_block, war_cry), range check is lenient (0 range = always valid if in any state)
      // For debuffs (inquisitor_curse), check range
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

        // Self-buffs go on agent, debuffs go on opponent
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

  // Idle logging
  for (const id of agentIds) {
    const act = actions[id].action;
    if (act === 'idle') {
      events.push({ tick: state.tick, agentId: id, type: 'idle', payload: {} });
    }
  }

  return events;
}
