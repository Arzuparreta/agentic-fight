import { WINNER_EARNINGS, LOSER_EARNINGS, CONSECUTIVE_LOSS_BONUS, MAX_CONSECUTIVE_LOSS_BONUS } from '@shared/index';
export function calculateEarnings(roundResult, previousEconomy) {
    const earnings = {};
    const newEconomy = {
        money: { ...previousEconomy.money },
        consecutiveLosses: { ...previousEconomy.consecutiveLosses },
    };
    const { agentA, agentB, winnerId } = roundResult;
    const ids = [agentA.id, agentB.id];
    for (const id of ids) {
        const isWinner = winnerId === id;
        const base = isWinner ? WINNER_EARNINGS : LOSER_EARNINGS;
        // Update consecutive losses
        if (isWinner) {
            newEconomy.consecutiveLosses[id] = 0;
        }
        else {
            newEconomy.consecutiveLosses[id] = (previousEconomy.consecutiveLosses[id] || 0) + 1;
        }
        // Apply loss bonus based on losses BEFORE this round
        const prevLosses = previousEconomy.consecutiveLosses[id] || 0;
        const lossBonus = Math.min(prevLosses * CONSECUTIVE_LOSS_BONUS, MAX_CONSECUTIVE_LOSS_BONUS);
        const total = base + lossBonus;
        earnings[id] = total;
        newEconomy.money[id] = (newEconomy.money[id] || 0) + total;
    }
    return { earnings, newEconomy };
}
//# sourceMappingURL=economy.js.map