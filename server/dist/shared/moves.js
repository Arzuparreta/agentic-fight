export const MOVE_CATALOG = {
    basic_attack: {
        id: 'basic_attack',
        name: 'Ataque Básico',
        cost: 0,
        type: 'move',
        description: 'Un golpe cuerpo a cuerpo rápido.',
        damage: 15,
        range: 90,
        cooldown: 12,
        attackProfile: {
            windupTicks: 1,
            activeTicks: 1,
            recoveryTicks: 3,
            canMoveDuringWindup: false,
            windupMoveSpeedMult: 0.2,
            canMoveDuringRecovery: true,
            recoveryMoveSpeedMult: 0.6,
            whiffRecoveryExtraTicks: 2,
        },
    },
    sword_lunge: {
        id: 'sword_lunge',
        name: 'Estocada',
        cost: 600,
        type: 'move',
        description: 'Una estocada poderosa de caballero. Alto daño a corta distancia.',
        damage: 35,
        range: 110,
        cooldown: 25,
        attackProfile: {
            windupTicks: 3,
            activeTicks: 2,
            recoveryTicks: 5,
            canMoveDuringWindup: false,
            windupMoveSpeedMult: 0.1,
            canMoveDuringRecovery: true,
            recoveryMoveSpeedMult: 0.5,
            whiffRecoveryExtraTicks: 3,
        },
    },
    shield_block: {
        id: 'shield_block',
        name: 'Escudo',
        cost: 500,
        type: 'move',
        description: 'Levanta el escudo castellano. Reduce el daño recibido durante un tiempo.',
        damage: 0,
        range: 0,
        cooldown: 40,
        duration: 40,
        statusEffect: {
            id: 'shield_block',
            type: 'damage_reduction',
            value: 0.5, // 50% damage reduction
        },
        attackProfile: {
            windupTicks: 1,
            activeTicks: 1,
            recoveryTicks: 2,
            canMoveDuringWindup: true,
            windupMoveSpeedMult: 0.4,
            canMoveDuringRecovery: true,
            recoveryMoveSpeedMult: 0.3,
            whiffRecoveryExtraTicks: 0,
        },
    },
    crossbow: {
        id: 'crossbow',
        name: 'Ballesta',
        cost: 800,
        type: 'move',
        description: 'Disparo de ballesta a distancia. Funciona desde lejos.',
        damage: 20,
        range: 350,
        cooldown: 20,
        attackProfile: {
            windupTicks: 2,
            activeTicks: 1,
            recoveryTicks: 3,
            canMoveDuringWindup: false,
            windupMoveSpeedMult: 0.15,
            canMoveDuringRecovery: true,
            recoveryMoveSpeedMult: 0.7,
            whiffRecoveryExtraTicks: 1,
        },
    },
    war_cry: {
        id: 'war_cry',
        name: 'Grito de Guerra',
        cost: 400,
        type: 'move',
        description: 'Un grito que inflige miedo. Aumenta tu daño durante un tiempo.',
        damage: 0,
        range: 0,
        cooldown: 35,
        duration: 60,
        statusEffect: {
            id: 'war_cry',
            type: 'damage_boost',
            value: 5, // +5 damage
        },
        attackProfile: {
            windupTicks: 2,
            activeTicks: 1,
            recoveryTicks: 2,
            canMoveDuringWindup: false,
            windupMoveSpeedMult: 0.2,
            canMoveDuringRecovery: true,
            recoveryMoveSpeedMult: 0.8,
            whiffRecoveryExtraTicks: 0,
        },
    },
    inquisitor_curse: {
        id: 'inquisitor_curse',
        name: 'Maldición',
        cost: 500,
        type: 'move',
        description: 'Maldición inquisitorial. Los enfriamientos del oponente duran más.',
        damage: 0,
        range: 200,
        cooldown: 50,
        duration: 50,
        statusEffect: {
            id: 'inquisitor_curse',
            type: 'cooldown_slow',
            value: 5, // opponent cooldowns +5 ticks
        },
        attackProfile: {
            windupTicks: 2,
            activeTicks: 1,
            recoveryTicks: 3,
            canMoveDuringWindup: false,
            windupMoveSpeedMult: 0.2,
            canMoveDuringRecovery: true,
            recoveryMoveSpeedMult: 0.6,
            whiffRecoveryExtraTicks: 1,
        },
    },
    hp_boost: {
        id: 'hp_boost',
        name: 'Fortaleza',
        cost: 300,
        type: 'boost',
        description: 'Entrenamiento de resistencia. +20 HP máximo permanentemente.',
        statChanges: { maxHp: 20 },
    },
    speed_boost: {
        id: 'speed_boost',
        name: 'Ligereza',
        cost: 400,
        type: 'boost',
        description: 'Movimientos más ligeros. +2 velocidad de movimiento permanentemente.',
        statChanges: { movementSpeed: 2 },
    },
};
export function getAvailableMoves(agent) {
    // Every agent always has basic_attack
    const moves = ['basic_attack', ...agent.moves];
    return moves;
}
export function isMoveOffCooldown(agent, moveId) {
    return (agent.cooldowns[moveId] ?? 0) <= 0;
}
export function getMoveDef(moveId) {
    return MOVE_CATALOG[moveId];
}
//# sourceMappingURL=moves.js.map