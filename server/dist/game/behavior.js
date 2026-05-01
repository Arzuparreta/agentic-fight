import { getMoveDef, } from '@shared/index';
function euclideanDistance(a, b) {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function mapRange(value, inMin, inMax, outMin, outMax) {
    return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
}
function angleBetween(from, to) {
    return Math.atan2(to.y - from.y, to.x - from.x);
}
function normalizeAngle(a) {
    while (a > Math.PI)
        a -= 2 * Math.PI;
    while (a < -Math.PI)
        a += 2 * Math.PI;
    return a;
}
function isMoveOffCooldown(agent, moveId) {
    return (agent.cooldowns[moveId] ?? 0) <= 0;
}
function getOpponentCooldownEstimate(agent, moveId) {
    return Math.max(0, (agent.cooldowns[moveId] ?? 0));
}
const COMBO_SEQUENCES = {
    'war_cry_sword_lunge': ['war_cry', 'sword_lunge'],
    'shield_sword_lunge': ['shield_block', 'sword_lunge'],
    'war_cry_crossbow': ['war_cry', 'crossbow'],
    'inquisitor_curse_sword_lunge': ['inquisitor_curse', 'sword_lunge'],
    'war_cry_inquisitor_curse_sword_lunge': ['war_cry', 'inquisitor_curse', 'sword_lunge'],
};
function getAvailableCombatMoves(agent) {
    return ['basic_attack', ...agent.moves].filter((m) => {
        const def = getMoveDef(m);
        return def && def.type === 'move' && def.damage !== undefined && def.damage > 0;
    });
}
function getAvailableBuffMoves(agent) {
    return ['basic_attack', ...agent.moves].filter((m) => {
        const def = getMoveDef(m);
        return def && def.type === 'move' && def.statusEffect && def.statusEffect.type === 'damage_boost';
    });
}
function getAvailableDefenseMoves(agent) {
    return ['basic_attack', ...agent.moves].filter((m) => {
        const def = getMoveDef(m);
        return def && def.type === 'move' && def.statusEffect && def.statusEffect.type === 'damage_reduction';
    });
}
function getAvailableDebuffMoves(agent) {
    return ['basic_attack', ...agent.moves].filter((m) => {
        const def = getMoveDef(m);
        return def && def.type === 'move' && def.statusEffect && def.statusEffect.type === 'cooldown_slow';
    });
}
function getBestAvailableAttack(ctx) {
    const { agent, distance } = ctx;
    let best = null;
    let bestScore = -1;
    const combatMoves = getAvailableCombatMoves(agent);
    for (const move of combatMoves) {
        const def = getMoveDef(move);
        if (!def || def.range === undefined)
            continue;
        if (!isMoveOffCooldown(agent, move))
            continue;
        if (distance > def.range)
            continue;
        let score = def.damage ?? 0;
        if (move === ctx.plan.primaryMove)
            score += 10;
        if (agent.statusEffects.some((se) => se.type === 'damage_boost' && se.remainingTicks > 5))
            score += 8;
        if (score > bestScore) {
            bestScore = score;
            best = move;
        }
    }
    return best;
}
function shouldDodge(ctx) {
    const { agent, opponent, distance, tick, plan, tendencies, history } = ctx;
    if (agent.dodgeCooldown > 0)
        return { dodge: false };
    if (plan.dodgeFrequency < 10)
        return { dodge: false };
    const oppCooldown = opponent.cooldowns;
    const oppBasicAttack = oppCooldown['basic_attack'] ?? 0;
    const oppMoves = [...Object.keys(opponent.cooldowns), ...opponent.moves].filter((m, i, arr) => arr.indexOf(m) === i);
    for (const moveId of oppMoves) {
        const def = getMoveDef(moveId);
        if (!def || !def.damage || def.damage <= 0)
            continue;
        if (!def.range)
            continue;
        const cd = opponent.cooldowns[moveId] ?? 0;
        if (cd <= 3 && cd >= 0 && distance <= def.range * 1.3) {
            const dodgeChance = plan.dodgeFrequency / 100;
            if (Math.random() < dodgeChance) {
                const dx = agent.position.x - opponent.position.x;
                const dy = agent.position.y - opponent.position.y;
                const absDx = Math.abs(dx);
                const absDy = Math.abs(dy);
                if (absDx > absDy) {
                    const perpDir = dy > 0 ? 'dodge_down' : 'dodge_up';
                    return { dodge: true, direction: perpDir };
                }
                else {
                    const perpDir = dx > 0 ? 'dodge_right' : 'dodge_left';
                    return { dodge: true, direction: perpDir };
                }
            }
        }
    }
    if (distance < 100 && plan.dodgeFrequency > 50 && Math.random() < (plan.dodgeFrequency / 200)) {
        const recentMoves = history.slice(-5);
        const opponentMoves = ctx.opponentHistory.slice(-3);
        const opponentAttacking = opponentMoves.some((h) => !h.action.startsWith('move_') && h.action !== 'idle' && !h.action.startsWith('dodge_'));
        if (opponentAttacking) {
            const angle = angleBetween(opponent.position, agent.position);
            const dodgeAngles = [
                angle + Math.PI / 4,
                angle - Math.PI / 4,
                angle + Math.PI / 3,
                angle - Math.PI / 3,
            ];
            const chosen = dodgeAngles[Math.floor(Math.random() * dodgeAngles.length)];
            const dir = angleToDodgeDirection(chosen);
            return { dodge: true, direction: dir };
        }
    }
    return { dodge: false };
}
function angleToDodgeDirection(angle) {
    const normalized = normalizeAngle(angle);
    const PI = Math.PI;
    const PI_4 = PI / 4;
    if (normalized > -PI_4 && normalized <= PI_4)
        return 'dodge_right';
    if (normalized > PI_4 && normalized <= PI * 3 / 4)
        return 'dodge_down';
    if (normalized > -PI * 3 / 4 && normalized <= -PI_4)
        return 'dodge_up';
    return 'dodge_left';
}
function performMovement(ctx) {
    const { agent, opponent, distance, idealDistance, plan, history, tick } = ctx;
    const params = getEffectiveParams(ctx);
    const dx = opponent.position.x - agent.position.x;
    const dy = opponent.position.y - agent.position.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    const angle = Math.atan2(dy, dx);
    const perpAngle = angle + Math.PI / 2;
    const tolerance = 40;
    switch (plan.movementPattern) {
        case 'approach_direct': {
            if (absDx > absDy * 0.5 && absDy > absDx * 0.5) {
                return moveDiagonal(dx > 0, dy > 0, 'Approaching diagonally');
            }
            if (absDx >= absDy) {
                return { action: dx > 0 ? 'move_right' : 'move_left', reasoning: 'Approaching directly' };
            }
            return { action: dy > 0 ? 'move_down' : 'move_up', reasoning: 'Approaching directly' };
        }
        case 'circle_strafe_left':
        case 'circle_strafe_right': {
            const direction = plan.movementPattern === 'circle_strafe_left' ? 1 : -1;
            const idealDist = idealDistance;
            if (distance > idealDist + tolerance) {
                const approachAngle = direction > 0 ? angle - 0.5 : angle + 0.5;
                return angleToMovement(approachAngle, agent, 'Circling while closing distance');
            }
            if (distance < idealDist - tolerance * 0.5) {
                const retreatAngle = direction > 0 ? angle + Math.PI + 0.5 : angle + Math.PI - 0.5;
                return angleToMovement(retreatAngle, agent, 'Circling while creating space');
            }
            const strafeAngle = direction > 0 ? angle + Math.PI / 2 : angle - Math.PI / 2;
            return angleToMovement(strafeAngle, agent, 'Circle strafing');
        }
        case 'hit_and_retreat': {
            const recentActions = history.slice(-4).map((h) => h.action);
            const justAttacked = recentActions.some((a) => a !== 'idle' && !a.startsWith('move_') && !a.startsWith('dodge_'));
            const retreatingRecently = recentActions.every((a) => a.startsWith('move_') || a === 'idle');
            if (justAttacked && distance < idealDistance + tolerance) {
                const retreatAngle = angle + Math.PI;
                return angleToMovement(retreatAngle, agent, 'Hit and retreating');
            }
            if (retreatingRecently && distance > idealDistance + tolerance * 1.5) {
                return angleToMovement(angle, agent, 'Reapproaching after retreat');
            }
            if (distance > idealDistance + tolerance) {
                return angleToMovement(angle, agent, 'Closing for hit-and-retreat');
            }
            return angleToMovement(angle, agent, 'In range, holding');
        }
        case 'dodge_and_counter': {
            const dodgeResult = shouldDodge(ctx);
            if (dodgeResult.dodge && dodgeResult.direction) {
                return { action: dodgeResult.direction, reasoning: 'Dodging incoming attack then countering' };
            }
            if (distance > idealDistance + tolerance) {
                return angleToMovement(angle, agent, 'Approaching to bait attack');
            }
            if (distance < idealDistance - tolerance * 0.3) {
                const retreatAngle = angle + Math.PI + 0.3;
                return angleToMovement(retreatAngle, agent, 'Slightly retreating to ideal range');
            }
            return { action: 'idle', reasoning: 'Waiting for opponent to commit' };
        }
        case 'rush': {
            const attack = getBestAvailableAttack(ctx);
            if (attack && distance <= (getMoveDef(attack)?.range ?? 80)) {
                return { action: attack, reasoning: 'Rushing in with attack' };
            }
            if (distance > 100) {
                const rushAngle = angle;
                return angleToMovement(rushAngle, agent, 'Rushing forward');
            }
            return angleToMovement(angle, agent, 'Closing distance aggressively');
        }
        case 'kite': {
            const rangedMoves = getAvailableCombatMoves(agent).filter((m) => {
                const def = getMoveDef(m);
                return def && def.range && def.range >= 200;
            });
            if (rangedMoves.length > 0 && distance <= (getMoveDef(rangedMoves[0])?.range ?? 300)) {
                const attack = rangedMoves.find((m) => isMoveOffCooldown(agent, m)) || null;
                if (attack) {
                    return { action: attack, reasoning: 'Kiting with ranged attack' };
                }
            }
            if (distance < idealDistance - tolerance) {
                const retreatAngle = angle + Math.PI;
                const jitterAngle = retreatAngle + (Math.random() - 0.5) * 0.5;
                return angleToMovement(jitterAngle, agent, 'Kiting: creating distance');
            }
            const strafeAngle = angle + Math.PI / 2 * (Math.random() > 0.5 ? 1 : -1);
            return angleToMovement(strafeAngle, agent, 'Kiting: repositioning');
        }
        case 'hold_position': {
            return { action: 'idle', reasoning: 'Holding position' };
        }
        case 'feint_approach': {
            const feintPhase = (tick % 40) < 20;
            if (feintPhase) {
                if (distance > idealDistance + tolerance) {
                    return angleToMovement(angle, agent, 'Feint: approaching confidently');
                }
                return { action: 'idle', reasoning: 'Feint: pausing before dodge' };
            }
            else {
                const dodgeResult = shouldDodge(ctx);
                if (dodgeResult.dodge && dodgeResult.direction) {
                    return { action: dodgeResult.direction, reasoning: 'Feint: dodging after approach' };
                }
                const perpAngle = angle + Math.PI / 2 * (Math.random() > 0.5 ? 1 : -1);
                return angleToMovement(perpAngle, agent, 'Feint: sidestepping');
            }
        }
        case 'retreat': {
            const retreatAngle = angle + Math.PI;
            const jitterAngle = retreatAngle + (Math.random() - 0.5) * 0.6;
            return angleToMovement(jitterAngle, agent, 'Retreating');
        }
        default:
            return angleToMovement(angle, agent, 'Moving toward opponent');
    }
}
function angleToMovement(angle, agent, reasoning) {
    const normalized = normalizeAngle(angle);
    const PI_4 = Math.PI / 4;
    const PI_3_4 = (Math.PI * 3) / 4;
    if (normalized > -PI_4 && normalized <= PI_4) {
        return { action: 'move_right', reasoning };
    }
    if (normalized > PI_4 && normalized <= PI_3_4) {
        return { action: 'move_down', reasoning };
    }
    if (normalized > -PI_3_4 && normalized <= -PI_4) {
        return { action: 'move_up', reasoning };
    }
    return { action: 'move_left', reasoning };
}
function moveDiagonal(right, down, reasoning) {
    if (right && down)
        return { action: 'move_down_right', reasoning };
    if (right && !down)
        return { action: 'move_up_right', reasoning };
    if (!right && down)
        return { action: 'move_down_left', reasoning };
    return { action: 'move_up_left', reasoning };
}
function getEffectiveParams(ctx) {
    const base = ctx.plan.aggressionLevel !== undefined
        ? {
            aggressiveness: ctx.plan.aggressionLevel,
            risk_tolerance: 50,
            preferred_range: 50,
            patience: 50,
            defensiveness: 100 - ctx.plan.aggressionLevel,
            combo_preference: 50,
        }
        : {
            aggressiveness: 50,
            risk_tolerance: 50,
            preferred_range: 50,
            patience: 50,
            defensiveness: 50,
            combo_preference: 50,
        };
    for (const directive of ctx.directives) {
        if (directive.preferredRangeOverride !== undefined)
            base.preferred_range = directive.preferredRangeOverride;
        if (directive.dodgeFrequencyOverride !== undefined) {
            // dodge frequency is separate
        }
        if (directive.aggressionOverride !== undefined) {
            base.aggressiveness = directive.aggressionOverride;
            base.defensiveness = 100 - directive.aggressionOverride;
        }
    }
    return base;
}
function checkReactions(ctx) {
    const { opponent, opponentHistory, plan, distance } = ctx;
    const recentOppActions = opponentHistory.slice(-5).map((h) => h.action);
    const opponentHasShield = opponent.statusEffects.some((se) => se.type === 'damage_reduction' && se.remainingTicks > 5);
    if (opponentHasShield) {
        const reaction = plan.reactions.ifOpponentShields;
        return mapReactionToAction(reaction, ctx, distance);
    }
    const opponentRetreating = recentOppActions.length >= 2 &&
        recentOppActions.slice(-2).every((a) => a === 'move_left' || a === 'move_right' || a === 'move_up' || a === 'move_down');
    if (opponentRetreating) {
        const reaction = plan.reactions.ifOpponentRetreats;
        return mapReactionToAction(reaction, ctx, distance);
    }
    if (ctx.hpRatio < 0.25) {
        const reaction = plan.reactions.ifLowHP;
        return mapReactionToAction(reaction, ctx, distance);
    }
    const opponentRanged = recentOppActions.some((a) => a === 'crossbow');
    if (opponentRanged) {
        const reaction = plan.reactions.ifOpponentUsesRanged;
        return mapReactionToAction(reaction, ctx, distance);
    }
    return null;
}
function mapReactionToAction(reaction, ctx, distance) {
    const { agent, opponent } = ctx;
    switch (reaction) {
        case 'retreat': {
            const angle = angleBetween(agent.position, opponent.position) + Math.PI;
            return nearestMovementAction(angle);
        }
        case 'rush': {
            const attack = getBestAvailableAttack(ctx);
            if (attack && distance <= (getMoveDef(attack)?.range ?? 80))
                return attack;
            return nearestMovementAction(angleBetween(agent.position, opponent.position));
        }
        case 'use_ranged': {
            const rangedMoves = getAvailableCombatMoves(agent).filter((m) => {
                const def = getMoveDef(m);
                return def && def.range && def.range >= 200 && isMoveOffCooldown(agent, m);
            });
            if (rangedMoves.length > 0)
                return rangedMoves[0];
            return null;
        }
        case 'wait':
            return 'idle';
        case 'dodge_close': {
            if (agent.dodgeCooldown > 0)
                return null;
            const angle = angleBetween(opponent.position, agent.position) + (Math.random() - 0.5) * 1.0;
            return nearestDodgeAction(angle);
        }
        case 'hold':
            return 'idle';
        case 'berserk': {
            const attack = getBestAvailableAttack(ctx);
            if (attack)
                return attack;
            const basicDef = getMoveDef('basic_attack');
            if (basicDef && basicDef.range && distance <= basicDef.range && isMoveOffCooldown(agent, 'basic_attack'))
                return 'basic_attack';
            return nearestMovementAction(angleBetween(agent.position, opponent.position));
        }
        case 'shield': {
            const defenseMoves = getAvailableDefenseMoves(agent);
            const available = defenseMoves.filter((m) => isMoveOffCooldown(agent, m));
            if (available.length > 0)
                return available[0];
            return null;
        }
        case 'kite': {
            const rangedMoves = getAvailableCombatMoves(agent).filter((m) => {
                const def = getMoveDef(m);
                return def && def.range && def.range >= 200 && isMoveOffCooldown(agent, m) && distance <= def.range;
            });
            if (rangedMoves.length > 0)
                return rangedMoves[0];
            const retreatAngle = angleBetween(agent.position, opponent.position);
            return nearestMovementAction(retreatAngle);
        }
        default:
            return null;
    }
}
function nearestMovementAction(angle) {
    const normalized = normalizeAngle(angle);
    const PI_4 = Math.PI / 4;
    if (normalized > -PI_4 && normalized <= PI_4)
        return 'move_right';
    if (normalized > PI_4 && normalized <= (Math.PI * 3 / 4))
        return 'move_down';
    if (normalized > -(Math.PI * 3 / 4) && normalized <= -PI_4)
        return 'move_up';
    return 'move_left';
}
function nearestDodgeAction(angle) {
    const normalized = normalizeAngle(angle);
    const PI_8 = Math.PI / 8;
    if (normalized > -PI_8 && normalized <= PI_8)
        return 'dodge_right';
    if (normalized > PI_8 && normalized <= (Math.PI * 3 / 8))
        return 'dodge_down_right';
    if (normalized > (Math.PI * 3 / 8) && normalized <= (Math.PI * 5 / 8))
        return 'dodge_down';
    if (normalized > (Math.PI * 5 / 8) && normalized <= (Math.PI * 7 / 8))
        return 'dodge_down_left';
    if (normalized > -(Math.PI * 3 / 8) && normalized <= -PI_8)
        return 'dodge_up_right';
    if (normalized > -(Math.PI * 5 / 8) && normalized <= -(Math.PI * 3 / 8))
        return 'dodge_up';
    if (normalized > -(Math.PI * 7 / 8) && normalized <= -(Math.PI * 5 / 8))
        return 'dodge_up_left';
    return 'dodge_left';
}
function tryCombo(ctx) {
    const { agent, plan, comboState, distance } = ctx;
    if (comboState.currentCombo) {
        const step = comboState.currentCombo[comboState.comboStep];
        if (comboState.comboWaitTicks > 0) {
            comboState.comboWaitTicks--;
            return null;
        }
        if (isMoveOffCooldown(agent, step)) {
            const def = getMoveDef(step);
            if (def && def.range && distance > def.range) {
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
        }
        else {
            comboState.currentCombo = null;
            comboState.comboStep = 0;
            return null;
        }
    }
    const comboPref = plan.aggressionLevel > 60 ? 70 : 30;
    if (Math.random() * 100 > comboPref)
        return null;
    for (const [name, sequence] of Object.entries(COMBO_SEQUENCES)) {
        const canUse = sequence.every((move) => agent.moves.includes(move) || move === 'basic_attack');
        if (!canUse)
            continue;
        const firstMove = sequence[0];
        const def = getMoveDef(firstMove);
        if (!def)
            continue;
        if (!isMoveOffCooldown(agent, firstMove))
            continue;
        if (def.range && distance > def.range * 1.2)
            continue;
        comboState.currentCombo = sequence;
        comboState.comboStep = 1;
        comboState.comboWaitTicks = firstMove === 'war_cry' ? 2 : 0;
        return firstMove;
    }
    return null;
}
export function chooseAction(ctx) {
    const { agent, opponent, distance, plan, hpRatio, opponentHpRatio } = ctx;
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
    if (agent.statusEffects.some((se) => se.type === 'damage_boost' && se.remainingTicks > 3)) {
        const bestAttack = getBestAvailableAttack(ctx);
        if (bestAttack) {
            return { action: bestAttack, reasoning: 'Attacking with damage boost active' };
        }
    }
    const defenseMoves = getAvailableDefenseMoves(agent);
    if (defenseMoves.length > 0 && hpRatio < 0.6) {
        const defense = defenseMoves.find((m) => isMoveOffCooldown(agent, m));
        if (defense && distance < 150 && plan.aggressionLevel < 70) {
            return { action: defense, reasoning: 'Raising defenses at moderate HP' };
        }
    }
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
    if (distance <= 100 && bestAttack === null) {
        return { action: 'idle', reasoning: 'In range, waiting for cooldowns' };
    }
    return performMovement(ctx);
}
export function analyzeOpponentTendencies(history) {
    const tendencies = {
        preferredMoves: {},
        dodgeFrequency: 0,
        approachRetreatRatio: 0,
        comboUsage: 0,
        averageDistance: 0,
        shieldUsage: 0,
    };
    if (history.length === 0)
        return tendencies;
    let approachCount = 0;
    let retreatCount = 0;
    let distanceSum = 0;
    let dodgeCount = 0;
    let shieldCount = 0;
    let attackSequenceCount = 0;
    for (let i = 0; i < history.length; i++) {
        const entry = history[i];
        distanceSum += entry.distance;
        if (entry.action.startsWith('dodge_')) {
            dodgeCount++;
        }
        else if (entry.action === 'shield_block') {
            shieldCount++;
        }
        else if (entry.action !== 'idle' && !entry.action.startsWith('move_')) {
            tendencies.preferredMoves[entry.action] = (tendencies.preferredMoves[entry.action] || 0) + 1;
        }
        if (i > 0) {
            const prevDist = history[i - 1].distance;
            if (entry.distance < prevDist - 2)
                approachCount++;
            else if (entry.distance > prevDist + 2)
                retreatCount++;
        }
    }
    tendencies.dodgeFrequency = dodgeCount / history.length;
    tendencies.approachRetreatRatio = retreatCount > 0 ? approachCount / (approachCount + retreatCount) : 0.5;
    tendencies.averageDistance = distanceSum / history.length;
    tendencies.shieldUsage = shieldCount / history.length;
    return tendencies;
}
export function buildBehaviorContext(agent, opponent, plan, history, opponentHistory, tick, maxTicks, directives, comboState) {
    const distance = euclideanDistance(agent.position, opponent.position);
    const params = {
        aggressiveness: 50,
        preferred_range: 50,
    };
    const idealDistance = mapRange(plan.movementPattern === 'kite' ? 80 : (params.preferred_range ?? 50), 0, 100, 60, 350);
    return {
        agent,
        opponent,
        plan,
        hpRatio: agent.hp / agent.maxHp,
        opponentHpRatio: opponent.hp / opponent.maxHp,
        distance,
        idealDistance,
        history,
        opponentHistory,
        tick,
        maxTicks,
        tendencies: analyzeOpponentTendencies(opponentHistory),
        directives,
        comboState,
    };
}
//# sourceMappingURL=behavior.js.map