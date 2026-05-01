import {
  AgentState,
  PlaystyleParameters,
  TacticalPlan,
  TacticalReactions,
  ReactionOption,
  MovementPattern,
  ParsedDirective,
  getMoveDef,
  DODGE_COOLDOWN,
  PLAN_INTERVAL,
  BASIC_ATTACK_RANGE,
} from '@shared/index';

function euclideanDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function angleBetween(from: { x: number; y: number }, to: { x: number; y: number }): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

function normalizeAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

function isMoveOffCooldown(agent: AgentState, moveId: string): boolean {
  return (agent.cooldowns[moveId] ?? 0) <= 0;
}

export interface ActionHistoryEntry {
  tick: number;
  agentId: string;
  action: string;
  position: { x: number; y: number };
  hp: number;
  maxHp: number;
  distance: number;
  statusEffects: string[];
}

export interface OpponentTendencies {
  preferredMoves: Record<string, number>;
  dodgeFrequency: number;
  approachRetreatRatio: number;
  comboUsage: number;
  averageDistance: number;
  shieldUsage: number;
}

export interface BehaviorContext {
  agent: AgentState;
  opponent: AgentState;
  plan: TacticalPlan;
  hpRatio: number;
  opponentHpRatio: number;
  distance: number;
  maxAttackRange: number;
  primaryAttackRange: number;
  history: ActionHistoryEntry[];
  opponentHistory: ActionHistoryEntry[];
  tick: number;
  maxTicks: number;
  tendencies: OpponentTendencies;
  directives: ParsedDirective[];
  comboState: ComboState;
}

export interface ComboState {
  currentCombo: string[] | null;
  comboStep: number;
  comboWaitTicks: number;
}

const COMBO_SEQUENCES: Record<string, string[]> = {
  'war_cry_sword_lunge': ['war_cry', 'sword_lunge'],
  'shield_sword_lunge': ['shield_block', 'sword_lunge'],
  'war_cry_crossbow': ['war_cry', 'crossbow'],
  'inquisitor_curse_sword_lunge': ['inquisitor_curse', 'sword_lunge'],
  'war_cry_inquisitor_curse_sword_lunge': ['war_cry', 'inquisitor_curse', 'sword_lunge'],
};

type DistanceIntent = 'close' | 'maintain' | 'retreat' | 'circle';

function getAgentMaxAttackRange(agent: AgentState): number {
  const combatMoves = [...agent.moves, 'basic_attack'];
  let maxRange = BASIC_ATTACK_RANGE;
  for (const moveId of combatMoves) {
    const def = getMoveDef(moveId);
    if (def && def.range !== undefined && def.damage !== undefined && def.damage > 0) {
      maxRange = Math.max(maxRange, def.range);
    }
  }
  return maxRange;
}

function getAgentPrimaryAttackRange(agent: AgentState, primaryMove: string): number {
  const primaryDef = getMoveDef(primaryMove);
  if (primaryDef && primaryDef.range !== undefined && primaryDef.damage !== undefined && primaryDef.damage > 0) {
    return primaryDef.range;
  }
  return BASIC_ATTACK_RANGE;
}

function getAvailableCombatMoves(agent: AgentState): string[] {
  return ['basic_attack', ...agent.moves].filter((m) => {
    const def = getMoveDef(m);
    return def && def.type === 'move' && def.damage !== undefined && def.damage > 0;
  });
}

function getAvailableBuffMoves(agent: AgentState): string[] {
  return ['basic_attack', ...agent.moves].filter((m) => {
    const def = getMoveDef(m);
    return def && def.type === 'move' && def.statusEffect && def.statusEffect.type === 'damage_boost';
  });
}

function getAvailableDefenseMoves(agent: AgentState): string[] {
  return ['basic_attack', ...agent.moves].filter((m) => {
    const def = getMoveDef(m);
    return def && def.type === 'move' && def.statusEffect && def.statusEffect.type === 'damage_reduction';
  });
}

function getAvailableDebuffMoves(agent: AgentState): string[] {
  return ['basic_attack', ...agent.moves].filter((m) => {
    const def = getMoveDef(m);
    return def && def.type === 'move' && def.statusEffect && def.statusEffect.type === 'cooldown_slow';
  });
}

function getDistanceIntent(ctx: BehaviorContext): DistanceIntent {
  const { agent, distance, maxAttackRange, primaryAttackRange, plan, hpRatio, history, tick } = ctx;
  const aggression = plan.aggressionLevel;

  const recentActions = history.slice(-5).map((h) => h.action);
  const justAttacked = recentActions.some(
    (a) => a !== 'idle' && !a.startsWith('move_') && !a.startsWith('dodge_')
  );
  const recentMoves = recentActions.filter((a) => a.startsWith('move_') || a.startsWith('dodge_'));

  const allAttacksOnCooldown = !isMoveOffCooldown(agent, 'basic_attack');

  if (justAttacked && Math.random() < 0.4) {
    return 'retreat';
  }

  if (hpRatio < 0.2 && Math.random() < 0.5) {
    return aggression > 60 ? 'close' : 'retreat';
  }

  if (allAttacksOnCooldown) {
    if (aggression > 70) {
      return Math.random() < 0.6 ? 'close' : 'circle';
    }
    return Math.random() < 0.4 ? 'circle' : 'retreat';
  }

  if (distance > maxAttackRange + 60) {
    return 'close';
  }

  if (distance <= primaryAttackRange) {
    return 'maintain';
  }

  if (Math.random() < 0.08) {
    return 'retreat';
  }

  if (distance > maxAttackRange + 20 && distance <= maxAttackRange + 60) {
    return 'close';
  }

  return aggression > 65 ? 'close' : 'circle';
}

function getBestAvailableAttack(ctx: BehaviorContext): string | null {
  const { agent, distance } = ctx;
  let best: string | null = null;
  let bestScore = -1;

  const combatMoves = getAvailableCombatMoves(agent);
  for (const move of combatMoves) {
    const def = getMoveDef(move);
    if (!def || def.range === undefined) continue;
    if (!isMoveOffCooldown(agent, move)) continue;
    if (distance > def.range) continue;

    let score = def.damage ?? 0;
    if (move === ctx.plan.primaryMove) score += 10;
    if (agent.statusEffects.some((se) => se.type === 'damage_boost' && se.remainingTicks > 5)) score += 8;
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }

  return best;
}

function shouldDodge(ctx: BehaviorContext): { dodge: boolean; direction?: string } {
  const { agent, opponent, distance, plan } = ctx;

  if (agent.dodgeCooldown > 0) return { dodge: false };
  if (plan.dodgeFrequency < 30) return { dodge: false };

  const oppMoves = [...Object.keys(opponent.cooldowns), ...opponent.moves].filter(
    (m, i, arr) => arr.indexOf(m) === i
  );

  for (const moveId of oppMoves) {
    const def = getMoveDef(moveId);
    if (!def || !def.damage || def.damage <= 0) continue;
    if (!def.range) continue;

    const cd = opponent.cooldowns[moveId] ?? 0;
    if (cd <= 2 && distance <= def.range * 1.3) {
      const dodgeChance = (plan.dodgeFrequency / 100) * 0.3;
      if (Math.random() < dodgeChance) {
        const dx = agent.position.x - opponent.position.x;
        const dy = agent.position.y - opponent.position.y;
        const angle = Math.atan2(dy, dx);
        const perpAngle = angle + (Math.random() > 0.5 ? Math.PI / 2 : -Math.PI / 2);
        const dodgeDir = nearestDodgeAction(perpAngle);
        return { dodge: true, direction: dodgeDir };
      }
    }
  }

  return { dodge: false };
}

function angleToMovement8(angle: number, reasoning: string): { action: string; reasoning: string } {
  const normalized = normalizeAngle(angle);
  const PI_8 = Math.PI / 8;

  if (normalized > -PI_8 && normalized <= PI_8) return { action: 'move_right', reasoning };
  if (normalized > PI_8 && normalized <= 3 * PI_8) return { action: 'move_down_right', reasoning };
  if (normalized > 3 * PI_8 && normalized <= 5 * PI_8) return { action: 'move_down', reasoning };
  if (normalized > 5 * PI_8 && normalized <= 7 * PI_8) return { action: 'move_down_left', reasoning };
  if (normalized > -(3 * PI_8) && normalized <= -PI_8) return { action: 'move_up_right', reasoning };
  if (normalized > -(5 * PI_8) && normalized <= -(3 * PI_8)) return { action: 'move_up', reasoning };
  if (normalized > -(7 * PI_8) && normalized <= -(5 * PI_8)) return { action: 'move_up_left', reasoning };
  return { action: 'move_left', reasoning };
}

function nearestMovementAction(angle: number): string {
  const normalized = normalizeAngle(angle);
  const PI_8 = Math.PI / 8;

  if (normalized > -PI_8 && normalized <= PI_8) return 'move_right';
  if (normalized > PI_8 && normalized <= 3 * PI_8) return 'move_down_right';
  if (normalized > 3 * PI_8 && normalized <= 5 * PI_8) return 'move_down';
  if (normalized > 5 * PI_8 && normalized <= 7 * PI_8) return 'move_down_left';
  if (normalized > -(3 * PI_8) && normalized <= -PI_8) return 'move_up_right';
  if (normalized > -(5 * PI_8) && normalized <= -(3 * PI_8)) return 'move_up';
  if (normalized > -(7 * PI_8) && normalized <= -(5 * PI_8)) return 'move_up_left';
  return 'move_left';
}

function nearestDodgeAction(angle: number): string {
  const normalized = normalizeAngle(angle);
  const PI_8 = Math.PI / 8;

  if (normalized > -PI_8 && normalized <= PI_8) return 'dodge_right';
  if (normalized > PI_8 && normalized <= 3 * PI_8) return 'dodge_down_right';
  if (normalized > 3 * PI_8 && normalized <= 5 * PI_8) return 'dodge_down';
  if (normalized > 5 * PI_8 && normalized <= 7 * PI_8) return 'dodge_down_left';
  if (normalized > -(3 * PI_8) && normalized <= -PI_8) return 'dodge_up_right';
  if (normalized > -(5 * PI_8) && normalized <= -(3 * PI_8)) return 'dodge_up';
  if (normalized > -(7 * PI_8) && normalized <= -(5 * PI_8)) return 'dodge_up_left';
  return 'dodge_left';
}

function applyMovementIntent(intent: DistanceIntent, ctx: BehaviorContext): { action: string; reasoning: string } {
  const { agent, opponent, distance, primaryAttackRange, plan } = ctx;
  const angle = angleBetween(agent.position, opponent.position);
  const retreatAngle = angle + Math.PI;
  const strafeAngleL = angle + Math.PI / 2;
  const strafeAngleR = angle - Math.PI / 2;

  switch (intent) {
    case 'close': {
      const jitterAngle = angle + (Math.random() - 0.5) * 0.4;
      return angleToMovement8(jitterAngle, 'Closing distance');
    }
    case 'retreat': {
      const jitterAngle = retreatAngle + (Math.random() - 0.5) * 0.6;
      return angleToMovement8(jitterAngle, 'Creating distance');
    }
    case 'circle': {
      const dir = Math.random() > 0.5 ? strafeAngleL : strafeAngleR;
      const jitterAngle = dir + (Math.random() - 0.5) * 0.3;
      return angleToMovement8(jitterAngle, 'Circling opponent');
    }
    case 'maintain': {
      if (distance < primaryAttackRange - 10) {
        const jitterAngle = retreatAngle + (Math.random() - 0.5) * 0.8;
        return angleToMovement8(jitterAngle, 'Slightly backing off to attack range');
      }
      if (distance > primaryAttackRange + 20) {
        const jitterAngle = angle + (Math.random() - 0.5) * 0.4;
        return angleToMovement8(jitterAngle, 'Stepping into attack range');
      }
      const dir = Math.random() > 0.5 ? strafeAngleL : strafeAngleR;
      return angleToMovement8(dir, 'Maintaining range, circling');
    }
  }
}

function performMovement(ctx: BehaviorContext): { action: string; reasoning: string } {
  const { agent, opponent, distance, maxAttackRange, primaryAttackRange, plan, history, tick } = ctx;
  const angle = angleBetween(agent.position, opponent.position);

  switch (plan.movementPattern) {
    case 'approach_direct': {
      if (Math.random() < 0.15) {
        const sideAngle = angle + (Math.random() > 0.5 ? Math.PI / 3 : -Math.PI / 3);
        return angleToMovement8(sideAngle, 'Approaching with lateral step');
      }
      return applyMovementIntent(getDistanceIntent(ctx), ctx);
    }

    case 'circle_strafe_left':
    case 'circle_strafe_right': {
      const direction = plan.movementPattern === 'circle_strafe_left' ? 1 : -1;

      if (distance > maxAttackRange + 80) {
        const closeAngle = angle + direction * 0.5;
        return angleToMovement8(closeAngle, 'Circling while closing');
      }

      if (distance > maxAttackRange + 30) {
        const closeAngle = angle + direction * Math.PI / 3;
        return angleToMovement8(closeAngle, 'Circling and closing to range');
      }

      if (distance < primaryAttackRange - 20) {
        const retreatAngle = angle + Math.PI + direction * 0.4;
        return angleToMovement8(retreatAngle, 'Circling out from too close');
      }

      if (Math.random() < 0.2) {
        const dipAngle = angle + direction * 0.3;
        return angleToMovement8(dipAngle, 'Circling dip inward');
      }

      const strafeAngle = angle + direction * Math.PI / 2;
      return angleToMovement8(strafeAngle, 'Circle strafing');
    }

    case 'hit_and_retreat': {
      const recentActions = history.slice(-5).map((h) => h.action);
      const attackIndex = recentActions.findIndex(
        (a) => a !== 'idle' && !a.startsWith('move_') && !a.startsWith('dodge_')
      );
      const justAttacked = attackIndex >= 0 && attackIndex >= recentActions.length - 2;

      if (justAttacked) {
        const retreatAngle = angle + Math.PI + (Math.random() - 0.5) * 0.5;
        return angleToMovement8(retreatAngle, 'Hit and retreating');
      }

      if (distance > maxAttackRange + 40) {
        return applyMovementIntent('close', ctx);
      }

      if (distance <= primaryAttackRange + 10) {
        const attack = getBestAvailableAttack(ctx);
        if (attack) {
          return { action: attack, reasoning: 'Hit-and-retreat: attacking in range' };
        }
        const strafeAngle = angle + Math.PI / 2 * (Math.random() > 0.5 ? 1 : -1);
        return angleToMovement8(strafeAngle, 'Hit-and-retreat: circling while waiting for cooldown');
      }

      return applyMovementIntent('close', ctx);
    }

    case 'dodge_and_counter': {
      const dodgeResult = shouldDodge(ctx);
      if (dodgeResult.dodge && dodgeResult.direction) {
        return { action: dodgeResult.direction, reasoning: 'Dodging incoming attack then countering' };
      }

      if (distance > maxAttackRange + 30) {
        const approachAngle = angle + (Math.random() - 0.5) * 0.3;
        return angleToMovement8(approachAngle, 'Approaching to bait counter');
      }

      if (distance <= primaryAttackRange) {
        const attack = getBestAvailableAttack(ctx);
        if (attack) {
          return { action: attack, reasoning: 'Counter-attacking' };
        }
        const strafeAngle = angle + Math.PI / 2 * (Math.random() > 0.5 ? 1 : -1);
        return angleToMovement8(strafeAngle, 'Counter pattern: circling while on cooldown');
      }

      const stepBack = angle + Math.PI + (Math.random() - 0.5) * 0.4;
      return angleToMovement8(stepBack, 'Slightly retreating to ideal counter range');
    }

    case 'rush': {
      if (ctx.hpRatio < 0.3 && Math.random() < 0.3) {
        const retreatAngle = angle + Math.PI + (Math.random() - 0.5) * 0.3;
        return angleToMovement8(retreatAngle, 'Rush: backing off at low HP');
      }

      if (distance <= maxAttackRange) {
        const attack = getBestAvailableAttack(ctx);
        if (attack) {
          return { action: attack, reasoning: 'Rushing attack' };
        }
      }

      return applyMovementIntent('close', ctx);
    }

    case 'kite': {
      if (distance < primaryAttackRange && distance < 100) {
        const retreatAngle = angle + Math.PI + (Math.random() - 0.5) * 0.5;
        return angleToMovement8(retreatAngle, 'Kiting: creating distance');
      }

      const rangedMoves = getAvailableCombatMoves(agent).filter((m) => {
        const def = getMoveDef(m);
        return def && def.range && def.range >= 200;
      });

      if (rangedMoves.length > 0) {
        const attack = rangedMoves.find((m) => isMoveOffCooldown(agent, m) && distance <= (getMoveDef(m)?.range ?? 300));
        if (attack) {
          return { action: attack, reasoning: 'Kiting with ranged attack' };
        }
      }

      if (distance < maxAttackRange - 30) {
        const retreatAngle = angle + Math.PI + (Math.random() - 0.5) * 0.6;
        return angleToMovement8(retreatAngle, 'Kiting: too close, backing off');
      }

      if (Math.random() < 0.1) {
        return applyMovementIntent('close', ctx);
      }

      const kitingRange = maxAttackRange + 30;
      if (distance > kitingRange + 40) {
        const closeAngle = angle + (Math.random() - 0.5) * 0.3;
        return angleToMovement8(closeAngle, 'Kiting: repositioning closer');
      }

      const strafeAngle = angle + Math.PI / 2 * (Math.random() > 0.5 ? 1 : -1);
      return angleToMovement8(strafeAngle, 'Kiting: strafing at range');
    }

    case 'hold_position': {
      if (distance > maxAttackRange + 20) {
        const closeAngle = angle + (Math.random() - 0.5) * 0.3;
        return angleToMovement8(closeAngle, 'Holding position: closing to range');
      }

      if (distance <= maxAttackRange) {
        const attack = getBestAvailableAttack(ctx);
        if (attack) {
          return { action: attack, reasoning: 'Holding position: attacking from range' };
        }
        const strafeAngle = angle + Math.PI / 2 * (Math.random() > 0.5 ? 1 : -1);
        return angleToMovement8(strafeAngle, 'Holding position: circling while on cooldown');
      }

      const strafeAngle = angle + Math.PI / 2 * (Math.random() > 0.5 ? 1 : -1);
      return angleToMovement8(strafeAngle, 'Holding position: repositioning');
    }

    case 'feint_approach': {
      const feintPhase = (tick % 40) < 20;

      if (feintPhase) {
        if (distance > maxAttackRange + 40) {
          return angleToMovement8(angle + (Math.random() - 0.5) * 0.2, 'Feint: approaching');
        }
        if (distance <= primaryAttackRange) {
          const attack = getBestAvailableAttack(ctx);
          if (attack) {
            return { action: attack, reasoning: 'Feint: striking in close' };
          }
          const sideAngle = angle + Math.PI / 2 * (Math.random() > 0.5 ? 1 : -1);
          return angleToMovement8(sideAngle, 'Feint: circling in close');
        }
        return angleToMovement8(angle + (Math.random() - 0.5) * 0.5, 'Feint: closing remaining gap');
      } else {
        const dodgeResult = shouldDodge(ctx);
        if (dodgeResult.dodge && dodgeResult.direction) {
          return { action: dodgeResult.direction, reasoning: 'Feint: dodging after approach' };
        }
        const perpAngle = angle + Math.PI / 2 * (Math.random() > 0.5 ? 1 : -1);
        return angleToMovement8(perpAngle, 'Feint: sidestepping');
      }
    }

    case 'retreat': {
      const retreatAngle = angle + Math.PI;
      const jitterAngle = retreatAngle + (Math.random() - 0.5) * 0.6;
      return angleToMovement8(jitterAngle, 'Retreating');
    }

    default:
      return applyMovementIntent(getDistanceIntent(ctx), ctx);
  }
}

function checkReactions(ctx: BehaviorContext): string | null {
  const { opponent, opponentHistory, plan, distance } = ctx;
  const recentOppActions = opponentHistory.slice(-5).map((h) => h.action);

  const opponentHasShield = opponent.statusEffects.some(
    (se) => se.type === 'damage_reduction' && se.remainingTicks > 5
  );
  if (opponentHasShield) {
    const reaction = plan.reactions.ifOpponentShields;
    const action = mapReactionToAction(reaction, ctx, distance);
    if (action) return action;
  }

  const opponentRetreating = recentOppActions.length >= 3 &&
    recentOppActions.slice(-3).every((a) => a.startsWith('move_') && !a.startsWith('move_up') && !a.startsWith('move_down') || a === 'idle');
  if (opponentRetreating) {
    const reaction = plan.reactions.ifOpponentRetreats;
    const action = mapReactionToAction(reaction, ctx, distance);
    if (action && action !== 'idle') return action;
  }

  if (ctx.hpRatio < 0.25) {
    const reaction = plan.reactions.ifLowHP;
    const action = mapReactionToAction(reaction, ctx, distance);
    if (action) return action;
  }

  const opponentRanged = recentOppActions.some((a) => a === 'crossbow');
  if (opponentRanged) {
    const reaction = plan.reactions.ifOpponentUsesRanged;
    const action = mapReactionToAction(reaction, ctx, distance);
    if (action) return action;
  }

  return null;
}

function mapReactionToAction(reaction: ReactionOption, ctx: BehaviorContext, distance: number): string | null {
  const { agent, opponent } = ctx;

  switch (reaction) {
    case 'retreat': {
      const angle = angleBetween(agent.position, opponent.position) + Math.PI;
      return nearestMovementAction(angle);
    }
    case 'rush': {
      const attack = getBestAvailableAttack(ctx);
      if (attack && distance <= (getMoveDef(attack)?.range ?? BASIC_ATTACK_RANGE)) return attack;
      return nearestMovementAction(angleBetween(agent.position, opponent.position));
    }
    case 'use_ranged': {
      const rangedMoves = getAvailableCombatMoves(agent).filter((m) => {
        const def = getMoveDef(m);
        return def && def.range && def.range >= 200 && isMoveOffCooldown(agent, m);
      });
      if (rangedMoves.length > 0) return rangedMoves[0];
      return null;
    }
    case 'wait':
      return 'idle';
    case 'dodge_close': {
      if (agent.dodgeCooldown > 0) return null;
      const angle = angleBetween(opponent.position, agent.position) + (Math.random() - 0.5) * 1.0;
      return nearestDodgeAction(angle);
    }
    case 'hold':
      return 'idle';
    case 'berserk': {
      const attack = getBestAvailableAttack(ctx);
      if (attack) return attack;
      if (distance <= BASIC_ATTACK_RANGE && isMoveOffCooldown(agent, 'basic_attack')) return 'basic_attack';
      return nearestMovementAction(angleBetween(agent.position, opponent.position));
    }
    case 'shield': {
      const defenseMoves = getAvailableDefenseMoves(agent);
      const available = defenseMoves.filter((m) => isMoveOffCooldown(agent, m));
      if (available.length > 0) return available[0];
      return null;
    }
    case 'kite': {
      const rangedMoves = getAvailableCombatMoves(agent).filter((m) => {
        const def = getMoveDef(m);
        return def && def.range && def.range >= 200 && isMoveOffCooldown(agent, m) && distance <= def.range;
      });
      if (rangedMoves.length > 0) return rangedMoves[0];
      const retreatAngle = angleBetween(agent.position, opponent.position) + Math.PI;
      return nearestMovementAction(retreatAngle);
    }
    default:
      return null;
  }
}

function tryCombo(ctx: BehaviorContext): string | null {
  const { agent, plan, comboState, distance } = ctx;

  if (comboState.currentCombo) {
    const step = comboState.currentCombo[comboState.comboStep];
    if (comboState.comboWaitTicks > 0) {
      comboState.comboWaitTicks--;
      return null;
    }
    if (isMoveOffCooldown(agent, step)) {
      const def = getMoveDef(step);
      if (def && def.range && distance > def.range * 1.2) {
        comboState.currentCombo = null;
        comboState.comboStep = 0;
        return null;
      }
      comboState.comboStep++;
      if (comboState.comboStep >= comboState.currentCombo.length) {
        comboState.currentCombo = null;
        comboState.comboStep = 0;
      }
      return step;
    } else {
      comboState.currentCombo = null;
      comboState.comboStep = 0;
      return null;
    }
  }

  const comboPref = plan.aggressionLevel > 60 ? 70 : 30;
  if (Math.random() * 100 > comboPref) return null;

  for (const [name, sequence] of Object.entries(COMBO_SEQUENCES)) {
    const canUse = sequence.every((move) => agent.moves.includes(move) || move === 'basic_attack');
    if (!canUse) continue;

    const firstMove = sequence[0];
    const def = getMoveDef(firstMove);
    if (!def) continue;
    if (!isMoveOffCooldown(agent, firstMove)) continue;
    if (def.range && distance > def.range * 1.2) continue;

    comboState.currentCombo = sequence;
    comboState.comboStep = 1;
    comboState.comboWaitTicks = firstMove === 'war_cry' ? 2 : 0;
    return firstMove;
  }

  return null;
}

export function chooseAction(ctx: BehaviorContext): { action: string; reasoning: string } {
  const { agent, opponent, distance, plan, hpRatio, maxAttackRange, primaryAttackRange } = ctx;

  const bestAttack = getBestAvailableAttack(ctx);
  if (bestAttack) {
    return { action: bestAttack, reasoning: `Attacking with ${bestAttack}` };
  }

  if (isMoveOffCooldown(agent, 'basic_attack')) {
    const basicDef = getMoveDef('basic_attack');
    if (basicDef && basicDef.range && distance <= basicDef.range) {
      return { action: 'basic_attack', reasoning: 'Using basic attack' };
    }
  }

  const defenseMoves = getAvailableDefenseMoves(agent);
  if (defenseMoves.length > 0 && hpRatio < 0.5 && distance < 200 && plan.aggressionLevel < 70) {
    const defense = defenseMoves.find((m) => isMoveOffCooldown(agent, m));
    if (defense) {
      return { action: defense, reasoning: 'Raising defenses at low HP' };
    }
  }

  const reaction = checkReactions(ctx);
  if (reaction) {
    return { action: reaction, reasoning: 'Reacting to opponent behavior' };
  }

  const dodgeResult = shouldDodge(ctx);
  if (dodgeResult.dodge && dodgeResult.direction) {
    return { action: dodgeResult.direction, reasoning: 'Dodging predicted attack' };
  }

  const comboMove = tryCombo(ctx);
  if (comboMove) {
    return { action: comboMove, reasoning: 'Executing combo sequence' };
  }

  if (plan.primaryMove && plan.primaryMove !== 'basic_attack' && plan.primaryMove !== 'idle') {
    const primaryDef = getMoveDef(plan.primaryMove);
    if (primaryDef && isMoveOffCooldown(agent, plan.primaryMove)) {
      const inRange = !primaryDef.range || distance <= primaryDef.range;
      if (inRange) {
        return { action: plan.primaryMove, reasoning: `Using primary move: ${plan.primaryMove}` };
      }
    }
  }

  const buffMoves = getAvailableBuffMoves(agent);
  if (plan.aggressionLevel > 60 && buffMoves.length > 0 && distance < 200) {
    const buff = buffMoves.find((m) => isMoveOffCooldown(agent, m));
    if (buff && !agent.statusEffects.some((se) => se.type === 'damage_boost' && se.remainingTicks > 10)) {
      return { action: buff, reasoning: 'Buffing before engaging' };
    }
  }

  if (distance > maxAttackRange && distance <= maxAttackRange + 40) {
    return applyMovementIntent('close', ctx);
  }

  if (distance <= primaryAttackRange) {
    const strafeAngle = angleBetween(agent.position, opponent.position) + Math.PI / 2 * (Math.random() > 0.5 ? 1 : -1);
    return angleToMovement8(strafeAngle, 'In range, circling while waiting for cooldowns');
  }

  return performMovement(ctx);
}

export function analyzeOpponentTendencies(history: ActionHistoryEntry[]): OpponentTendencies {
  const tendencies: OpponentTendencies = {
    preferredMoves: {},
    dodgeFrequency: 0,
    approachRetreatRatio: 0,
    comboUsage: 0,
    averageDistance: 0,
    shieldUsage: 0,
  };

  if (history.length === 0) return tendencies;

  let approachCount = 0;
  let retreatCount = 0;
  let distanceSum = 0;
  let dodgeCount = 0;
  let shieldCount = 0;

  for (let i = 0; i < history.length; i++) {
    const entry = history[i];
    distanceSum += entry.distance;

    if (entry.action.startsWith('dodge_')) {
      dodgeCount++;
    } else if (entry.action === 'shield_block') {
      shieldCount++;
    } else if (entry.action !== 'idle' && !entry.action.startsWith('move_')) {
      tendencies.preferredMoves[entry.action] = (tendencies.preferredMoves[entry.action] || 0) + 1;
    }

    if (i > 0) {
      const prevDist = history[i - 1].distance;
      if (entry.distance < prevDist - 2) approachCount++;
      else if (entry.distance > prevDist + 2) retreatCount++;
    }
  }

  tendencies.dodgeFrequency = dodgeCount / history.length;
  tendencies.approachRetreatRatio = retreatCount > 0 ? approachCount / (approachCount + retreatCount) : 0.5;
  tendencies.averageDistance = distanceSum / history.length;
  tendencies.shieldUsage = shieldCount / history.length;

  return tendencies;
}

export function buildBehaviorContext(
  agent: AgentState,
  opponent: AgentState,
  plan: TacticalPlan,
  history: ActionHistoryEntry[],
  opponentHistory: ActionHistoryEntry[],
  tick: number,
  maxTicks: number,
  directives: ParsedDirective[],
  comboState: ComboState
): BehaviorContext {
  const distance = euclideanDistance(agent.position, opponent.position);
  const maxAttackRange = getAgentMaxAttackRange(agent);
  const primaryAttackRange = getAgentPrimaryAttackRange(agent, plan.primaryMove);

  return {
    agent,
    opponent,
    plan,
    hpRatio: agent.hp / agent.maxHp,
    opponentHpRatio: opponent.hp / opponent.maxHp,
    distance,
    maxAttackRange,
    primaryAttackRange,
    history,
    opponentHistory,
    tick,
    maxTicks,
    tendencies: analyzeOpponentTendencies(opponentHistory),
    directives,
    comboState,
  };
}