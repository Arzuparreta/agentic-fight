import { getMoveDef, getAvailableMoves, isMoveOffCooldown, } from '@shared/index';
import { angleToTarget, distanceBetweenAgents, } from './physics';
import { canInitiateAttack, isWindingUp, isVulnerable } from './attack';
import { tickRand } from './rng';
/* ─── Interrupt Predicates ─── */
const INTERRUPT_PREDICATES = {
    opponent_winding_up: (_a, opp) => isWindingUp(opp),
    opponent_attacking: (_a, opp) => opp.attackState.phase === 'active',
    opponent_whiffed: (_a, opp) => isVulnerable(opp),
    opponent_recovery: (_a, opp) => opp.attackState.phase === 'recovery' || opp.attackState.phase === 'whiff',
    low_hp: (a) => a.hp / a.maxHp < 0.3,
    opponent_low_hp: (_a, opp) => opp.hp / opp.maxHp < 0.3,
    in_range: (a, opp) => {
        const dist = distanceBetweenAgents(a, opp);
        const range = getBestAttackRange(a);
        return dist <= range;
    },
    out_of_range: (a, opp) => {
        const dist = distanceBetweenAgents(a, opp);
        const range = getBestAttackRange(a);
        return dist > range + 30;
    },
    dodge_ready: (a) => a.dodgeCooldown <= 0,
    opponent_shielded: (_a, opp) => opp.statusEffects.some((se) => se.type === 'damage_reduction' && se.remainingTicks > 5),
    opponent_retreating: (_a, opp, state) => {
        // Simple heuristic: opponent is moving away
        const vel = opp.physics.velocity;
        const toMeX = _a.physics.position.x - opp.physics.position.x;
        const toMeY = _a.physics.position.y - opp.physics.position.y;
        const dot = vel.x * toMeX + vel.y * toMeY;
        return dot < -2;
    },
};
export function checkInterrupts(agent, opponent, state, conditions) {
    for (const cond of conditions) {
        const lower = cond.toLowerCase();
        for (const [key, predicate] of Object.entries(INTERRUPT_PREDICATES)) {
            if (lower.includes(key.replace(/_/g, ' ')) || lower.includes(key)) {
                if (predicate(agent, opponent, state)) {
                    return { triggered: true, reason: cond };
                }
            }
        }
    }
    return { triggered: false, reason: '' };
}
/* ─── Sequence Runner ─── */
export function initSequenceExecution(seq) {
    return {
        sequence: seq,
        currentActionIndex: 0,
        ticksInCurrentAction: 0,
    };
}
export function tickSequenceExecution(exec, agent, opponent, state) {
    const events = [];
    // Check interrupts
    const interrupt = checkInterrupts(agent, opponent, state, exec.sequence.interruptConditions);
    if (interrupt.triggered) {
        // Abort sequence
        agent.sequenceExecution = null;
        return {
            result: { inputAngle: null, speedMult: 1, moveId: null, dodgeDir: null, done: true, reasoning: `Interrupted: ${interrupt.reason}` },
            advanced: false,
            events,
        };
    }
    const action = exec.sequence.actions[exec.currentActionIndex];
    if (!action) {
        // Sequence complete
        agent.sequenceExecution = null;
        return {
            result: { inputAngle: null, speedMult: 1, moveId: null, dodgeDir: null, done: true, reasoning: 'Sequence complete' },
            advanced: false,
            events,
        };
    }
    const result = executeMacro(action, agent, opponent, state, exec.ticksInCurrentAction);
    exec.ticksInCurrentAction++;
    // Check if we should advance to next action
    const defaultDuration = getMacroDefaultDuration(action.macro);
    const duration = action.duration ?? defaultDuration;
    const shouldAdvance = result.done || exec.ticksInCurrentAction >= duration;
    if (shouldAdvance) {
        exec.currentActionIndex++;
        exec.ticksInCurrentAction = 0;
        return { result, advanced: true, events };
    }
    return { result, advanced: false, events };
}
/* ─── Macro Implementations ─── */
function executeMacro(action, agent, opponent, state, ticksInAction) {
    switch (action.macro) {
        case 'approach':
            return macroApproach(agent, opponent, ticksInAction);
        case 'circle_left':
            return macroCircle(agent, opponent, 1, ticksInAction);
        case 'circle_right':
            return macroCircle(agent, opponent, -1, ticksInAction);
        case 'feint_approach':
            return macroFeintApproach(agent, opponent, state, ticksInAction);
        case 'bait':
            return macroBait(agent, opponent, state, ticksInAction);
        case 'dodge':
            return macroDodge(agent, opponent, action.directionHint);
        case 'attack':
            return macroAttack(agent, opponent, action.moveId);
        case 'retreat':
            return macroRetreat(agent, opponent, ticksInAction);
        case 'shield_up':
            return macroShieldUp(agent, opponent);
        case 'wait':
            return macroWait();
        case 'kite':
            return macroKite(agent, opponent, ticksInAction);
        case 'punish':
            return macroPunish(agent, opponent, state, ticksInAction);
        case 'dodge_and_counter':
            return macroDodgeAndCounter(agent, opponent, state, ticksInAction);
        case 'rushdown':
            return macroRushdown(agent, opponent, ticksInAction);
        default:
            return { inputAngle: null, speedMult: 1, moveId: null, dodgeDir: null, done: true, reasoning: 'Unknown macro' };
    }
}
function getMacroDefaultDuration(macro) {
    switch (macro) {
        case 'approach': return 25;
        case 'circle_left':
        case 'circle_right': return 35;
        case 'feint_approach': return 25;
        case 'bait': return 30;
        case 'dodge': return 5;
        case 'attack': return 60; // long duration: close gap + commit attack
        case 'retreat': return 25;
        case 'shield_up': return 10;
        case 'wait': return 15;
        case 'kite': return 35;
        case 'punish': return 15;
        case 'dodge_and_counter': return 30;
        case 'rushdown': return 50; // aggressive closing
        default: return 10;
    }
}
/* ─── Individual Macros ─── */
function macroApproach(agent, opponent, ticks) {
    const angle = angleToTarget(agent, opponent.physics.position);
    // Slight jitter for natural feel
    const jitter = (tickRand(agent.id, agent.physics.position.x + ticks, 301) - 0.5) * 0.3;
    return {
        inputAngle: angle + jitter,
        speedMult: 1.0,
        moveId: null,
        dodgeDir: null,
        done: false,
        reasoning: 'Approaching opponent',
    };
}
function macroCircle(agent, opponent, direction, ticks) {
    const toOpp = angleToTarget(agent, opponent.physics.position);
    const strafeAngle = toOpp + direction * (Math.PI / 2);
    // Add slight in/out drift
    const drift = Math.sin(ticks * 0.2) * 0.25;
    return {
        inputAngle: strafeAngle + drift,
        speedMult: 0.9,
        moveId: null,
        dodgeDir: null,
        done: false,
        reasoning: direction > 0 ? 'Circling left' : 'Circling right',
    };
}
function macroFeintApproach(agent, opponent, state, ticks) {
    const dist = distanceBetweenAgents(agent, opponent);
    const oppMaxRange = getBestAttackRange(opponent);
    // Phase 1: approach
    if (dist > oppMaxRange * 0.85 || ticks < 10) {
        const angle = angleToTarget(agent, opponent.physics.position);
        return {
            inputAngle: angle,
            speedMult: 1.0,
            moveId: null,
            dodgeDir: null,
            done: false,
            reasoning: 'Feint: closing in',
        };
    }
    // Phase 2: dodge sideways
    if (agent.dodgeCooldown <= 0 && !agent.isDodging) {
        const toOpp = angleToTarget(agent, opponent.physics.position);
        const side = tickRand(agent.id, state.tick, 302) < 0.5 ? Math.PI / 2 : -Math.PI / 2;
        const dodgeAngle = toOpp + side;
        const dir = angleToDodgeDirection(dodgeAngle);
        return {
            inputAngle: null,
            speedMult: 1.0,
            moveId: null,
            dodgeDir: dir,
            done: true,
            reasoning: 'Feint: dodging sideways at close range',
        };
    }
    // Fallback: just circle
    return macroCircle(agent, opponent, 1, ticks);
}
function macroBait(agent, opponent, state, ticks) {
    const dist = distanceBetweenAgents(agent, opponent);
    const oppMaxRange = getBestAttackRange(opponent);
    const idealDist = oppMaxRange + 25;
    // If opponent is winding up, auto-dodge
    if (isWindingUp(opponent) && agent.dodgeCooldown <= 0) {
        const toOpp = angleToTarget(agent, opponent.physics.position);
        const side = tickRand(agent.id, state.tick, 303) < 0.5 ? Math.PI / 2 : -Math.PI / 2;
        return {
            inputAngle: null,
            speedMult: 1.0,
            moveId: null,
            dodgeDir: angleToDodgeDirection(toOpp + side),
            done: false,
            reasoning: 'Bait: opponent committed, dodging!',
        };
    }
    // Hover at ideal distance
    const toOpp = angleToTarget(agent, opponent.physics.position);
    let moveAngle;
    if (dist < idealDist - 10) {
        moveAngle = toOpp + Math.PI; // back away
    }
    else if (dist > idealDist + 10) {
        moveAngle = toOpp; // close slightly
    }
    else {
        // Jittery side-to-side
        const jitter = Math.sin(ticks * 0.35 + agent.id.charCodeAt(0)) * 0.8;
        moveAngle = toOpp + jitter;
    }
    return {
        inputAngle: moveAngle,
        speedMult: 0.6,
        moveId: null,
        dodgeDir: null,
        done: false,
        reasoning: 'Bait: hovering at edge of opponent range',
    };
}
function macroDodge(agent, opponent, hint) {
    if (agent.dodgeCooldown > 0) {
        return { inputAngle: null, speedMult: 1, moveId: null, dodgeDir: null, done: true, reasoning: 'Dodge on cooldown' };
    }
    const toOpp = angleToTarget(agent, opponent.physics.position);
    let dodgeAngle;
    if (hint) {
        dodgeAngle = parseDirectionHint(hint, toOpp);
    }
    else {
        // Dodge perpendicular away from opponent attack vector, or just sideways
        const side = tickRand(agent.id, agent.physics.position.x, 304) < 0.5 ? Math.PI / 2 : -Math.PI / 2;
        dodgeAngle = toOpp + side;
    }
    return {
        inputAngle: null,
        speedMult: 1.0,
        moveId: null,
        dodgeDir: angleToDodgeDirection(dodgeAngle),
        done: true,
        reasoning: 'Dodging!',
    };
}
function macroAttack(agent, opponent, preferredMoveId) {
    if (!canInitiateAttack(agent)) {
        // Circle while waiting to be able to attack
        const toOpp = angleToTarget(agent, opponent.physics.position);
        const side = tickRand(agent.id, agent.physics.position.x, 309) < 0.5 ? 1 : -1;
        return { inputAngle: toOpp + side * (Math.PI / 2), speedMult: 0.7, moveId: null, dodgeDir: null, done: false, reasoning: 'Waiting for attack opening, circling' };
    }
    const moveId = preferredMoveId || getBestAvailableAttackMove(agent, opponent);
    if (!moveId) {
        // No attack off cooldown — circle to stay safe
        const toOpp = angleToTarget(agent, opponent.physics.position);
        const side = tickRand(agent.id, agent.physics.position.x, 310) < 0.5 ? 1 : -1;
        return { inputAngle: toOpp + side * (Math.PI / 2), speedMult: 0.6, moveId: null, dodgeDir: null, done: false, reasoning: 'All attacks on cooldown, circling' };
    }
    // If out of range, rush toward opponent with high speed
    const def = getMoveDef(moveId);
    const dist = distanceBetweenAgents(agent, opponent);
    if (def?.range && dist > def.range) {
        const angle = angleToTarget(agent, opponent.physics.position);
        return { inputAngle: angle, speedMult: 1.3, moveId: null, dodgeDir: null, done: false, reasoning: `Closing fast for ${moveId}` };
    }
    return {
        inputAngle: null,
        speedMult: 1,
        moveId,
        dodgeDir: null,
        done: true,
        reasoning: `Committing ${moveId}`,
    };
}
function macroRetreat(agent, opponent, ticks) {
    const angle = angleToTarget(agent, opponent.physics.position) + Math.PI;
    const jitter = (tickRand(agent.id, ticks, 305) - 0.5) * 0.5;
    return {
        inputAngle: angle + jitter,
        speedMult: 1.0,
        moveId: null,
        dodgeDir: null,
        done: false,
        reasoning: 'Retreating',
    };
}
function macroShieldUp(agent, opponent) {
    if (!canInitiateAttack(agent)) {
        return { inputAngle: null, speedMult: 1, moveId: null, dodgeDir: null, done: true, reasoning: 'Busy, cannot shield' };
    }
    const hasShield = getAvailableMoves(agent).includes('shield_block') && isMoveOffCooldown(agent, 'shield_block');
    if (hasShield) {
        return { inputAngle: null, speedMult: 1, moveId: 'shield_block', dodgeDir: null, done: true, reasoning: 'Raising shield' };
    }
    // Fallback: retreat
    return macroRetreat(agent, opponent, 0);
}
function macroWait() {
    return { inputAngle: null, speedMult: 1, moveId: null, dodgeDir: null, done: false, reasoning: 'Waiting for opening' };
}
function macroKite(agent, opponent, ticks) {
    const dist = distanceBetweenAgents(agent, opponent);
    const toOpp = angleToTarget(agent, opponent.physics.position);
    // Try ranged attack if in range
    const rangedMove = getAvailableMoves(agent).find((m) => {
        const d = getMoveDef(m);
        return d && d.range && d.range >= 200 && isMoveOffCooldown(agent, m) && dist <= d.range;
    });
    if (rangedMove && canInitiateAttack(agent)) {
        return {
            inputAngle: null,
            speedMult: 1,
            moveId: rangedMove,
            dodgeDir: null,
            done: true,
            reasoning: `Kiting with ${rangedMove}`,
        };
    }
    // Retreat if too close, strafe if at good range
    if (dist < 120) {
        const retreatAngle = toOpp + Math.PI + (tickRand(agent.id, ticks, 306) - 0.5) * 0.6;
        return { inputAngle: retreatAngle, speedMult: 1.0, moveId: null, dodgeDir: null, done: false, reasoning: 'Kiting: too close, backing off' };
    }
    const strafeAngle = toOpp + (Math.PI / 2) * (tickRand(agent.id, ticks, 307) < 0.5 ? 1 : -1);
    return { inputAngle: strafeAngle, speedMult: 0.85, moveId: null, dodgeDir: null, done: false, reasoning: 'Kiting: strafing at range' };
}
function macroPunish(agent, opponent, state, ticks) {
    const window = state.whiffWindows[agent.id];
    if (!window || state.tick > window.untilTick) {
        // No window — fallback to aggressive approach
        return macroApproach(agent, opponent, ticks);
    }
    // Rush in and attack
    const dist = distanceBetweenAgents(agent, opponent);
    if (dist > getBestAttackRange(agent) && ticks < 8) {
        const angle = angleToTarget(agent, opponent.physics.position);
        return { inputAngle: angle, speedMult: 1.2, moveId: null, dodgeDir: null, done: false, reasoning: 'Punish: rushing in!' };
    }
    const moveId = getBestAvailableAttackMove(agent, opponent);
    if (moveId && canInitiateAttack(agent)) {
        return { inputAngle: null, speedMult: 1, moveId, dodgeDir: null, done: true, reasoning: 'Punish: striking!' };
    }
    return macroApproach(agent, opponent, ticks);
}
function macroDodgeAndCounter(agent, opponent, state, ticks) {
    // Phase 1: wait for opponent to commit (up to 12 ticks)
    if (ticks < 12 && !isWindingUp(opponent)) {
        // Slight backpedal to invite attack
        const toOpp = angleToTarget(agent, opponent.physics.position);
        return {
            inputAngle: toOpp + Math.PI,
            speedMult: 0.4,
            moveId: null,
            dodgeDir: null,
            done: false,
            reasoning: 'D&C: baiting opponent to attack',
        };
    }
    // Phase 2: dodge if opponent winds up
    if (isWindingUp(opponent) && agent.dodgeCooldown <= 0 && !agent.isDodging) {
        const toOpp = angleToTarget(agent, opponent.physics.position);
        const side = tickRand(agent.id, state.tick, 308) < 0.5 ? Math.PI / 2 : -Math.PI / 2;
        return {
            inputAngle: null,
            speedMult: 1.0,
            moveId: null,
            dodgeDir: angleToDodgeDirection(toOpp + side),
            done: false,
            reasoning: 'D&C: dodging the commitment!',
        };
    }
    // Phase 3: counter-attack
    if (ticks > 5 && canInitiateAttack(agent)) {
        const moveId = getBestAvailableAttackMove(agent, opponent);
        if (moveId) {
            return { inputAngle: null, speedMult: 1, moveId, dodgeDir: null, done: true, reasoning: 'D&C: counter-attacking!' };
        }
    }
    return { inputAngle: null, speedMult: 1, moveId: null, dodgeDir: null, done: false, reasoning: 'D&C: waiting for counter window' };
}
function macroRushdown(agent, opponent, ticks) {
    const dist = distanceBetweenAgents(agent, opponent);
    const inRange = dist <= getBestAttackRange(agent);
    if (inRange && canInitiateAttack(agent)) {
        const moveId = getBestAvailableAttackMove(agent, opponent);
        if (moveId) {
            return { inputAngle: null, speedMult: 1, moveId, dodgeDir: null, done: true, reasoning: 'Rushdown: attacking!' };
        }
    }
    // If we've been rushing for a while and no attack is ready, transition to circling
    if (ticks > 30 && !getBestAvailableAttackMove(agent, opponent)) {
        const toOpp = angleToTarget(agent, opponent.physics.position);
        const side = tickRand(agent.id, agent.physics.position.x, 311) < 0.5 ? 1 : -1;
        return { inputAngle: toOpp + side * (Math.PI / 2), speedMult: 0.7, moveId: null, dodgeDir: null, done: false, reasoning: 'Rushdown: circling for opening' };
    }
    const angle = angleToTarget(agent, opponent.physics.position);
    return {
        inputAngle: angle,
        speedMult: 1.25,
        moveId: null,
        dodgeDir: null,
        done: false,
        reasoning: 'Rushdown: closing fast',
    };
}
/* ─── Helpers ─── */
function getBestAttackRange(agent) {
    let maxRange = 90; // basic_attack
    for (const m of getAvailableMoves(agent)) {
        const d = getMoveDef(m);
        if (d && d.range && d.damage && d.damage > 0) {
            maxRange = Math.max(maxRange, d.range);
        }
    }
    return maxRange;
}
function getBestAvailableAttackMove(agent, opponent) {
    const dist = distanceBetweenAgents(agent, opponent);
    let best = null;
    let bestScore = -1;
    for (const m of getAvailableMoves(agent)) {
        const d = getMoveDef(m);
        if (!d || !d.damage || d.damage <= 0)
            continue;
        if (!isMoveOffCooldown(agent, m))
            continue;
        if (d.range && dist > d.range)
            continue;
        let score = d.damage;
        if (agent.statusEffects.some((se) => se.type === 'damage_boost' && se.remainingTicks > 5)) {
            score += 5;
        }
        if (score > bestScore) {
            bestScore = score;
            best = m;
        }
    }
    return best;
}
function parseDirectionHint(hint, baseAngle) {
    const h = hint.toLowerCase();
    if (h.includes('back')) {
        if (h.includes('left'))
            return baseAngle + Math.PI * 0.75;
        if (h.includes('right'))
            return baseAngle - Math.PI * 0.75;
        return baseAngle + Math.PI;
    }
    if (h.includes('left'))
        return baseAngle + Math.PI / 2;
    if (h.includes('right'))
        return baseAngle - Math.PI / 2;
    if (h.includes('forward'))
        return baseAngle;
    return baseAngle + Math.PI / 2;
}
function angleToDodgeDirection(angle) {
    const a = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    // 8 directions
    const sector = Math.round(a / (Math.PI / 4)) % 8;
    const dirs = [
        'dodge_right',
        'dodge_down_right',
        'dodge_down',
        'dodge_down_left',
        'dodge_left',
        'dodge_up_left',
        'dodge_up',
        'dodge_up_right',
    ];
    return dirs[sector];
}
//# sourceMappingURL=macros.js.map