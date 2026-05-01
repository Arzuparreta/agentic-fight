import { RoundResult } from '@shared/index';
export interface EconomyState {
    money: Record<string, number>;
    consecutiveLosses: Record<string, number>;
}
export declare function calculateEarnings(roundResult: RoundResult, previousEconomy: EconomyState): {
    earnings: Record<string, number>;
    newEconomy: EconomyState;
};
//# sourceMappingURL=economy.d.ts.map