import { SimEvent, ARENA } from '@shared/index';
import { SpriteDef, renderSprite, getSpriteForCharacter } from './sprites';
import { AudioManager } from '../game/audio';

interface Vec2 {
  x: number;
  y: number;
}

interface AgentVisual {
  id: string;
  name: string;
  sprite: SpriteDef;
  position: Vec2;
  targetPosition: Vec2;
  hp: number;
  maxHp: number;
  flipH: boolean;
  facingAngle: number;
  flashTime: number;
  flashColor: string;
  popupText: string | null;
  popupTimer: number;
  attackPhase: string | null;
  counterWindow: boolean;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private scale = 4;

  private agents: Map<string, AgentVisual> = new Map();
  private tick = 0;
  private maxTicks = 0;
  private audio = new AudioManager();
  private showHUD = true;
  private snapToEvent = false;

  private groundColor = '#5a4a3a';
  private borderColor = '#3e2723';

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.resize(canvas.width, canvas.height);
  }

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  setAgents(agentConfigs: { id: string; name: string; description: string; position: Vec2; hp: number; maxHp: number }[]) {
    this.agents.clear();
    for (const cfg of agentConfigs) {
      this.agents.set(cfg.id, {
        id: cfg.id,
        name: cfg.name,
        sprite: getSpriteForCharacter(cfg.description),
        position: { ...cfg.position },
        targetPosition: { ...cfg.position },
        hp: cfg.hp,
        maxHp: cfg.maxHp,
        flipH: false,
        facingAngle: cfg.position.x < ARENA.width / 2 ? 0 : Math.PI,
        flashTime: 0,
        flashColor: '#ff0000',
        popupText: null,
        popupTimer: 0,
        attackPhase: null,
        counterWindow: false,
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
        case 'move':
        case 'move_diagonal': {
          if (agent) {
            const newPos = ev.payload.newPosition as Vec2 | undefined;
            if (newPos) {
              agent.targetPosition = { ...newPos };
            }
            const facing = ev.payload.facing as number | undefined;
            if (facing !== undefined) {
              agent.facingAngle = facing;
            }
            const other = this.getOtherAgent(agent.id);
            if (other) {
              agent.flipH = agent.targetPosition.x > other.targetPosition.x;
            }
          }
          break;
        }
        case 'dodge_start': {
          if (agent) {
            const newPos = ev.payload.position as Vec2 | undefined;
            if (newPos) agent.targetPosition = { ...newPos };
            agent.flashTime = 10;
            agent.flashColor = '#00ccff';
            agent.popupText = 'Dodge!';
            agent.popupTimer = 18;
            this.audio.playMove();
          }
          break;
        }
        case 'dodge_end': {
          if (agent) {
            agent.flashTime = 0;
          }
          break;
        }
        case 'windup': {
          if (agent) {
            agent.attackPhase = 'windup';
            agent.flashTime = 6;
            agent.flashColor = '#ffffff';
            const move = ev.payload.move as string;
            agent.popupText = move === 'basic_attack' ? 'Ataque!' : move;
            agent.popupTimer = 20;
          }
          break;
        }
        case 'attack_active': {
          if (agent) {
            agent.attackPhase = 'active';
            agent.flashTime = 4;
            agent.flashColor = '#ffaa00';
            this.audio.playAttack();
          }
          break;
        }
        case 'attack': {
          // Hit confirmed
          break;
        }
        case 'recovery':
        case 'whiff': {
          if (agent) {
            agent.attackPhase = ev.type;
            agent.flashTime = 5;
            agent.flashColor = ev.type === 'whiff' ? '#ff4444' : '#ff8800';
            if (ev.type === 'whiff') {
              agent.popupText = 'Whiff!';
              agent.popupTimer = 15;
            }
          }
          break;
        }
        case 'counter_window': {
          const target = this.agents.get(ev.agentId);
          if (target) {
            target.counterWindow = true;
            target.flashTime = 8;
            target.flashColor = '#00ff66';
          }
          break;
        }
        case 'hit': {
          if (agent) {
            const dodged = ev.payload.dodged as boolean | undefined;
            if (dodged) {
              agent.popupText = 'Dodged!';
              agent.popupTimer = 20;
              agent.flashTime = 6;
              agent.flashColor = '#00ccff';
            } else {
              agent.hp = (ev.payload.hpRemaining as number) ?? agent.hp;
              agent.flashTime = 10;
              agent.flashColor = '#ff0000';
              this.audio.playHit();
            }
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
            agent.attackPhase = null;
            this.audio.playDeath();
          }
          break;
        }
        case 'idle':
          if (agent) {
            agent.attackPhase = null;
            agent.counterWindow = false;
          }
          break;
      }
    }
  }

  private getOtherAgent(id: string): AgentVisual | undefined {
    for (const [key, agent] of this.agents) {
      if (key !== id) return agent;
    }
    return undefined;
  }

  private arenaToScreen(arenaPos: Vec2): Vec2 {
    const padding = 40;
    const availWidth = this.width - padding * 2;
    const availHeight = this.height - padding * 2;

    return {
      x: padding + (arenaPos.x / ARENA.width) * availWidth,
      y: padding + (arenaPos.y / ARENA.height) * availHeight,
    };
  }

  update() {
    for (const agent of this.agents.values()) {
      const dx = agent.targetPosition.x - agent.position.x;
      const dy = agent.targetPosition.y - agent.position.y;

      // Smooth lerp for all movement (physics-based, so positions change every tick)
      const lerp = 0.45;

      if (this.snapToEvent) {
        agent.position = { ...agent.targetPosition };
      } else {
        if (Math.abs(dx) > 0.3) {
          agent.position.x += dx * lerp;
        } else {
          agent.position.x = agent.targetPosition.x;
        }
        if (Math.abs(dy) > 0.3) {
          agent.position.y += dy * lerp;
        } else {
          agent.position.y = agent.targetPosition.y;
        }
      }

      if (agent.flashTime > 0) agent.flashTime--;
      if (agent.popupTimer > 0) agent.popupTimer--;
      if (agent.popupTimer <= 0) agent.popupText = null;
      if (agent.counterWindow && agent.flashTime <= 0) agent.counterWindow = false;
    }
  }

  render() {
    this.ctx.clearRect(0, 0, this.width, this.height);

    this.renderBackground();

    const sortedAgents = Array.from(this.agents.values()).sort((a, b) => a.position.y - b.position.y);

    for (const agent of sortedAgents) {
      this.renderAgent(agent);
    }

    if (this.showHUD) {
      this.renderHUD();
    }
  }

  private renderBackground() {
    this.ctx.fillStyle = '#2c1810';
    this.ctx.fillRect(0, 0, this.width, this.height);

    const padding = 40;
    const arenaX = padding;
    const arenaY = padding;
    const arenaW = this.width - padding * 2;
    const arenaH = this.height - padding * 2;

    this.ctx.fillStyle = this.groundColor;
    this.ctx.fillRect(arenaX, arenaY, arenaW, arenaH);

    this.ctx.strokeStyle = this.borderColor;
    this.ctx.lineWidth = 3;
    this.ctx.strokeRect(arenaX, arenaY, arenaW, arenaH);

    this.ctx.strokeStyle = '#4e342e';
    this.ctx.lineWidth = 1;
    this.ctx.globalAlpha = 0.3;
    const gridSize = 50;
    for (let x = arenaX; x <= arenaX + arenaW; x += (gridSize / ARENA.width) * arenaW) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, arenaY);
      this.ctx.lineTo(x, arenaY + arenaH);
      this.ctx.stroke();
    }
    for (let y = arenaY; y <= arenaY + arenaH; y += (gridSize / ARENA.height) * arenaH) {
      this.ctx.beginPath();
      this.ctx.moveTo(arenaX, y);
      this.ctx.lineTo(arenaX + arenaW, y);
      this.ctx.stroke();
    }
    this.ctx.globalAlpha = 1;
  }

  private renderAgent(agent: AgentVisual) {
    const screenPos = this.arenaToScreen(agent.position);
    const screenX = screenPos.x;
    const screenY = screenPos.y;

    const spriteHeight = agent.sprite.height * this.scale;
    const spriteWidth = agent.sprite.width * this.scale;
    const drawX = screenX - spriteWidth / 2;
    const drawY = screenY - spriteHeight / 2;

    this.ctx.fillStyle = 'rgba(0,0,0,0.3)';
    this.ctx.beginPath();
    this.ctx.ellipse(screenX, screenY + spriteHeight * 0.4, spriteWidth * 0.35, 5, 0, 0, Math.PI * 2);
    this.ctx.fill();

    // Attack phase ring
    if (agent.attackPhase) {
      this.ctx.save();
      this.ctx.globalAlpha = 0.4;
      this.ctx.strokeStyle =
        agent.attackPhase === 'windup' ? '#ffffff' :
        agent.attackPhase === 'active' ? '#ffaa00' :
        agent.attackPhase === 'whiff' ? '#ff4444' : '#ff8800';
      this.ctx.lineWidth = 3;
      this.ctx.beginPath();
      this.ctx.arc(screenX, screenY, spriteWidth * 0.55, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.restore();
    }

    // Counter window glow
    if (agent.counterWindow) {
      this.ctx.save();
      this.ctx.globalAlpha = 0.25;
      this.ctx.fillStyle = '#00ff66';
      this.ctx.beginPath();
      this.ctx.arc(screenX, screenY, spriteWidth * 0.7, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    }

    if (agent.flashTime > 0) {
      this.ctx.save();
      this.ctx.globalAlpha = agent.flashTime / 10;
      this.ctx.fillStyle = agent.flashColor;
      this.ctx.fillRect(drawX - 5, drawY - 5, spriteWidth + 10, spriteHeight + 10);
      this.ctx.restore();
    }

    renderSprite(this.ctx, agent.sprite, drawX, drawY, this.scale, agent.flipH);

    this.ctx.fillStyle = '#f0e6d2';
    this.ctx.font = 'bold 14px Georgia, serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(agent.name, screenX, drawY - 8);

    if (agent.popupText && agent.popupTimer > 0) {
      const popupY = drawY - 20 - (30 - agent.popupTimer);
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

    const [left, right] = agents[0].position.x < agents[1].position.x ? [agents[0], agents[1]] : [agents[1], agents[0]];

    this.renderHPBar(left, 40, 30, 'left');
    this.renderHPBar(right, this.width - 40, 30, 'right');

    const timeRemaining = Math.max(0, Math.ceil((this.maxTicks - this.tick) / 20));
    this.ctx.fillStyle = '#f0e6d2';
    this.ctx.font = 'bold 24px Georgia, serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(`${timeRemaining}s`, this.width / 2, 40);

    this.ctx.font = '12px Georgia, serif';
    this.ctx.fillStyle = '#aaa';
    this.ctx.fillText(`Tick ${this.tick} / ${this.maxTicks}`, this.width / 2, 60);
  }

  private renderHPBar(agent: AgentVisual, x: number, y: number, align: 'left' | 'right') {
    const barWidth = 200;
    const barHeight = 20;
    const hpRatio = agent.maxHp > 0 ? agent.hp / agent.maxHp : 0;

    const barX = align === 'left' ? x : x - barWidth;

    this.ctx.fillStyle = '#1a0f0a';
    this.ctx.fillRect(barX, y, barWidth, barHeight);

    this.ctx.strokeStyle = '#f0e6d2';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(barX, y, barWidth, barHeight);

    const fillColor = hpRatio > 0.5 ? '#27ae60' : hpRatio > 0.25 ? '#f39c12' : '#c0392b';
    this.ctx.fillStyle = fillColor;
    this.ctx.fillRect(barX + 2, y + 2, (barWidth - 4) * hpRatio, barHeight - 4);

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
