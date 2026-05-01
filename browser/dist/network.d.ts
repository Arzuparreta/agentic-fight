import { Socket } from 'socket.io-client';
import { Renderer } from './canvas/renderer';
export declare function connectToServer(): Socket<import("@socket.io/component-emitter").DefaultEventsMap, import("@socket.io/component-emitter").DefaultEventsMap>;
export declare function initRenderer(canvas: HTMLCanvasElement): void;
export declare function getRenderer(): Renderer | null;
//# sourceMappingURL=network.d.ts.map