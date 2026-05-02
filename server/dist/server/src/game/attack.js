import { getMoveDef, } from '@shared/index';
import { angleToTarget, distanceBetweenAgents, isFacingTarget, snapFacing, turnToward } from './physics';
/**
 * Begin an attack if the move is available, off cooldown, and in range.
 * Returns events (windup + optional move event).
 */
export function startAttack(agent, opponent, moveId, tick) {
    const def = getMoveDef(moveId);
    if (!def || !def.attackProfile) {
        return { success: false, events: [] };
    }
    // Check cooldown
    if ((agent.cooldowns[moveId] ?? 0) > 0) {
        return { success: false, events: [] };
    }
    // Check range
    if (def.range && def.range > 0) {
        const dist = distanceBetweenAgents(agent, opponent);
        if (dist > def.range) {
            return { success: false, events: [] };
        }
    }
    // Check facing (must be roughly facing opponent)
    if (!isFacingTarget(agent, opponent.physics.position)) {
        // We allow windup to start if close, but we'll enforce facing before active frames
    }
    // Commit to attack: snap facing toward opponent for telegraph clarity
    const targetAngle = angleToTarget(agent, opponent.physics.position);
    snapFacing(agent, targetAngle);
    agent.attackState = {
        phase: 'windup',
        moveId,
        ticksInPhase: 0,
        hasHit: false,
        facingAtStart: agent.physics.facingAngle,
    };
    const events = [];
    events.push({
        tick,
        agentId: agent.id,
        type: 'windup',
        payload: {
            move: moveId,
            windupTicks: def.attackProfile.windupTicks,
            position: { ...agent.physics.position },
        },
    });
    return { success: true, events };
}
/**
 * Tick the attack state machine for one agent.
 * Returns events generated this tick.
 */
export function tickAttackState(agent, opponent, state) {
    const events = [];
    const atk = agent.attackState;
    if (atk.phase === 'idle')
        return events;
    const def = getMoveDef(atk.moveId || 'basic_attack');
    if (!def || !def.attackProfile) {
        resetAttackState(agent);
        return events;
    }
    const prof = def.attackProfile;
    atk.ticksInPhase++;
    switch (atk.phase) {
        case 'windup': {
            // During windup, slowly turn to track opponent (they might be circling)
            const targetAngle = angleToTarget(agent, opponent.physics.position);
            turnToward(agent, targetAngle);
            if (atk.ticksInPhase >= prof.windupTicks) {
                // Transition to active
                atk.phase = 'active';
                atk.ticksInPhase = 0;
                events.push({
                    tick: state.tick,
                    agentId: agent.id,
                    type: 'attack_active',
                    payload: {
                        move: atk.moveId,
                        position: { ...agent.physics.position },
                        facing: agent.physics.facingAngle,
                    },
                });
            }
            break;
        }
        case 'active': {
            // Check hit
            if (!atk.hasHit) {
                const dist = distanceBetweenAgents(agent, opponent);
                const inRange = !def.range || dist <= def.range;
                const facingOK = isFacingTarget(agent, opponent.physics.position);
                if (inRange && facingOK) {
                    // HIT!
                    const actualDamage = resolveHit(agent, opponent, def.damage ?? 0, state.tick);
                    atk.hasHit = true;
                    events.push({
                        tick: state.tick,
                        agentId: agent.id,
                        type: 'attack',
                        payload: {
                            targetId: opponent.id,
                            damage: actualDamage,
                            move: atk.moveId,
                        },
                    });
                    if (actualDamage > 0) {
                        events.push({
                            tick: state.tick,
                            agentId: opponent.id,
                            type: 'hit',
                            payload: {
                                fromId: agent.id,
                                damage: actualDamage,
                                hpRemaining: opponent.hp,
                            },
                        });
                    }
                    else {
                        // Dodged / invincible
                        events.push({
                            tick: state.tick,
                            agentId: opponent.id,
                            type: 'hit',
                            payload: {
                                fromId: agent.id,
                                damage: 0,
                                hpRemaining: opponent.hp,
                                dodged: true,
                            },
                        });
                    }
                    if (opponent.hp <= 0) {
                        opponent.status = 'dead';
                        events.push({
                            tick: state.tick,
                            agentId: opponent.id,
                            type: 'death',
                            payload: { killerId: agent.id },
                        });
                    }
                }
            }
            if (atk.ticksInPhase >= prof.activeTicks) {
                // End active
                if (atk.hasHit) {
                    atk.phase = 'recovery';
                }
                else {
                    atk.phase = 'whiff';
                    // Open a counter window for the opponent
                    state.whiffWindows[opponent.id] = {
                        untilTick: state.tick + prof.whiffRecoveryExtraTicks + prof.recoveryTicks + 4,
                        moveId: atk.moveId,
                        fromAgentId: agent.id,
                    };
                    events.push({
                        tick: state.tick,
                        agentId: agent.id,
                        type: 'whiff',
                        payload: { move: atk.moveId },
                    });
                    events.push({
                        tick: state.tick,
                        agentId: opponent.id,
                        type: 'counter_window',
                        payload: { fromId: agent.id, untilTick: state.tick + prof.whiffRecoveryExtraTicks + prof.recoveryTicks + 4 },
                    });
                }
                atk.ticksInPhase = 0;
            }
            break;
        }
        case 'recovery':
        case 'whiff': {
            const duration = atk.phase === 'whiff'
                ? prof.recoveryTicks + prof.whiffRecoveryExtraTicks
                : prof.recoveryTicks;
            if (atk.ticksInPhase >= duration) {
                // Apply cooldown at the END of recovery (so you can't buffer another attack mid-recovery)
                const cd = getCooldown(agent, atk.moveId, def.cooldown ?? 12);
                agent.cooldowns[atk.moveId] = cd;
                events.push({
                    tick: state.tick,
                    agentId: agent.id,
                    type: 'recovery',
                    payload: {
                        move: atk.moveId,
                        phase: atk.phase,
                        position: { ...agent.physics.position },
                    },
                });
                resetAttackState(agent);
            }
            break;
        }
    }
    return events;
}
function resetAttackState(agent) {
    agent.attackState = {
        phase: 'idle',
        moveId: null,
        ticksInPhase: 0,
        hasHit: false,
        facingAtStart: agent.physics.facingAngle,
    };
}
/**
 * Resolve damage including status effects.
 */
function resolveHit(attacker, target, baseDamage, tick) {
    if (tick < target.dodgeInvincibleUntilTick) {
        return 0;
    }
    let damage = baseDamage + attacker.stats.attackDamage - 10;
    const damageBoost = attacker.statusEffects
        .filter((se) => se.type === 'damage_boost')
        .reduce((sum, se) => sum + se.value, 0);
    damage += damageBoost;
    const reduction = target.statusEffects
        .filter((se) => se.type === 'damage_reduction')
        .reduce((sum, se) => sum + se.value, 0);
    if (reduction > 0) {
        damage = Math.floor(damage * (1 - Math.min(reduction, 0.9)));
    }
    damage = Math.max(1, Math.floor(damage));
    target.hp = Math.max(0, target.hp - damage);
    return damage;
}
function getCooldown(agent, moveId, baseCooldown) {
    const slow = agent.statusEffects
        .filter((se) => se.type === 'cooldown_slow')
        .reduce((sum, se) => sum + se.value, 0);
    return baseCooldown + slow;
}
/**
 * Is the agent currently in a state where they can initiate a new attack?
 */
export function canInitiateAttack(agent) {
    return agent.attackState.phase === 'idle';
}
/**
 * Is the agent currently vulnerable (in recovery or whiff)?
 */
export function isVulnerable(agent) {
    return agent.attackState.phase === 'recovery' || agent.attackState.phase === 'whiff';
}
/**
 * Is the agent in windup (telegraphing an attack)?
 */
export function isWindingUp(agent) {
    return agent.attackState.phase === 'windup';
}
//# sourceMappingURL=attack.js.map