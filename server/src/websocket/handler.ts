import { Server, Socket } from 'socket.io';
import { RoomManager } from '../rooms/manager';

export function registerHandlers(io: Server, roomManager: RoomManager) {
  io.on('connection', (socket: Socket) => {
    console.log(`[WS] Client connected: ${socket.id}`);

    socket.on('create_room', () => {
      const room = roomManager.createRoom(socket.id);
      socket.join(room.id);
      socket.emit('room_created', { roomId: room.id, room: roomManager.getPublicRoomState(room.id) });
      console.log(`[WS] Room created: ${room.id} by ${socket.id}`);
    });

    socket.on('join_room', async (data: { roomId: string; role: 'browser' | 'mobile'; agentName?: string; characterDescription?: string }) => {
      const result = roomManager.joinRoom(
        socket.id,
        data.roomId,
        data.role,
        data.agentName,
        data.characterDescription
      );

      if ('error' in result) {
        socket.emit('error', { message: result.error });
        return;
      }

      socket.join(result.room.id);
      socket.emit('joined_room', { roomId: result.room.id, playerId: result.player.id });
      console.log(`[WS] ${data.role} joined room ${result.room.id}: ${result.player.id}`);

      if (result.room.phase === 'coaching') {
        const coachingResult = await roomManager.startCoachingConversation(result.room.id);
        if ('error' in coachingResult) {
          console.error('[WS] Coaching conversation failed:', coachingResult.error);
        }
      }
      io.to(result.room.id).emit('room_state', roomManager.getPublicRoomState(result.room.id));
    });

    socket.on('reconnect', (data: { roomId: string; oldPlayerId: string }) => {
      const result = roomManager.reconnectRoom(socket.id, data.roomId, data.oldPlayerId);
      if ('error' in result) {
        socket.emit('error', { message: result.error });
        return;
      }

      socket.join(result.room.id);
      socket.emit('reconnected', { roomId: result.room.id, playerId: result.player.id });
      io.to(result.room.id).emit('room_state', roomManager.getPublicRoomState(result.room.id));
      console.log(`[WS] Reconnected ${result.player.id} to room ${result.room.id}`);
    });

    socket.on('coaching_message', async (data: { roomId: string; playerId: string; content: string }) => {
      const result = await roomManager.handlePlayerCoachingMessage(data.roomId, data.playerId, data.content);
      if ('error' in result) {
        socket.emit('error', { message: result.error });
        return;
      }

      const player = result.room.players[data.playerId];
      if (player) {
        io.to(player.socketId).emit('agent_coaching_message', {
          content: result.agentResponse,
          timestamp: Date.now(),
        });
      }

      console.log(`[WS] Coaching message in room ${data.roomId} from ${data.playerId}`);
    });

    socket.on('coaching_ready', async (data: { roomId: string; playerId: string }) => {
      const result = await roomManager.markCoachingReady(data.roomId, data.playerId);
      if ('error' in result) {
        socket.emit('error', { message: result.error });
        return;
      }

      io.to(result.room.id).emit('room_state', roomManager.getPublicRoomState(result.room.id));

      if (result.room.phase === 'simulating') {
        const simResult = await roomManager.runSimulation(result.room.id);
        if ('error' in simResult) {
          io.to(result.room.id).emit('error', { message: simResult.error });
          return;
        }

        io.to(result.room.id).emit('phase_change', { newPhase: 'playback' });
        io.to(result.room.id).emit('simulation_complete', {
          eventLog: simResult.room.eventLog,
          roundResult: simResult.result,
        });
        console.log(`[WS] Simulation complete for room ${result.room.id}`);
      }
    });

    socket.on('playback_complete', (data: { roomId: string }) => {
      const result = roomManager.markPlaybackComplete(data.roomId);
      if ('error' in result) {
        socket.emit('error', { message: result.error });
        return;
      }

      io.to(result.room.id).emit('phase_change', { newPhase: result.room.phase });
      io.to(result.room.id).emit('room_state', roomManager.getPublicRoomState(result.room.id));

      if (result.room.phase === 'ended') {
        io.to(result.room.id).emit('match_ended', { wins: result.room.wins });
      } else if (result.room.phase === 'shop') {
        io.to(result.room.id).emit('economy_update', {
          money: result.room.economy.money,
          roundResult: result.room.roundHistory[result.room.roundHistory.length - 1],
        });
      }

      console.log(`[WS] Playback complete for room ${data.roomId}, phase: ${result.room.phase}`);
    });

    socket.on('purchase_item', (data: { roomId: string; playerId: string; itemId: string }) => {
      const result = roomManager.purchaseItem(data.roomId, data.playerId, data.itemId);
      if ('error' in result) {
        socket.emit('error', { message: result.error });
        return;
      }

      socket.emit('purchase_result', result.result);
      io.to(result.room.id).emit('room_state', roomManager.getPublicRoomState(result.room.id));
      console.log(`[WS] Purchase in room ${data.roomId}: ${data.playerId} bought ${data.itemId}`);
    });

    socket.on('shop_ready', async (data: { roomId: string; playerId: string }) => {
      const result = roomManager.markShopReady(data.roomId, data.playerId);
      if ('error' in result) {
        socket.emit('error', { message: result.error });
        return;
      }

      if (result.room.phase === 'coaching') {
        const coachingResult = await roomManager.startCoachingConversation(result.room.id);
        if (!('error' in coachingResult)) {
          for (const [playerId, message] of Object.entries(coachingResult.agentMessages)) {
            const player = result.room.players[playerId];
            if (player) {
              io.to(player.socketId).emit('agent_coaching_message', {
                content: message,
                timestamp: Date.now(),
              });
            }
          }
        }
        io.to(result.room.id).emit('room_state', roomManager.getPublicRoomState(result.room.id));
        io.to(result.room.id).emit('phase_change', { newPhase: 'coaching' });
      } else {
        io.to(result.room.id).emit('room_state', roomManager.getPublicRoomState(result.room.id));
      }
    });

    socket.on('disconnect', () => {
      console.log(`[WS] Client disconnected: ${socket.id}`);
      const result = roomManager.leaveRoom(socket.id);

      if (result.room && result.playerId) {
        io.to(result.room.id).emit('player_disconnected', {
          playerId: result.playerId,
          countdown: 10,
        });
        io.to(result.room.id).emit('room_state', roomManager.getPublicRoomState(result.room.id));
        console.log(`[WS] Player ${result.playerId} disconnected from room ${result.room.id}`);
      }
    });
  });
}
