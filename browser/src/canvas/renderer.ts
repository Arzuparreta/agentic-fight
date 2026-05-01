import { SimEvent, AgentState, ARENA_WIDTH } from '@shared/index';
import { SpriteDef, renderSprite, getSpriteForCharacter } from './sprites';
import { AudioManager } from '../game/audio';

interface AgentVisual {
  id: string;
  name: string;
  sprite: SpriteDef;
  position: number; // current interpolated x
  targetPosition: number; // where we're moving to
  hp: number;
  maxHp: number;
  flipH: boolean;
  // Visual effects
  flashTime: number; // hit flash timer
  popupText: string | null;
  popupTimer: number;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private groundY = 0;
  private scale = 4; // pixel art scale

  private agents: Map<string, AgentVisual> = new Map();
  private tick = 0;
  private maxTicks = 0;
  private audio = new AudioManager();
  private showHUD = true;
  private snapToEvent = false; // during playback: snap instantly to exact positions

  // Background
  private skyGradient: CanvasGradient | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.resize(canvas.width, canvas.height);
  }

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.groundY = Math.floor(height * 0.75);

    // Create sky gradient
    this.skyGradient = this.ctx.createLinearGradient(0, 0, 0, this.groundY);
    this.skyGradient.addColorStop(0, '#1a0f0a'); // dark night sky
    this.skyGradient.addColorStop(0.5, '#2c1810'); // horizon
    this.skyGradient.addColorStop(1, '#3e2723'); // ground line
  }

  setAgents(agentConfigs: { id: string; name: string; description: string; position: number; hp: number; maxHp: number }[]) {
    this.agents.clear();
    for (const cfg of agentConfigs) {
      this.agents.set(cfg.id, {
        id: cfg.id,
        name: cfg.name,
        sprite: getSpriteForCharacter(cfg.description),
        position: cfg.position,
        targetPosition: cfg.position,
        hp: cfg.hp,
        maxHp: cfg.maxHp,
        flipH: false,
        flashTime: 0,
        popupText: null,
        popupTimer: 0,
      });
    }
  }

  setMaxTicks(max: number) {
    this.maxTicks = max;
  }

  setTick(tick: number) {
    this.tick = tick;
  }

  setSnapToEvent(snap: boolean) {
    this.snapToEvent = snap;
  }

  handleEvents(events: SimEvent[]) {
    for (const ev of events) {
      const agent = this.agents.get(ev.agentId);

      switch (ev.type) {
        case 'move': {
          if (agent) {
            const newPos = (ev.payload.newPosition as number) ?? agent.position;
            agent.targetPosition = newPos;
            // Determine facing direction
            const other = this.getOtherAgent(agent.id);
            if (other) {
              agent.flipH = agent.targetPosition > other.targetPosition;
            }
            this.audio.playMove();
          }
          break;
        }
        case 'attack': {
          const attacker = this.agents.get(ev.agentId);
          if (attacker) {
            const move = ev.payload.move as string;
            attacker.popupText = move === 'basic_attack' ? '¡Ataque!' : move;
            attacker.popupTimer = 30;
            this.audio.playAttack();
          }
          break;
        }
        case 'hit': {
          if (agent) {
            agent.hp = (ev.payload.hpRemaining as number) ?? agent.hp;
            agent.flashTime = 10;
            this.audio.playHit();
          }
          break;
        }
        case 'special': {
          if (agent) {
            const move = ev.payload.move as string;
            agent.popupText = move;
            agent.popupTimer = 40;
            this.audio.playSpecial();
          }
          break;
        }
        case 'death': {
          if (agent) {
            agent.hp = 0;
            this.audio.playDeath();
          }
          break;
        }
      }
    }
  }

  private getOtherAgent(id: string): AgentVisual | undefined {
    for (const [key, agent] of this.agents) {
      if (key !== id) return agent;
    }
    return undefined;
  }

  private arenaToScreenX(arenaX: number): number {
    const arenaPadding = this.width * 0.1;
    const arenaScreenWidth = this.width * 0.8;
    return arenaPadding + (arenaX / ARENA_WIDTH) * arenaScreenWidth;
  }

  update() {
    for (const agent of this.agents.values()) {
      const diff = agent.targetPosition - agent.position;
      if (this.snapToEvent) {
        // During playback: snap instantly to exact event positions
        agent.position = agent.targetPosition;
      } else {
        // Normal mode: smooth interpolation
        if (Math.abs(diff) > 0.5) {
          agent.position += diff * 0.3;
        } else {
          agent.position = agent.targetPosition;
        }
      }

      // Tick down effects
      if (agent.flashTime > 0) agent.flashTime--;
      if (agent.popupTimer > 0) agent.popupTimer--;
      if (agent.popupTimer <= 0) agent.popupText = null;
    }
  }

  render() {
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Background
    this.renderBackground();

    // Ground
    this.renderGround();

    // Agents (sorted by position for simple depth)
    const sortedAgents = Array.from(this.agents.values()).sort((a, b) => a.position - b.position);

    // Detect visual collision: if agents are very close, offset them horizontally
    const visualOffsets = new Map<string, number>();
    if (sortedAgents.length === 2) {
      const dist = Math.abs(sortedAgents[0].position - sortedAgents[1].position);
      const spriteScreenWidth = sortedAgents[0].sprite.width * this.scale;
      // If closer than half a sprite width, they overlap visually
      if (dist < spriteScreenWidth * 0.6) {
        visualOffsets.set(sortedAgents[0].id, -spriteScreenWidth * 0.35);
        visualOffsets.set(sortedAgents[1].id, spriteScreenWidth * 0.35);
      }
    }

    for (const agent of sortedAgents) {
      this.renderAgent(agent, visualOffsets.get(agent.id) || 0);
    }

    // HUD
    if (this.showHUD) {
      this.renderHUD();
    }
  }

  private renderBackground() {
    // Sky
    if (this.skyGradient) {
      this.ctx.fillStyle = this.skyGradient;
      this.ctx.fillRect(0, 0, this.width, this.groundY);
    }

    // Distant castle silhouette
    this.ctx.fillStyle = '#0d0705';
    this.renderCastle(this.width * 0.15, this.groundY - 80, 0.6);
    this.renderCastle(this.width * 0.7, this.groundY - 60, 0.4);

    // Stars
    this.ctx.fillStyle = '#f0e6d2';
    for (let i = 0; i < 20; i++) {
      const x = ((i * 137) % this.width);
      const y = ((i * 53) % (this.groundY * 0.5));
      this.ctx.globalAlpha = 0.3 + (Math.sin(Date.now() * 0.001 + i) * 0.2);
      this.ctx.fillRect(x, y, 2, 2);
    }
    this.ctx.globalAlpha = 1;
  }

  private renderCastle(x: number, y: number, scale: number) {
    const w = 120 * scale;
    const h = 80 * scale;
    const towerW = 20 * scale;
    const towerH = 40 * scale;

    // Main keep
    this.ctx.fillRect(x, y - h + towerH, w, h - towerH);

    // Towers
    this.ctx.fillRect(x - towerW * 0.3, y - h - towerH * 0.3, towerW, towerH);
    this.ctx.fillRect(x + w - towerW * 0.7, y - h - towerH * 0.3, towerW, towerH);
    this.ctx.fillRect(x + w * 0.4, y - h - towerH * 0.5, towerW, towerH * 1.2);

    // Battlements
    const battlementSize = 8 * scale;
    for (let i = 0; i < 5; i++) {
      this.ctx.fillRect(x + i * battlementSize * 2, y - h + towerH - battlementSize, battlementSize, battlementSize);
    }
  }

  private renderGround() {
    // Ground plane
    this.ctx.fillStyle = '#3e2723';
    this.ctx.fillRect(0, this.groundY, this.width, this.height - this.groundY);

    // Ground texture lines
    this.ctx.strokeStyle = '#4e342e';
    this.ctx.lineWidth = 2;
    for (let i = 0; i < 10; i++) {
      const y = this.groundY + (i * (this.height - this.groundY) / 10);
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.width, y);
      this.ctx.stroke();
    }

    // Arena markers
    this.ctx.fillStyle = '#5d4037';
    for (let i = 0; i <= 10; i++) {
      const x = this.arenaToScreenX((ARENA_WIDTH / 10) * i);
      this.ctx.fillRect(x - 2, this.groundY - 5, 4, 10);
    }
  }

  private renderAgent(agent: AgentVisual, visualOffsetX = 0) {
    const screenX = this.arenaToScreenX(agent.position) + visualOffsetX;
    const spriteHeight = agent.sprite.height * this.scale;
    const spriteWidth = agent.sprite.width * this.scale;
    const drawX = screenX - spriteWidth / 2;
    const drawY = this.groundY - spriteHeight;

    // Shadow
    this.ctx.fillStyle = 'rgba(0,0,0,0.3)';
    this.ctx.beginPath();
    this.ctx.ellipse(screenX, this.groundY, spriteWidth * 0.4, 6, 0, 0, Math.PI * 2);
    this.ctx.fill();

    // Hit flash
    if (agent.flashTime > 0) {
      this.ctx.save();
      this.ctx.globalAlpha = agent.flashTime / 10;
      this.ctx.fillStyle = '#ff0000';
      this.ctx.fillRect(drawX - 5, drawY - 5, spriteWidth + 10, spriteHeight + 10);
      this.ctx.restore();
    }

    // Sprite
    renderSprite(this.ctx, agent.sprite, drawX, drawY, this.scale, agent.flipH);

    // Name label
    this.ctx.fillStyle = '#f0e6d2';
    this.ctx.font = 'bold 14px Georgia, serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(agent.name, screenX, drawY - 10);

    // Popup text (attack names)
    if (agent.popupText && agent.popupTimer > 0) {
      const popupY = drawY - 25 - (30 - agent.popupTimer);
      this.ctx.save();
      this.ctx.globalAlpha = Math.min(1, agent.popupTimer / 10);
      this.ctx.fillStyle = '#f1c40f';
      this.ctx.font = 'bold 16px Georgia, serif';
      this.ctx.strokeStyle = '#000';
      this.ctx.lineWidth = 3;
      this.ctx.strokeText(agent.popupText, screenX, popupY);
      this.ctx.fillText(agent.popupText, screenX, popupY);
      this.ctx.restore();
    }
  }

  private renderHUD() {
    const agents = Array.from(this.agents.values());
    if (agents.length < 2) return;

    const [left, right] = agents[0].position < agents[1].position ? [agents[0], agents[1]] : [agents[1], agents[0]];

    // Left HP bar
    this.renderHPBar(left, 40, 30, 'left');
    // Right HP bar
    this.renderHPBar(right, this.width - 40, 30, 'right');

    // Round timer
    const timeRemaining = Math.max(0, Math.ceil((this.maxTicks - this.tick) / 20));
    this.ctx.fillStyle = '#f0e6d2';
    this.ctx.font = 'bold 24px Georgia, serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(`${timeRemaining}s`, this.width / 2, 40);

    // Tick counter
    this.ctx.font = '12px Georgia, serif';
    this.ctx.fillStyle = '#aaa';
    this.ctx.fillText(`Tick ${this.tick} / ${this.maxTicks}`, this.width / 2, 60);
  }

  private renderHPBar(agent: AgentVisual, x: number, y: number, align: 'left' | 'right') {
    const barWidth = 200;
    const barHeight = 20;
    const hpRatio = agent.maxHp > 0 ? agent.hp / agent.maxHp : 0;

    const barX = align === 'left' ? x : x - barWidth;

    // Background
    this.ctx.fillStyle = '#2c1810';
    this.ctx.fillRect(barX, y, barWidth, barHeight);

    // Border
    this.ctx.strokeStyle = '#f0e6d2';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(barX, y, barWidth, barHeight);

    // Fill
    const fillColor = hpRatio > 0.5 ? '#27ae60' : hpRatio > 0.25 ? '#f39c12' : '#c0392b';
    this.ctx.fillStyle = fillColor;
    this.ctx.fillRect(barX + 2, y + 2, (barWidth - 4) * hpRatio, barHeight - 4);

    // Text
    this.ctx.fillStyle = '#f0e6d2';
    this.ctx.font = 'bold 14px Georgia, serif';
    this.ctx.textAlign = align === 'left' ? 'left' : 'right';
    this.ctx.fillText(`${agent.hp}/${agent.maxHp}`, align === 'left' ? x + barWidth + 10 : x - barWidth - 10, y + 15);
  }

  start() {
    const loop = () => {
      this.update();
      this.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
