import { Room, RoomPlayer, SimEvent, RoundResult, Message, DisconnectState, STARTING_MONEY } from '@shared/index';
import { AgentConfig } from '../game/state';
import { simulateRound, PlanClient } from '../game/engine';
import { calculateEarnings, EconomyState } from '../game/economy';
import { purchaseItem } from '../game/shop';
import { updatePlaystyleMemory, CoachingMessage } from '../llm/ollama';

const RECONNECT_TIMEOUT_MS = 10000;
const ROUNDS_TO_WIN = 3; // Best of 5

function generateRoomId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let id = '';
  for (let i = 0; i < 4; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

function createRoomPlayer(
  socketId: string,
  role: 'browser' | 'mobile',
  agentName?: string,
  characterDescription?: string
): RoomPlayer {
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
    ready: false,
  };
}

export class RoomManager {
  private rooms: Map<string, Room> = new Map();

  createRoom(browserSocketId: string): Room {
    let id = generateRoomId();
    while (this.rooms.has(id)) {
      id = generateRoomId();
    }

    const room: Room = {
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

    // Browser joins automatically as the room creator
    const browserPlayer = createRoomPlayer(browserSocketId, 'browser', 'Browser Display');
    room.players[browserPlayer.id] = browserPlayer;
    room.socketToPlayer[browserSocketId] = browserPlayer.id;

    this.rooms.set(id, room);
    return room;
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId.toUpperCase());
  }

  joinRoom(
    socketId: string,
    roomId: string,
    role: 'browser' | 'mobile',
    agentName?: string,
    characterDescription?: string
  ): { room: Room; player: RoomPlayer } | { error: string } {
    const room = this.getRoom(roomId);
    if (!room) {
      return { error: 'Room not found.' };
    }

    // Check if this socket is reconnecting
    if (room.socketToPlayer[socketId]) {
      const playerId = room.socketToPlayer[socketId];
      return { room, player: room.players[playerId] };
    }

    // Check for mobile capacity
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

    // If 2 mobiles joined, transition to coaching
    const mobiles = Object.values(room.players).filter((p) => p.role === 'mobile');
    if (mobiles.length === 2 && room.phase === 'lobby') {
      room.phase = 'coaching';
    }

    return { room, player };
  }

  leaveRoom(socketId: string): { room?: Room; playerId?: string; forfeit?: boolean } {
    for (const room of this.rooms.values()) {
      const playerId = room.socketToPlayer[socketId];
      if (!playerId) continue;

      const player = room.players[playerId];
      if (!player) continue;

      // Browser disconnecting is less critical
      if (player.role === 'browser') {
        delete room.socketToPlayer[socketId];
        return { room, playerId };
      }

      // Mobile disconnecting: start reconnect timer
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

  reconnectRoom(
    socketId: string,
    roomId: string,
    oldPlayerId: string
  ): { room: Room; player: RoomPlayer } | { error: string } {
    const room = this.getRoom(roomId);
    if (!room) {
      return { error: 'Room not found.' };
    }

    const player = room.players[oldPlayerId];
    if (!player) {
      return { error: 'Player not found in room.' };
    }

    // Cancel disconnect timer
    const disc = room.disconnects[oldPlayerId];
    if (disc) {
      clearTimeout(disc.timer);
      delete room.disconnects[oldPlayerId];
    }

    // Update socket mapping
    room.socketToPlayer[socketId] = oldPlayerId;
    player.socketId = socketId;

    return { room, player };
  }

  private handleDisconnectTimeout(roomId: string, playerId: string) {
    const room = this.getRoom(roomId);
    if (!room) return;

    // If player already reconnected, do nothing
    if (!room.disconnects[playerId]) return;

    delete room.disconnects[playerId];
    delete room.players[playerId];

    // Forfeit: opponent wins the match
    const opponent = Object.values(room.players).find(
      (p) => p.role === 'mobile' && p.id !== playerId
    );
    if (opponent) {
      room.wins[opponent.id] = ROUNDS_TO_WIN;
      room.phase = 'ended';
    }
  }

  async addCoachingMessage(
    roomId: string,
    playerId: string,
    content: string
  ): Promise<{ room: Room } | { error: string }> {
    const room = this.getRoom(roomId);
    if (!room) return { error: 'Room not found.' };

    const player = room.players[playerId];
    if (!player) return { error: 'Player not found.' };

    player.coachingMessages.push({
      sender: 'player',
      content,
      timestamp: Date.now(),
    });

    return { room };
  }

  async markCoachingReady(
    roomId: string,
    playerId: string
  ): Promise<{ room: Room } | { error: string }> {
    const room = this.getRoom(roomId);
    if (!room) return { error: 'Room not found.' };
    if (room.phase !== 'coaching') return { error: 'Not in coaching phase.' };

    const player = room.players[playerId];
    if (!player) return { error: 'Player not found.' };

    player.ready = true;

    // Check if all mobile players are ready
    const mobiles = Object.values(room.players).filter((p) => p.role === 'mobile');
    const allReady = mobiles.length === 2 && mobiles.every((p) => p.ready);

    if (allReady) {
      // Update playstyle memories for both players
      await Promise.all(
        mobiles.map(async (p) => {
          const msgs: CoachingMessage[] = p.coachingMessages.map((m) => ({
            sender: m.sender as 'player' | 'agent',
            content: m.content,
          }));
          p.playstyleMemory = await updatePlaystyleMemory(
            p.playstyleMemory,
            p.characterDescription,
            msgs
          );
        })
      );

      // Reset ready flags
      mobiles.forEach((p) => (p.ready = false));

      // Transition to simulating
      room.phase = 'simulating';
    }

    return { room };
  }

  async runSimulation(
    roomId: string,
    planClient?: PlanClient
  ): Promise<{ room: Room; result: RoundResult } | { error: string }> {
    const room = this.getRoom(roomId);
    if (!room) return { error: 'Room not found.' };
    if (room.phase !== 'simulating') return { error: 'Not in simulating phase.' };

    const mobiles = Object.values(room.players).filter((p) => p.role === 'mobile');
    if (mobiles.length !== 2) return { error: 'Need exactly 2 mobile players.' };

    const [pA, pB] = mobiles;

    const agentA: AgentConfig = {
      id: pA.id,
      name: pA.agentName,
      stats: pA.stats,
      moves: pA.moves,
      playstyleMemory: pA.playstyleMemory,
      characterDescription: pA.characterDescription,
    };

    const agentB: AgentConfig = {
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

    // Determine winner
    const winnerId = simResult.winnerId;
    if (winnerId) {
      room.wins[winnerId] = (room.wins[winnerId] || 0) + 1;
    }

    const roundResult: RoundResult = {
      roundNumber: room.currentRound,
      winnerId,
      agentA: { id: pA.id, hpRemaining: winnerId === pA.id ? (winnerId ? 1 : 100) : 0 }, // Simplified, will fix
      agentB: { id: pB.id, hpRemaining: winnerId === pB.id ? (winnerId ? 1 : 100) : 0 },
      earnings: {},
    };

    // Fix HP remaining — get from final sim state
    const finalEvents = simResult.eventLog;
    const deathEvents = finalEvents.filter((e) => e.type === 'death');
    const hitEvents = finalEvents.filter((e) => e.type === 'hit');

    // Calculate remaining HP from hit events
    let hpA = pA.stats.maxHp;
    let hpB = pB.stats.maxHp;
    for (const ev of hitEvents) {
      if (ev.agentId === pA.id) {
        hpA = (ev.payload.hpRemaining as number) ?? hpA;
      } else if (ev.agentId === pB.id) {
        hpB = (ev.payload.hpRemaining as number) ?? hpB;
      }
    }

    roundResult.agentA.hpRemaining = hpA;
    roundResult.agentB.hpRemaining = hpB;

    // Calculate economy
    const { earnings, newEconomy } = calculateEarnings(roundResult, room.economy);
    roundResult.earnings = earnings;
    room.economy = newEconomy;

    // Update player money
    for (const mobile of mobiles) {
      mobile.money = room.economy.money[mobile.id] || 0;
    }

    room.roundHistory.push(roundResult);
    room.phase = 'playback';

    console.log(`[Room ${roomId}] Round ${room.currentRound} complete. Winner: ${winnerId || 'draw'}`);

    return { room, result: roundResult };
  }

  markPlaybackComplete(roomId: string): { room: Room } | { error: string } {
    const room = this.getRoom(roomId);
    if (!room) return { error: 'Room not found.' };
    if (room.phase !== 'playback') return { error: 'Not in playback phase.' };

    // Check if match is over
    const mobiles = Object.values(room.players).filter((p) => p.role === 'mobile');
    for (const mobile of mobiles) {
      if ((room.wins[mobile.id] || 0) >= ROUNDS_TO_WIN) {
        room.phase = 'ended';
        return { room };
      }
    }

    // Transition to shop
    room.phase = 'shop';
    room.currentRound++;

    // Reset coaching state for next round
    for (const mobile of mobiles) {
      mobile.coachingMessages = [];
      mobile.ready = false;
    }

    return { room };
  }

  purchaseItem(
    roomId: string,
    playerId: string,
    itemId: string
  ): { room: Room; result: { success: boolean; message: string } } | { error: string } {
    const room = this.getRoom(roomId);
    if (!room) return { error: 'Room not found.' };
    if (room.phase !== 'shop') return { error: 'Not in shop phase.' };

    const player = room.players[playerId];
    if (!player) return { error: 'Player not found.' };

    const purchaseResult = purchaseItem(player, itemId);
    room.economy.money[playerId] = player.money;

    return { room, result: purchaseResult };
  }

  markShopReady(roomId: string, playerId: string): { room: Room } | { error: string } {
    const room = this.getRoom(roomId);
    if (!room) return { error: 'Room not found.' };
    if (room.phase !== 'shop') return { error: 'Not in shop phase.' };

    const player = room.players[playerId];
    if (!player) return { error: 'Player not found.' };

    player.ready = true;

    // Check if all mobile players are ready
    const mobiles = Object.values(room.players).filter((p) => p.role === 'mobile');
    const allReady = mobiles.length === 2 && mobiles.every((p) => p.ready);

    if (allReady) {
      mobiles.forEach((p) => (p.ready = false));
      room.phase = 'coaching';
    }

    return { room };
  }

  getPublicRoomState(roomId: string): Room | undefined {
    const room = this.getRoom(roomId);
    if (!room) return undefined;

    // Return a sanitized version without internal timers
    const sanitized: Room = {
      ...room,
      disconnects: {},
    };
    return sanitized;
  }
}
