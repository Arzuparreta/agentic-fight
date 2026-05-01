import { STARTING_MONEY } from '@shared/index';
import { simulateRound } from '../game/engine';
import { calculateEarnings } from '../game/economy';
import { purchaseItem } from '../game/shop';
import { synthesizePlaystyle, generateAgentOpeningMessage, generateAgentResponse } from '../llm/ollama';
import { MOVE_CATALOG } from '@shared/index';
const RECONNECT_TIMEOUT_MS = 10000;
const ROUNDS_TO_WIN = 3;
function generateRoomId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let id = '';
    for (let i = 0; i < 4; i++) {
        id += chars[Math.floor(Math.random() * chars.length)];
    }
    return id;
}
function createRoomPlayer(socketId, role, agentName, characterDescription) {
    return {
        id: socketId + '-' + role,
        socketId,
        role,
        agentName: agentName || `Agent ${socketId.slice(0, 4)}`,
        characterDescription: characterDescription || 'a mysterious fighter',
        stats: { maxHp: 150, movementSpeed: 3, attackDamage: 8 },
        moves: [],
        money: STARTING_MONEY,
        coachingMessages: [],
        playstyleMemory: '',
        playstyleProfile: null,
        ready: false,
    };
}
function buildCoachingContext(player, room) {
    const ownedMoves = player.moves.filter(m => MOVE_CATALOG[m]?.type === 'move');
    const ownedBoosts = player.moves.filter(m => MOVE_CATALOG[m]?.type === 'boost');
    let lastRoundResult;
    if (room.roundHistory.length > 0) {
        const last = room.roundHistory[room.roundHistory.length - 1];
        const won = last.winnerId === player.id;
        const score = `${room.wins[player.id] || 0}-${Object.values(room.wins).reduce((s, w, i) => i === 0 ? s : s, 0)}`;
        const notes = won ? 'Victory was yours.' : 'You were defeated.';
        lastRoundResult = { won, score, notes };
    }
    const opponent = Object.values(room.players).find(p => p.role === 'mobile' && p.id !== player.id);
    return {
        agentName: player.agentName,
        characterDescription: player.characterDescription,
        money: player.money,
        ownedMoves,
        ownedBoosts,
        lastRoundResult,
        opponentCharacter: opponent?.characterDescription,
        roundNumber: room.currentRound,
    };
}
export class RoomManager {
    rooms = new Map();
    createRoom(browserSocketId) {
        let id = generateRoomId();
        while (this.rooms.has(id)) {
            id = generateRoomId();
        }
        const room = {
            id,
            phase: 'lobby',
            players: {},
            socketToPlayer: {},
            currentRound: 1,
            eventLog: [],
            roundHistory: [],
            disconnects: {},
            economy: { money: {}, consecutiveLosses: {} },
            wins: {},
        };
        const browserPlayer = createRoomPlayer(browserSocketId, 'browser', 'Browser Display');
        room.players[browserPlayer.id] = browserPlayer;
        room.socketToPlayer[browserSocketId] = browserPlayer.id;
        this.rooms.set(id, room);
        return room;
    }
    getRoom(roomId) {
        return this.rooms.get(roomId.toUpperCase());
    }
    joinRoom(socketId, roomId, role, agentName, characterDescription) {
        const room = this.getRoom(roomId);
        if (!room) {
            return { error: 'Room not found.' };
        }
        if (room.socketToPlayer[socketId]) {
            const playerId = room.socketToPlayer[socketId];
            return { room, player: room.players[playerId] };
        }
        if (role === 'mobile') {
            const mobileCount = Object.values(room.players).filter((p) => p.role === 'mobile').length;
            if (mobileCount >= 2) {
                return { error: 'Room is full (max 2 mobile players).' };
            }
        }
        const player = createRoomPlayer(socketId, role, agentName, characterDescription);
        room.players[player.id] = player;
        room.socketToPlayer[socketId] = player.id;
        room.economy.money[player.id] = STARTING_MONEY;
        room.economy.consecutiveLosses[player.id] = 0;
        room.wins[player.id] = 0;
        const mobiles = Object.values(room.players).filter((p) => p.role === 'mobile');
        if (mobiles.length === 2 && room.phase === 'lobby') {
            room.phase = 'coaching';
        }
        return { room, player };
    }
    leaveRoom(socketId) {
        for (const room of this.rooms.values()) {
            const playerId = room.socketToPlayer[socketId];
            if (!playerId)
                continue;
            const player = room.players[playerId];
            if (!player)
                continue;
            if (player.role === 'browser') {
                delete room.socketToPlayer[socketId];
                return { room, playerId };
            }
            const timer = setTimeout(() => {
                this.handleDisconnectTimeout(room.id, playerId);
            }, RECONNECT_TIMEOUT_MS);
            room.disconnects[playerId] = {
                disconnectedAt: Date.now(),
                timer,
            };
            delete room.socketToPlayer[socketId];
            return { room, playerId };
        }
        return {};
    }
    reconnectRoom(socketId, roomId, oldPlayerId) {
        const room = this.getRoom(roomId);
        if (!room) {
            return { error: 'Room not found.' };
        }
        const player = room.players[oldPlayerId];
        if (!player) {
            return { error: 'Player not found in room.' };
        }
        const disc = room.disconnects[oldPlayerId];
        if (disc) {
            clearTimeout(disc.timer);
            delete room.disconnects[oldPlayerId];
        }
        room.socketToPlayer[socketId] = oldPlayerId;
        player.socketId = socketId;
        return { room, player };
    }
    handleDisconnectTimeout(roomId, playerId) {
        const room = this.getRoom(roomId);
        if (!room)
            return;
        if (!room.disconnects[playerId])
            return;
        delete room.disconnects[playerId];
        delete room.players[playerId];
        const opponent = Object.values(room.players).find((p) => p.role === 'mobile' && p.id !== playerId);
        if (opponent) {
            room.wins[opponent.id] = ROUNDS_TO_WIN;
            room.phase = 'ended';
        }
    }
    async startCoachingConversation(roomId) {
        const room = this.getRoom(roomId);
        if (!room)
            return { error: 'Room not found.' };
        if (room.phase !== 'coaching')
            return { error: 'Not in coaching phase.' };
        const mobiles = Object.values(room.players).filter(p => p.role === 'mobile');
        const agentMessages = {};
        await Promise.all(mobiles.map(async (player) => {
            const ctx = buildCoachingContext(player, room);
            const openingMessage = await generateAgentOpeningMessage(ctx);
            player.coachingMessages.push({
                sender: 'agent',
                content: openingMessage,
                timestamp: Date.now(),
            });
            agentMessages[player.id] = openingMessage;
        }));
        return { room, agentMessages };
    }
    async handlePlayerCoachingMessage(roomId, playerId, content) {
        const room = this.getRoom(roomId);
        if (!room)
            return { error: 'Room not found.' };
        const player = room.players[playerId];
        if (!player)
            return { error: 'Player not found.' };
        player.coachingMessages.push({
            sender: 'player',
            content,
            timestamp: Date.now(),
        });
        const ctx = buildCoachingContext(player, room);
        const agentResponse = await generateAgentResponse(ctx, player.coachingMessages, content);
        player.coachingMessages.push({
            sender: 'agent',
            content: agentResponse,
            timestamp: Date.now(),
        });
        return { room, agentResponse };
    }
    async markCoachingReady(roomId, playerId) {
        const room = this.getRoom(roomId);
        if (!room)
            return { error: 'Room not found.' };
        if (room.phase !== 'coaching')
            return { error: 'Not in coaching phase.' };
        const player = room.players[playerId];
        if (!player)
            return { error: 'Player not found.' };
        player.ready = true;
        const mobiles = Object.values(room.players).filter((p) => p.role === 'mobile');
        const allReady = mobiles.length === 2 && mobiles.every((p) => p.ready);
        if (allReady) {
            await Promise.all(mobiles.map(async (p) => {
                const ctx = buildCoachingContext(p, room);
                const profile = await synthesizePlaystyle(ctx, p.coachingMessages);
                p.playstyleProfile = profile;
                p.playstyleMemory = JSON.stringify(profile);
            }));
            mobiles.forEach((p) => (p.ready = false));
            room.phase = 'simulating';
        }
        return { room };
    }
    async runSimulation(roomId, planClient) {
        const room = this.getRoom(roomId);
        if (!room)
            return { error: 'Room not found.' };
        if (room.phase !== 'simulating')
            return { error: 'Not in simulating phase.' };
        const mobiles = Object.values(room.players).filter((p) => p.role === 'mobile');
        if (mobiles.length !== 2)
            return { error: 'Need exactly 2 mobile players.' };
        const [pA, pB] = mobiles;
        const agentA = {
            id: pA.id,
            name: pA.agentName,
            stats: pA.stats,
            moves: pA.moves,
            playstyleMemory: pA.playstyleMemory,
            characterDescription: pA.characterDescription,
        };
        const agentB = {
            id: pB.id,
            name: pB.agentName,
            stats: pB.stats,
            moves: pB.moves,
            playstyleMemory: pB.playstyleMemory,
            characterDescription: pB.characterDescription,
        };
        console.log(`[Room ${roomId}] Running simulation for round ${room.currentRound}`);
        const simResult = await simulateRound(agentA, agentB, planClient);
        room.eventLog = simResult.eventLog;
        const winnerId = simResult.winnerId;
        if (winnerId) {
            room.wins[winnerId] = (room.wins[winnerId] || 0) + 1;
        }
        const roundResult = {
            roundNumber: room.currentRound,
            winnerId,
            agentA: { id: pA.id, hpRemaining: 0 },
            agentB: { id: pB.id, hpRemaining: 0 },
            earnings: {},
        };
        const finalEvents = simResult.eventLog;
        const hitEvents = finalEvents.filter((e) => e.type === 'hit');
        let hpA = pA.stats.maxHp;
        let hpB = pB.stats.maxHp;
        for (const ev of hitEvents) {
            if (ev.agentId === pA.id) {
                hpA = ev.payload.hpRemaining ?? hpA;
            }
            else if (ev.agentId === pB.id) {
                hpB = ev.payload.hpRemaining ?? hpB;
            }
        }
        roundResult.agentA.hpRemaining = hpA;
        roundResult.agentB.hpRemaining = hpB;
        const { earnings, newEconomy } = calculateEarnings(roundResult, room.economy);
        roundResult.earnings = earnings;
        room.economy = newEconomy;
        for (const mobile of mobiles) {
            mobile.money = room.economy.money[mobile.id] || 0;
        }
        room.roundHistory.push(roundResult);
        room.phase = 'playback';
        console.log(`[Room ${roomId}] Round ${room.currentRound} complete. Winner: ${winnerId || 'draw'}`);
        return { room, result: roundResult };
    }
    markPlaybackComplete(roomId) {
        const room = this.getRoom(roomId);
        if (!room)
            return { error: 'Room not found.' };
        if (room.phase !== 'playback')
            return { error: 'Not in playback phase.' };
        const mobiles = Object.values(room.players).filter((p) => p.role === 'mobile');
        for (const mobile of mobiles) {
            if ((room.wins[mobile.id] || 0) >= ROUNDS_TO_WIN) {
                room.phase = 'ended';
                return { room };
            }
        }
        room.phase = 'shop';
        room.currentRound++;
        for (const mobile of mobiles) {
            mobile.coachingMessages = [];
            mobile.ready = false;
        }
        return { room };
    }
    purchaseItem(roomId, playerId, itemId) {
        const room = this.getRoom(roomId);
        if (!room)
            return { error: 'Room not found.' };
        if (room.phase !== 'shop')
            return { error: 'Not in shop phase.' };
        const player = room.players[playerId];
        if (!player)
            return { error: 'Player not found.' };
        const purchaseResult = purchaseItem(player, itemId);
        room.economy.money[playerId] = player.money;
        return { room, result: purchaseResult };
    }
    markShopReady(roomId, playerId) {
        const room = this.getRoom(roomId);
        if (!room)
            return { error: 'Room not found.' };
        if (room.phase !== 'shop')
            return { error: 'Not in shop phase.' };
        const player = room.players[playerId];
        if (!player)
            return { error: 'Player not found.' };
        player.ready = true;
        const mobiles = Object.values(room.players).filter((p) => p.role === 'mobile');
        const allReady = mobiles.length === 2 && mobiles.every((p) => p.ready);
        if (allReady) {
            mobiles.forEach((p) => (p.ready = false));
            room.phase = 'coaching';
        }
        return { room };
    }
    getPublicRoomState(roomId) {
        const room = this.getRoom(roomId);
        if (!room)
            return undefined;
        const sanitized = {
            ...room,
            disconnects: {},
        };
        return sanitized;
    }
}
//# sourceMappingURL=manager.js.map