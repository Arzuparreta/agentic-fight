import { io, Socket } from 'socket.io-client';
import { SimEvent, RoundResult, Vec2, ARENA } from '@shared/index';
import { Renderer } from './canvas/renderer';
import { PlaybackController } from './game/playback';

let socket: Socket;
let renderer: Renderer;
let playback: PlaybackController | null = null;
let currentRoomId = '';
let roomPlayers: Record<string, { name: string; characterDescription: string }> = {};

const SERVER_URL = window.location.origin;

export function connectToServer() {
  socket = io(SERVER_URL);

  socket.on('connect', () => {
    console.log('Browser display connected to server');
    socket.emit('create_room');
  });

  socket.on('room_created', (data: { roomId: string }) => {
    currentRoomId = data.roomId;
    console.log(`Room created: ${data.roomId}`);
    showRoomCode(data.roomId);
  });

  socket.on('room_state', (room) => {
    console.log('Room state updated:', room.phase);
    if (room.players) {
      for (const [id, player] of Object.entries(room.players)) {
        const p = player as { agentName?: string; characterDescription?: string };
        if (p.agentName) {
          roomPlayers[id] = {
            name: p.agentName,
            characterDescription: p.characterDescription || 'a fighter',
          };
        }
      }
    }
  });

  socket.on('phase_change', (data: { newPhase: string }) => {
    console.log(`Phase changed: ${data.newPhase}`);
    if (data.newPhase === 'playback') {
      showMessage('La batalla comienza!');
    } else if (data.newPhase === 'shop') {
      showMessage('Tienda abierta');
    } else if (data.newPhase === 'ended') {
      showMessage('Partida terminada!');
    }
  });

  socket.on('simulation_complete', (data: { eventLog: SimEvent[]; roundResult: RoundResult }) => {
    console.log('Simulation complete, starting playback');
    startPlayback(data.eventLog, data.roundResult);
  });

  socket.on('player_disconnected', (data: { playerId: string; countdown: number }) => {
    showMessage(`Jugador desconectado. Reconectando en ${data.countdown}s...`);
  });

  socket.on('match_ended', (data: { wins: Record<string, number> }) => {
    console.log('Match ended:', data.wins);
    showMessage('Partida finalizada!');
  });

  socket.on('disconnect', () => {
    console.log('Disconnected from server');
    showMessage('Desconectado del servidor');
  });

  return socket;
}

function showRoomCode(code: string) {
  const ui = document.getElementById('ui')!;
  ui.innerHTML = `
    <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center;">
      <h1 style="font-family: Georgia, serif; font-size: 48px; margin-bottom: 20px;">Agentic Fight</h1>
      <p style="font-size: 24px; margin-bottom: 10px;">Room Code</p>
      <div style="font-size: 96px; font-weight: bold; letter-spacing: 16px; background: #2c1810; padding: 20px 40px; border: 4px solid #f0e6d2; border-radius: 8px;">
        ${code}
      </div>
      <p style="font-size: 18px; margin-top: 20px; opacity: 0.7;">Waiting for players to join...</p>
    </div>
  `;
}

function showMessage(text: string) {
  const ui = document.getElementById('ui')!;
  const msg = document.createElement('div');
  msg.style.cssText = `
    position: absolute;
    top: 20%;
    left: 50%;
    transform: translateX(-50%);
    font-family: Georgia, serif;
    font-size: 36px;
    color: #f0e6d2;
    background: rgba(0,0,0,0.7);
    padding: 20px 40px;
    border-radius: 8px;
    pointer-events: none;
    animation: fadeOut 2s forwards;
  `;
  msg.textContent = text;
  ui.appendChild(msg);

  if (!document.getElementById('anim-styles')) {
    const style = document.createElement('style');
    style.id = 'anim-styles';
    style.textContent = `
      @keyframes fadeOut {
        0% { opacity: 1; }
        70% { opacity: 1; }
        100% { opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }

  setTimeout(() => msg.remove(), 2000);
}

function startPlayback(eventLog: SimEvent[], _roundResult: RoundResult) {
  if (!renderer) return;

  const ui = document.getElementById('ui')!;
  ui.innerHTML = '';

  const agentIds = new Set<string>();
  for (const ev of eventLog) {
    agentIds.add(ev.agentId);
  }

  const agentConfigs: { id: string; name: string; description: string; position: Vec2; hp: number; maxHp: number }[] = [];

  for (const id of agentIds) {
    let position: Vec2 = { x: ARENA.width * 0.25, y: ARENA.height * 0.5 };
    let hp = 200;
    let maxHp = 200;
    const playerInfo = roomPlayers[id];
    let name = playerInfo?.name || id;
    let description = playerInfo?.characterDescription || 'a fighter';

    for (const ev of eventLog) {
      if (ev.agentId === id && ev.type === 'move') {
        const pos = ev.payload.newPosition as Vec2 | undefined;
        if (pos && pos.x !== undefined && pos.y !== undefined) {
          position = pos;
        }
        const evHp = ev.payload.hp as number | undefined;
        const evMaxHp = ev.payload.maxHp as number | undefined;
        if (evHp !== undefined) hp = evHp;
        if (evMaxHp !== undefined) maxHp = evMaxHp;
        break; // tick 0 move event has initial state
      }
    }

    agentConfigs.push({ id, name, description, position, hp, maxHp });
  }

  renderer.setAgents(agentConfigs);
  const maxTick = eventLog.length > 0 ? Math.max(...eventLog.map((e) => e.tick)) : 600;
  renderer.setMaxTicks(maxTick);
  renderer.setTick(0);
  renderer.setSnapToEvent(true);

  if (playback) {
    playback.stop();
  }

  playback = new PlaybackController(
    eventLog,
    (tick, events) => {
      renderer.setTick(tick);
      renderer.handleEvents(events);
    },
    () => {
      console.log('Playback complete');
      renderer.setSnapToEvent(false);
      if (currentRoomId) {
        socket.emit('playback_complete', { roomId: currentRoomId });
      }
    },
    1.5
  );

  playback.start();
}

export function initRenderer(canvas: HTMLCanvasElement) {
  renderer = new Renderer(canvas);
  renderer.start();
}

export function getRenderer(): Renderer | null {
  return renderer;
}
