import { SimEvent } from '@shared/index';
interface Vec2 {
    x: number;
    y: number;
}
export declare class Renderer {
    private canvas;
    private ctx;
    private width;
    private height;
    private scale;
    private agents;
    private tick;
    private maxTicks;
    private audio;
    private showHUD;
    private snapToEvent;
    private groundColor;
    private borderColor;
    constructor(canvas: HTMLCanvasElement);
    resize(width: number, height: number): void;
    setAgents(agentConfigs: {
        id: string;
        name: string;
        description: string;
        position: Vec2;
        hp: number;
        maxHp: number;
    }[]): void;
    setMaxTicks(max: number): void;
    setTick(tick: number): void;
    setSnapToEvent(snap: boolean): void;
    handleEvents(events: SimEvent[]): void;
    private getOtherAgent;
    private arenaToScreen;
    update(): void;
    render(): void;
    private renderBackground;
    private renderAgent;
    private renderHUD;
    private renderHPBar;
    start(): void;
}
export {};
//# sourceMappingURL=renderer.d.ts.map