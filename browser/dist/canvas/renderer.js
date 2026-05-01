import { ARENA } from '@shared/index';
import { renderSprite, getSpriteForCharacter } from './sprites';
import { AudioManager } from '../game/audio';
export class Renderer {
    canvas;
    ctx;
    width = 0;
    height = 0;
    groundY = 0;
    scale = 4;
    agents = new Map();
    tick = 0;
    maxTicks = 0;
    audio = new AudioManager();
    showHUD = true;
    snapToEvent = false;
    skyGradient = null;
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.resize(canvas.width, canvas.height);
    }
    resize(width, height) {
        this.width = width;
        this.height = height;
        this.groundY = Math.floor(height * 0.75);
        this.skyGradient = this.ctx.createLinearGradient(0, 0, 0, this.groundY);
        this.skyGradient.addColorStop(0, '#1a0f0a');
        this.skyGradient.addColorStop(0.5, '#2c1810');
        this.skyGradient.addColorStop(1, '#3e2723');
    }
    setAgents(agentConfigs) {
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
                flashTime: 0,
                popupText: null,
                popupTimer: 0,
            });
        }
    }
    setMaxTicks(max) {
        this.maxTicks = max;
    }
    setTick(tick) {
        this.tick = tick;
    }
    setSnapToEvent(snap) {
        this.snapToEvent = snap;
    }
    handleEvents(events) {
        for (const ev of events) {
            const agent = this.agents.get(ev.agentId);
            switch (ev.type) {
                case 'move': {
                    if (agent) {
                        const newPos = ev.payload.newPosition;
                        if (newPos) {
                            agent.targetPosition = { ...newPos };
                        }
                        const other = this.getOtherAgent(agent.id);
                        if (other) {
                            agent.flipH = agent.targetPosition.x > other.targetPosition.x;
                        }
                        this.audio.playMove();
                    }
                    break;
                }
                case 'attack': {
                    const attacker = this.agents.get(ev.agentId);
                    if (attacker) {
                        const move = ev.payload.move;
                        attacker.popupText = move === 'basic_attack' ? 'Ataque!' : move;
                        attacker.popupTimer = 30;
                        this.audio.playAttack();
                    }
                    break;
                }
                case 'hit': {
                    if (agent) {
                        agent.hp = ev.payload.hpRemaining ?? agent.hp;
                        agent.flashTime = 10;
                        this.audio.playHit();
                    }
                    break;
                }
                case 'special': {
                    if (agent) {
                        const move = ev.payload.move;
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
    getOtherAgent(id) {
        for (const [key, agent] of this.agents) {
            if (key !== id)
                return agent;
        }
        return undefined;
    }
    arenaToScreen(arenaPos) {
        const arenaPaddingX = this.width * 0.1;
        const arenaPaddingY = this.height * 0.1;
        const arenaScreenWidth = this.width * 0.8;
        const arenaScreenHeight = (this.groundY - arenaPaddingY);
        return {
            x: arenaPaddingX + (arenaPos.x / ARENA.width) * arenaScreenWidth,
            y: arenaPaddingY + (arenaPos.y / ARENA.height) * arenaScreenHeight,
        };
    }
    update() {
        for (const agent of this.agents.values()) {
            const dx = agent.targetPosition.x - agent.position.x;
            const dy = agent.targetPosition.y - agent.position.y;
            if (this.snapToEvent) {
                agent.position = { ...agent.targetPosition };
            }
            else {
                if (Math.abs(dx) > 0.5) {
                    agent.position.x += dx * 0.3;
                }
                else {
                    agent.position.x = agent.targetPosition.x;
                }
                if (Math.abs(dy) > 0.5) {
                    agent.position.y += dy * 0.3;
                }
                else {
                    agent.position.y = agent.targetPosition.y;
                }
            }
            if (agent.flashTime > 0)
                agent.flashTime--;
            if (agent.popupTimer > 0)
                agent.popupTimer--;
            if (agent.popupTimer <= 0)
                agent.popupText = null;
        }
    }
    render() {
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.renderBackground();
        this.renderGround();
        const sortedAgents = Array.from(this.agents.values()).sort((a, b) => a.position.y - b.position.y);
        for (const agent of sortedAgents) {
            this.renderAgent(agent);
        }
        if (this.showHUD) {
            this.renderHUD();
        }
    }
    renderBackground() {
        if (this.skyGradient) {
            this.ctx.fillStyle = this.skyGradient;
            this.ctx.fillRect(0, 0, this.width, this.groundY);
        }
        this.ctx.fillStyle = '#0d0705';
        this.renderCastle(this.width * 0.15, this.groundY - 80, 0.6);
        this.renderCastle(this.width * 0.7, this.groundY - 60, 0.4);
        this.ctx.fillStyle = '#f0e6d2';
        for (let i = 0; i < 20; i++) {
            const x = ((i * 137) % this.width);
            const y = ((i * 53) % (this.groundY * 0.5));
            this.ctx.globalAlpha = 0.3 + (Math.sin(Date.now() * 0.001 + i) * 0.2);
            this.ctx.fillRect(x, y, 2, 2);
        }
        this.ctx.globalAlpha = 1;
    }
    renderCastle(x, y, scale) {
        const w = 120 * scale;
        const h = 80 * scale;
        const towerW = 20 * scale;
        const towerH = 40 * scale;
        this.ctx.fillRect(x, y - h + towerH, w, h - towerH);
        this.ctx.fillRect(x - towerW * 0.3, y - h - towerH * 0.3, towerW, towerH);
        this.ctx.fillRect(x + w - towerW * 0.7, y - h - towerH * 0.3, towerW, towerH);
        this.ctx.fillRect(x + w * 0.4, y - h - towerH * 0.5, towerW, towerH * 1.2);
        const battlementSize = 8 * scale;
        for (let i = 0; i < 5; i++) {
            this.ctx.fillRect(x + i * battlementSize * 2, y - h + towerH - battlementSize, battlementSize, battlementSize);
        }
    }
    renderGround() {
        this.ctx.fillStyle = '#3e2723';
        this.ctx.fillRect(0, this.groundY, this.width, this.height - this.groundY);
        this.ctx.strokeStyle = '#4e342e';
        this.ctx.lineWidth = 2;
        for (let i = 0; i < 10; i++) {
            const y = this.groundY + (i * (this.height - this.groundY) / 10);
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.width, y);
            this.ctx.stroke();
        }
        this.ctx.fillStyle = '#5d4037';
        for (let i = 0; i <= 10; i++) {
            const x = this.arenaToScreen({ x: (ARENA.width / 10) * i, y: 0 }).x;
            this.ctx.fillRect(x - 2, this.groundY - 5, 4, 10);
        }
    }
    renderAgent(agent) {
        const screenPos = this.arenaToScreen(agent.position);
        const screenX = screenPos.x;
        const screenY = screenPos.y;
        const spriteHeight = agent.sprite.height * this.scale;
        const spriteWidth = agent.sprite.width * this.scale;
        const drawX = screenX - spriteWidth / 2;
        const drawY = this.groundY - spriteHeight - (screenY - this.groundY * 0.1) * 0.3;
        this.ctx.fillStyle = 'rgba(0,0,0,0.3)';
        this.ctx.beginPath();
        this.ctx.ellipse(screenX, this.groundY - (screenY - this.groundY * 0.1) * 0.15, spriteWidth * 0.4, 6, 0, 0, Math.PI * 2);
        this.ctx.fill();
        if (agent.flashTime > 0) {
            this.ctx.save();
            this.ctx.globalAlpha = agent.flashTime / 10;
            this.ctx.fillStyle = '#ff0000';
            this.ctx.fillRect(drawX - 5, drawY - 5, spriteWidth + 10, spriteHeight + 10);
            this.ctx.restore();
        }
        renderSprite(this.ctx, agent.sprite, drawX, drawY, this.scale, agent.flipH);
        this.ctx.fillStyle = '#f0e6d2';
        this.ctx.font = 'bold 14px Georgia, serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(agent.name, screenX, drawY - 10);
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
    renderHUD() {
        const agents = Array.from(this.agents.values());
        if (agents.length < 2)
            return;
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
    renderHPBar(agent, x, y, align) {
        const barWidth = 200;
        const barHeight = 20;
        const hpRatio = agent.maxHp > 0 ? agent.hp / agent.maxHp : 0;
        const barX = align === 'left' ? x : x - barWidth;
        this.ctx.fillStyle = '#2c1810';
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
//# sourceMappingURL=renderer.js.map