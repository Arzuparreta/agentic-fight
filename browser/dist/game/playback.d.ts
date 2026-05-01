import { SimEvent } from '@shared/index';
export interface PlaybackState {
    isPlaying: boolean;
    currentTick: number;
    totalTicks: number;
    eventsByTick: Map<number, SimEvent[]>;
    speed: number;
}
export type PlaybackCallback = (tick: number, events: SimEvent[]) => void;
export type PlaybackCompleteCallback = () => void;
export declare class PlaybackController {
    private state;
    private animationId;
    private lastFrameTime;
    private accumulatedTime;
    private onTick;
    private onComplete;
    private readonly MS_PER_TICK;
    constructor(eventLog: SimEvent[], onTick: PlaybackCallback, onComplete: PlaybackCompleteCallback, speed?: number);
    start(): void;
    pause(): void;
    resume(): void;
    stop(): void;
    setSpeed(speed: number): void;
    private loop;
    private advanceTick;
    getState(): PlaybackState;
}
//# sourceMappingURL=playback.d.ts.map