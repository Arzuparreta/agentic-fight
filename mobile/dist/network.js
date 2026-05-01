import { io } from 'socket.io-client';
import { renderCoachingScreen } from './screens/coaching';
import { renderShopScreen } from './screens/shop';
import { renderWatchingScreen } from './screens/watching';
let socket;
let currentRoomId = '';
let currentPlayerId = '';
let currentPhase = '';
// Auto-detect server URL from current location
const SERVER_URL = window.location.origin;
export function connectToServer() {
    socket = io(SERVER_URL);
    socket.on('connect', () => {
        console.log('Mobile coach connected');
    });
    socket.on('joined_room', (data) => {
        currentRoomId = data.roomId;
        currentPlayerId = data.playerId;
        console.log(`Joined room ${data.roomId} as ${data.playerId}`);
    });
    socket.on('reconnected', (data) => {
        currentRoomId = data.roomId;
        currentPlayerId = data.playerId;
        console.log(`Reconnected to room ${data.roomId}`);
    });
    socket.on('room_state', (room) => {
        handlePhaseChange(room.phase, room);
    });
    socket.on('phase_change', (data) => {
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
        alert(`Error: ${data.message}`);
    });
    socket.on('disconnect', () => {
        console.log('Disconnected');
        const app = document.getElementById('app');
        app.innerHTML = '<p style="text-align:center;padding:40px;">Disconnected. Refresh to reconnect.</p>';
    });
    return socket;
}
function handlePhaseChange(phase, room) {
    const app = document.getElementById('app');
    // Only re-render the entire screen if the phase actually changed
    if (phase === currentPhase) {
        // Phase hasn't changed — do not destroy the current screen
        return;
    }
    currentPhase = phase;
    switch (phase) {
        case 'lobby':
            app.innerHTML = '<p style="text-align:center;padding:40px;">Waiting for opponent...</p>';
            break;
        case 'coaching':
            renderCoachingScreen(app, currentRoomId, currentPlayerId, socket);
            break;
        case 'simulating':
            renderWatchingScreen(app, 'Simulating battle...');
            break;
        case 'playback':
            renderWatchingScreen(app, '¡Fight in progress! Watch the main screen.');
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