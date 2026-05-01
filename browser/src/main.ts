import { connectToServer, initRenderer } from './network';

console.log('Agentic Fight — Browser Display initializing...');

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  initRenderer(canvas);
}

window.addEventListener('resize', resize);
resize();

connectToServer();

console.log('Browser display ready.');
