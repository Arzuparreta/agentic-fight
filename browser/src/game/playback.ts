import { SimEvent } from '@shared/index';

export interface PlaybackState {
  isPlaying: boolean;
  currentTick: number;
  totalTicks: number;
  eventsByTick: Map<number, SimEvent[]>;
  speed: number; // playback speed multiplier
}

export type PlaybackCallback = (tick: number, events: SimEvent[]) => void;
export type PlaybackCompleteCallback = () => void;

export class PlaybackController {
  private state: PlaybackState;
  private animationId: number | null = null;
  private lastFrameTime = 0;
  private accumulatedTime = 0;
  private onTick: PlaybackCallback;
  private onComplete: PlaybackCompleteCallback;

  // Base: 20 ticks/second game time, we want playback at 60fps visually
  // So each game tick is displayed for (1000ms / 20) / speed
  private readonly MS_PER_TICK = 50; // 1000 / 20 tick rate

  constructor(
    eventLog: SimEvent[],
    onTick: PlaybackCallback,
    onComplete: PlaybackCompleteCallback,
    speed = 1.0
  ) {
    const eventsByTick = new Map<number, SimEvent[]>();
    let maxTick = 0;

    for (const ev of eventLog) {
      const list = eventsByTick.get(ev.tick) || [];
      list.push(ev);
      eventsByTick.set(ev.tick, list);
      if (ev.tick > maxTick) maxTick = ev.tick;
    }

    this.state = {
      isPlaying: false,
      currentTick: 0,
      totalTicks: maxTick,
      eventsByTick,
      speed,
    };

    this.onTick = onTick;
    this.onComplete = onComplete;
  }

  start() {
    if (this.state.isPlaying) return;
    this.state.isPlaying = true;
    this.lastFrameTime = performance.now();
    this.accumulatedTime = 0;
    this.loop(this.lastFrameTime);
  }

  pause() {
    this.state.isPlaying = false;
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  resume() {
    if (!this.state.isPlaying && this.state.currentTick < this.state.totalTicks) {
      this.start();
    }
  }

  stop() {
    this.pause();
    this.state.currentTick = 0;
    this.accumulatedTime = 0;
  }

  setSpeed(speed: number) {
    this.state.speed = speed;
  }

  private loop = (timestamp: number) => {
    if (!this.state.isPlaying) return;

    const deltaTime = timestamp - this.lastFrameTime;
    this.lastFrameTime = timestamp;

    this.accumulatedTime += deltaTime * this.state.speed;

    while (this.accumulatedTime >= this.MS_PER_TICK) {
      this.accumulatedTime -= this.MS_PER_TICK;
      this.advanceTick();
    }

    if (this.state.isPlaying) {
      this.animationId = requestAnimationFrame(this.loop);
    }
  };

  private advanceTick() {
    const events = this.state.eventsByTick.get(this.state.currentTick) || [];
    this.onTick(this.state.currentTick, events);

    this.state.currentTick++;

    if (this.state.currentTick > this.state.totalTicks) {
      this.pause();
      this.onComplete();
    }
  }

  getState(): PlaybackState {
    return { ...this.state };
  }
}
