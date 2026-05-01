import { MOVE_CATALOG, getMoveDef } from '@shared/index';
export function getAvailableItems(player) {
    // Returns IDs of items the player can still buy
    // Since items are permanent, filter out already-owned moves and boosts
    const owned = new Set([...player.moves]);
    return Object.keys(MOVE_CATALOG).filter((id) => {
        if (id === 'basic_attack')
            return false; // not purchasable
        const def = MOVE_CATALOG[id];
        if (!def)
            return false;
        if (def.type === 'move') {
            return !owned.has(id);
        }
        // Boosts can be bought once per match
        // For simplicity, we track applied boosts via stats changes
        // In a more complex system we'd track purchased boosts separately
        return !owned.has(id);
    });
}
export function purchaseItem(player, itemId) {
    const def = getMoveDef(itemId);
    if (!def) {
        return { success: false, message: `Item "${itemId}" does not exist.` };
    }
    if (itemId === 'basic_attack') {
        return { success: false, message: 'Basic attack is free and always available.' };
    }
    if (player.money < def.cost) {
        return { success: false, message: `Not enough money. Need ${def.cost}, have ${player.money}.` };
    }
    if (player.moves.includes(itemId)) {
        return { success: false, message: `You already own "${def.name}".` };
    }
    // Deduct money
    player.money -= def.cost;
    // Apply item
    if (def.type === 'boost' && def.statChanges) {
        applyStatChanges(player.stats, def.statChanges);
        player.moves.push(itemId); // Track purchased boost
    }
    else if (def.type === 'move') {
        player.moves.push(itemId);
    }
    return {
        success: true,
        message: `Purchased "${def.name}" for ${def.cost}.`,
        player,
    };
}
function applyStatChanges(stats, changes) {
    if (changes.maxHp !== undefined)
        stats.maxHp += changes.maxHp;
    if (changes.movementSpeed !== undefined)
        stats.movementSpeed += changes.movementSpeed;
    if (changes.attackDamage !== undefined)
        stats.attackDamage += changes.attackDamage;
}
//# sourceMappingURL=shop.js.map