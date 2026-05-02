import { Room, RoomPlayer, RoundResult } from '@shared/index';
import { TacticalSequenceClient } from '../game/engine';
export declare class RoomManager {
    private rooms;
    createRoom(browserSocketId: string): Room;
    getRoom(roomId: string): Room | undefined;
    joinRoom(socketId: string, roomId: string, role: 'browser' | 'mobile', agentName?: string, characterDescription?: string): {
        room: Room;
        player: RoomPlayer;
    } | {
        error: string;
    };
    leaveRoom(socketId: string): {
        room?: Room;
        playerId?: string;
        forfeit?: boolean;
    };
    reconnectRoom(socketId: string, roomId: string, oldPlayerId: string): {
        room: Room;
        player: RoomPlayer;
    } | {
        error: string;
    };
    private handleDisconnectTimeout;
    startCoachingConversation(roomId: string): Promise<{
        room: Room;
        agentMessages: Record<string, string>;
    } | {
        error: string;
    }>;
    handlePlayerCoachingMessage(roomId: string, playerId: string, content: string): Promise<{
        room: Room;
        agentResponse: string;
    } | {
        error: string;
    }>;
    markCoachingReady(roomId: string, playerId: string): Promise<{
        room: Room;
    } | {
        error: string;
    }>;
    runSimulation(roomId: string, sequenceClient?: TacticalSequenceClient): Promise<{
        room: Room;
        result: RoundResult;
    } | {
        error: string;
    }>;
    markPlaybackComplete(roomId: string): {
        room: Room;
    } | {
        error: string;
    };
    purchaseItem(roomId: string, playerId: string, itemId: string): {
        room: Room;
        result: {
            success: boolean;
            message: string;
        };
    } | {
        error: string;
    };
    markShopReady(roomId: string, playerId: string): {
        room: Room;
    } | {
        error: string;
    };
    getPublicRoomState(roomId: string): Room | undefined;
}
//# sourceMappingURL=manager.d.ts.map