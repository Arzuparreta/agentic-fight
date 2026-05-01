import { io } from 'socket.io-client';
import { renderCoachingScreen, updateCoachingMessages } from './screens/coaching';
import { renderShopScreen } from './screens/shop';
import { renderWatchingScreen } from './screens/watching';
let socket;
let currentRoomId = '';
let currentPlayerId = '';
let currentPhase = '';
const SERVER_URL = window.location.origin;
export function connectToServer() {
    socket = io(SERVER_URL);
    socket.on('connect', () => {
        console.log('[Mobile] Connected to server');
    });
    socket.on('joined_room', (data) => {
        currentRoomId = data.roomId;
        currentPlayerId = data.playerId;
        console.log(`[Mobile] Joined room ${data.roomId} as ${data.playerId}`);
    });
    socket.on('reconnected', (data) => {
        currentRoomId = data.roomId;
        currentPlayerId = data.playerId;
        console.log(`[Mobile] Reconnected to room ${data.roomId}`);
    });
    socket.on('room_state', (room) => {
        console.log(`[Mobile] room_state received: phase=${room.phase}, players=${Object.keys(room.players || {}).join(',')}`);
        handlePhaseChange(room.phase, room);
    });
    socket.on('agent_coaching_message', (data) => {
        console.log(`[Mobile] agent_coaching_message received: playerId=${data.playerId} content="${data.content?.slice(0, 40)}..." (currentPlayerId=${currentPlayerId})`);
        if (data.playerId === currentPlayerId) {
            window.dispatchEvent(new CustomEvent('agent-coaching-message', { detail: { content: data.content, timestamp: data.timestamp } }));
        }
    });
    socket.on('phase_change', (data) => {
        console.log(`[Mobile] phase_change received: ${data.newPhase}`);
        handlePhaseChange(data.newPhase);
    });
    socket.on('coaching_echo', (data) => {
        window.dispatchEvent(new CustomEvent('coaching-echo', { detail: data }));
    });
    socket.on('economy_update', (data) => {
        window.dispatchEvent(new CustomEvent('economy-update', { detail: data }));
    });
    socket.on('purchase_result', (result) => {
        window.dispatchEvent(new CustomEvent('purchase-result', { detail: result }));
    });
    socket.on('error', (data) => {
        console.error('[Mobile] Socket error:', data.message);
        alert(`Error: ${data.message}`);
    });
    socket.on('disconnect', () => {
        console.log('[Mobile] Disconnected');
        const app = document.getElementById('app');
        app.innerHTML = '<p style="text-align:center;padding:40px;">Disconnected. Refresh to reconnect.</p>';
    });
    return socket;
}
function handlePhaseChange(phase, room) {
    const app = document.getElementById('app');
    if (phase === 'coaching' && currentPhase === 'coaching') {
        if (room?.players?.[currentPlayerId]?.coachingMessages) {
            const messages = room.players[currentPlayerId].coachingMessages.map(m => ({
                sender: m.sender,
                content: m.content,
            }));
            console.log(`[Mobile] Updating coaching messages from room_state: ${messages.length} messages`);
            updateCoachingMessages(messages);
        }
        return;
    }
    if (phase === currentPhase) {
        return;
    }
    currentPhase = phase;
    switch (phase) {
        case 'lobby':
            app.innerHTML = '<p style="text-align:center;padding:40px;">Waiting for opponent...</p>';
            break;
        case 'coaching': {
            const playerData = room?.players?.[currentPlayerId];
            const existingMessages = playerData?.coachingMessages?.map(m => ({
                sender: m.sender,
                content: m.content,
            })) || [];
            console.log(`[Mobile] Rendering coaching screen with ${existingMessages.length} existing messages`);
            renderCoachingScreen(app, currentRoomId, currentPlayerId, socket, existingMessages);
            break;
        }
        case 'simulating':
            renderWatchingScreen(app, 'Simulating battle...');
            break;
        case 'playback':
            renderWatchingScreen(app, 'Fight in progress! Watch the main screen.');
            break;
        case 'shop':
            renderShopScreen(app, currentRoomId, currentPlayerId, socket);
            break;
        case 'ended':
            app.innerHTML = '<p style="text-align:center;padding:40px;">Match ended!</p>';
            break;
    }
}
export function getSocket() {
    return socket;
}
export function getRoomId() {
    return currentRoomId;
}
export function getPlayerId() {
    return currentPlayerId;
}
//# sourceMappingURL=network.js.map