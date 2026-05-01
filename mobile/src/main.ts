import { connectToServer, getSocket } from './network';
import { renderPairingScreen } from './screens/pairing';

console.log('Agentic Fight — Mobile Coach initializing...');

const app = document.getElementById('app')!;
renderPairingScreen(app);

const socket = connectToServer();
(window as any).__socket = socket;

console.log('Mobile coach ready.');
