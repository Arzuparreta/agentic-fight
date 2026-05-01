import { connectToServer, initRenderer, getRenderer } from './network';
console.log('Agentic Fight — Browser Display initializing...');
const canvas = document.getElementById('game-canvas');
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const renderer = getRenderer();
    if (renderer) {
        renderer.resize(canvas.width, canvas.height);
    }
    else {
        initRenderer(canvas);
    }
}
window.addEventListener('resize', resize);
resize();
connectToServer();
console.log('Browser display ready.');
//# sourceMappingURL=main.js.map