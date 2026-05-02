export const MOVE_CATALOG = {
    basic_attack: {
        id: 'basic_attack',
        name: 'Ataque Básico',
        cost: 0,
        type: 'move',
        description: 'Un golpe cuerpo a cuerpo.',
        damage: 8,
        range: 80,
        cooldown: 20,
    },
    sword_lunge: {
        id: 'sword_lunge',
        name: 'Estocada',
        cost: 600,
        type: 'move',
        description: 'Una estocada poderosa de caballero. Alto daño a corta distancia.',
        damage: 25,
        range: 100,
        cooldown: 30,
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
    },
    crossbow: {
        id: 'crossbow',
        name: 'Ballesta',
        cost: 800,
        type: 'move',
        description: 'Disparo de ballesta a distancia. Funciona desde lejos.',
        damage: 15,
        range: 300,
        cooldown: 25,
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