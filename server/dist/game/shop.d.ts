import { RoomPlayer } from '@shared/index';
export interface PurchaseResult {
    success: boolean;
    message: string;
    player?: RoomPlayer;
}
export declare function getAvailableItems(player: RoomPlayer): string[];
export declare function purchaseItem(player: RoomPlayer, itemId: string): PurchaseResult;
//# sourceMappingURL=shop.d.ts.map