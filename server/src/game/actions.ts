import {
  AgentState,
  GameState,
  SimEvent,
  getMoveDef,
  StatusEffect,
  ARENA,
  AGENT_HITBOX_RADIUS,
  DODGE_DISTANCE,
  DODGE_COOLDOWN,
  DODGE_INVINCIBILITY_TICKS,
  DIAGONAL_SPEED_FACTOR,
  MOVEMENT_SPEED,
  DodgeDirection,
} from '@shared/index';

export interface AgentAction {
  action: string;
  reasoning: string;
}

export interface ActionResult {
  valid: boolean;
  error?: string;
}

const CARDINAL_MOVES = new Set(['move_left', 'move_right', 'move_up', 'move_down']);
const DIAGONAL_MOVES = new Set(['move_up_left', 'move_up_right', 'move_down_left', 'move_down_right']);
const DODGE_ACTIONS = new Set([
  'dodge_left', 'dodge_right', 'dodge_up', 'dodge_down',
  'dodge_up_left', 'dodge_up_right', 'dodge_down_left', 'dodge_down_right',
]);
const ALL_MOVEMENT_ACTIONS = new Set([...CARDINAL_MOVES, ...DIAGONAL_MOVES]);
const ALL_DODGE_ACTIONS = new Set([...DODGE_ACTIONS]);

function isDodgeAction(action: string): action is DodgeDirection {
  return ALL_DODGE_ACTIONS.has(action);
}

function isMovementAction(action: string): boolean {
  return ALL_MOVEMENT_ACTIONS.has(action);
}

export function validateAction(
  state: GameState,
  agentId: string,
  action: AgentAction,
  availableMoves: string[]
): ActionResult {
  const agent = state.agents[agentId];

  const act = action.action;

  if (act === 'idle' || isMovementAction(act) || isDodgeAction(act)) {
    if (isDodgeAction(act) && agent.dodgeCooldown > 0) {
      return { valid: false, error: `Dodge is on cooldown (${agent.dodgeCooldown} ticks remaining).` };
    }
    if (isDodgeAction(act) && agent.isDodging) {
      return { valid: false, error: 'Already dodging this tick.' };
    }
    return { valid: true };
  }

  if (!availableMoves.includes(act)) {
    return { valid: false, error: `Move "${act}" is not available.` };
  }

  if ((agent.cooldowns[act] ?? 0) > 0) {
    return { valid: false, error: `Move "${act}" is on cooldown (${agent.cooldowns[act]} ticks remaining).` };
  }

  const opponent = Object.values(state.agents).find((a) => a.id !== agentId)!;
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

function applyDamage(target: AgentState, rawDamage: number, currentTick: number): number {
  if (currentTick < target.invincibleUntilTick) {
    return 0;
  }

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

function applyMovement(agent: AgentState, action: string): { oldPos: { x: number; y: number }; moved: boolean } {
  const oldPos = { x: agent.position.x, y: agent.position.y };
  const speed = agent.stats.movementSpeed;

  if (action === 'move_left') {
    agent.position.x = Math.max(0, agent.position.x - speed);
  } else if (action === 'move_right') {
    agent.position.x = Math.min(ARENA.width, agent.position.x + speed);
  } else if (action === 'move_up') {
    agent.position.y = Math.max(0, agent.position.y - speed);
  } else if (action === 'move_down') {
    agent.position.y = Math.min(ARENA.height, agent.position.y + speed);
  } else if (action === 'move_up_left') {
    const diagSpeed = speed * DIAGONAL_SPEED_FACTOR;
    agent.position.x = Math.max(0, agent.position.x - diagSpeed);
    agent.position.y = Math.max(0, agent.position.y - diagSpeed);
  } else if (action === 'move_up_right') {
    const diagSpeed = speed * DIAGONAL_SPEED_FACTOR;
    agent.position.x = Math.min(ARENA.width, agent.position.x + diagSpeed);
    agent.position.y = Math.max(0, agent.position.y - diagSpeed);
  } else if (action === 'move_down_left') {
    const diagSpeed = speed * DIAGONAL_SPEED_FACTOR;
    agent.position.x = Math.max(0, agent.position.x - diagSpeed);
    agent.position.y = Math.min(ARENA.height, agent.position.y + diagSpeed);
  } else if (action === 'move_down_right') {
    const diagSpeed = speed * DIAGONAL_SPEED_FACTOR;
    agent.position.x = Math.min(ARENA.width, agent.position.x + diagSpeed);
    agent.position.y = Math.min(ARENA.height, agent.position.y + diagSpeed);
  }

  agent.position.x = Math.round(agent.position.x);
  agent.position.y = Math.round(agent.position.y);

  const moved = agent.position.x !== oldPos.x || agent.position.y !== oldPos.y;
  return { oldPos, moved };
}

function applyDodge(agent: AgentState, action: DodgeDirection, currentTick: number): { oldPos: { x: number; y: number }; moved: boolean } {
  const oldPos = { x: agent.position.x, y: agent.position.y };

  let dx = 0;
  let dy = 0;

  const dist = DODGE_DISTANCE;

  if (action.includes('left')) dx -= dist;
  if (action.includes('right')) dx += dist;
  if (action.includes('up') && !action.includes('left') && !action.includes('right')) dy -= dist;
  if (action.includes('down') && !action.includes('left') && !action.includes('right')) dy += dist;
  if (action === 'dodge_up_left') { dx = -dist * DIAGONAL_SPEED_FACTOR; dy = -dist * DIAGONAL_SPEED_FACTOR; }
  if (action === 'dodge_up_right') { dx = dist * DIAGONAL_SPEED_FACTOR; dy = -dist * DIAGONAL_SPEED_FACTOR; }
  if (action === 'dodge_down_left') { dx = -dist * DIAGONAL_SPEED_FACTOR; dy = dist * DIAGONAL_SPEED_FACTOR; }
  if (action === 'dodge_down_right') { dx = dist * DIAGONAL_SPEED_FACTOR; dy = dist * DIAGONAL_SPEED_FACTOR; }

  agent.position.x = clamp(agent.position.x + dx, 0, ARENA.width);
  agent.position.y = clamp(agent.position.y + dy, 0, ARENA.height);

  agent.position.x = Math.round(agent.position.x);
  agent.position.y = Math.round(agent.position.y);

  agent.dodgeCooldown = DODGE_COOLDOWN;
  agent.invincibleUntilTick = currentTick + DODGE_INVINCIBILITY_TICKS;
  agent.isDodging = true;
  agent.dodgeDirection = action;

  const moved = agent.position.x !== oldPos.x || agent.position.y !== oldPos.y;
  return { oldPos, moved };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function resolveCollision(agents: AgentState[]): void {
  if (agents.length !== 2 || agents[0].status !== 'alive' || agents[1].status !== 'alive') return;

  const [a, b] = agents;
  const dx = b.position.x - a.position.x;
  const dy = b.position.y - a.position.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const minDist = AGENT_HITBOX_RADIUS * 2;

  if (dist < minDist && dist > 0) {
    const overlap = minDist - dist;
    const nx = dx / dist;
    const ny = dy / dist;
    const separation = overlap * 0.35;

    a.position.x = Math.max(0, Math.round(a.position.x - nx * separation));
    a.position.y = Math.max(0, Math.round(a.position.y - ny * separation));
    b.position.x = Math.min(ARENA.width, Math.round(b.position.x + nx * separation));
    b.position.y = Math.min(ARENA.height, Math.round(b.position.y + ny * separation));
  }
}

function updateFacing(agent: AgentState, opponent: AgentState): void {
  const dx = opponent.position.x - agent.position.x;
  const dy = opponent.position.y - agent.position.y;
  agent.facingAngle = Math.atan2(dy, dx);
}

export function applyActions(
  state: GameState,
  actions: Record<string, AgentAction>
): SimEvent[] {
  const events: SimEvent[] = [];
  const agentIds = Object.keys(state.agents);
  const currentTick = state.tick;

  for (const id of agentIds) {
    const agent = state.agents[id];
    if (agent.status === 'dead') continue;

    const opponent = Object.values(state.agents).find((a) => a.id !== id)!;
    updateFacing(agent, opponent);

    const act = actions[id].action;

    if (isDodgeAction(act)) {
      const { moved } = applyDodge(agent, act, currentTick);
      events.push({
        tick: currentTick,
        agentId: id,
        type: 'dodge',
        payload: {
          direction: act,
          newPosition: { x: agent.position.x, y: agent.position.y },
        },
      });
      if (moved) {
        events.push({
          tick: currentTick,
          agentId: id,
          type: 'move',
          payload: {
            newPosition: { x: agent.position.x, y: agent.position.y },
            speed: DODGE_DISTANCE,
          },
        });
      }
    } else if (isMovementAction(act)) {
      const { moved } = applyMovement(agent, act);
      const eventType = DIAGONAL_MOVES.has(act) ? 'move_diagonal' : 'move';
      events.push({
        tick: currentTick,
        agentId: id,
        type: eventType,
        payload: {
          direction: act,
          newPosition: { x: agent.position.x, y: agent.position.y },
          speed: agent.stats.movementSpeed,
        },
      });
    }
  }

  const agents = Object.values(state.agents).filter((a) => a.status === 'alive');
  resolveCollision(agents);

  for (const id of agentIds) {
    const agent = state.agents[id];
    const opponent = Object.values(state.agents).find((ag) => ag.id !== id)!;
    if (agent.status === 'dead' || opponent.status === 'dead') continue;

    const act = actions[id].action;
    const def = getMoveDef(act);

    if (!def || def.type !== 'move') continue;
    if (isDodgeAction(act)) continue;

    if (def.damage !== undefined && def.range !== undefined) {
      const dist = euclideanDistance(agent.position, opponent.position);
      if (dist <= def.range) {
        const rawDamage = calculateDamage(agent, def.damage);
        const actualDamage = applyDamage(opponent, rawDamage, currentTick);

        if (actualDamage > 0) {
          const cd = getCooldown(agent, act, def.cooldown ?? 20);
          agent.cooldowns[act] = cd;

          events.push({
            tick: currentTick,
            agentId: id,
            type: 'attack',
            payload: { targetId: opponent.id, damage: actualDamage, move: act },
          });
          events.push({
            tick: currentTick,
            agentId: opponent.id,
            type: 'hit',
            payload: { fromId: id, damage: actualDamage, hpRemaining: opponent.hp },
          });
          if (opponent.hp <= 0) {
            opponent.status = 'dead';
            events.push({ tick: currentTick, agentId: opponent.id, type: 'death', payload: { killerId: id } });
          }
        } else {
          events.push({
            tick: currentTick,
            agentId: opponent.id,
            type: 'hit',
            payload: { fromId: id, damage: 0, hpRemaining: opponent.hp, dodged: true },
          });
          const cd = getCooldown(agent, act, def.cooldown ?? 20);
          agent.cooldowns[act] = cd;
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
          tick: currentTick,
          agentId: id,
          type: 'special',
          payload: {
            move: act,
            effect: def.statusEffect.type,
            targetId: def.statusEffect.type === 'cooldown_slow' ? opponent.id : id,
          },
        });
      }
    }
  }

  for (const id of agentIds) {
    const agent = state.agents[id];
    if (agent.status === 'dead') continue;

    const act = actions[id].action;
    if (act === 'idle' && !isDodgeAction(act)) {
      events.push({ tick: currentTick, agentId: id, type: 'idle', payload: {} });
    }
  }

  return events;
}