import { Socket } from 'socket.io-client';
export declare function renderCoachingScreen(container: HTMLElement, roomId: string, playerId: string, socket: Socket, existingMessages?: {
    sender: 'player' | 'agent';
    content: string;
}[]): void;
export declare function updateCoachingMessages(newMessages: {
    sender: 'player' | 'agent';
    content: string;
}[]): void;
//# sourceMappingURL=coaching.d.ts.map