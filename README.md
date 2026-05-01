# Agentic Fight — Local Setup Guide

A multiplayer browser-based game where players coach AI agents via mobile chat to fight in a 2D side-view arena.

**Theme:** Reyes Católicos Spain (late 15th century)

---

## Prerequisites

- **Node.js** v18+ and **npm**
- **Ollama** running locally with at least one model (we recommend `gemma4:latest`)
- A **local WiFi network** where your computer and phones can communicate
- **2 mobile phones** (or 1 phone + 1 laptop for testing)

---

## Quick Start

### 1. Install Dependencies

```bash
cd /mnt/storage/Git-projects-storage/agentic-fight
npm install
```

### 2. Configure Ollama

Make sure Ollama is running:

```bash
ollama list
```

If you don't have `gemma4:latest`, pull it:

```bash
ollama pull gemma4:latest
```

Create a `.env` file:

```bash
cp .env.example .env
```

Edit `.env` if your Ollama runs on a different URL or you want a different model.

### 3. Start the Server

```bash
npm run start
```

You should see output like:

```
╔════════════════════════════════════════════════════════════╗
║              AGENTIC FIGHT — Server Running                ║
╠════════════════════════════════════════════════════════════╣
║  Local:     http://localhost:3000/browser                   ║
║  Network:   http://192.168.1.138:3000/browser              ║
╠════════════════════════════════════════════════════════════╣
║  Mobile:    http://192.168.1.138:3000/mobile               ║
║            (Open this on your phone browser)               ║
╚════════════════════════════════════════════════════════════╝
```

**The `Network:` URL is what your phones will use.**

### 4. Open the Browser Display

On your **main screen** (laptop connected to a TV, or a second monitor):

```
http://192.168.1.138:3000/browser
```

You will see a **4-letter room code** (e.g., `WJZK`). This is your pairing code.

### 5. Players Join from Their Phones

Each player opens their phone browser and goes to:

```
http://192.168.1.138:3000/mobile
```

Then they:
1. Enter the **room code** shown on the browser display
2. Choose an **agent name** (e.g., "Don Rodrigo")
3. Select a **character type** (Knight, Moor, Friar, Conquistador)
4. Tap **Join Battle**

### 6. Play the Game

Once both players have joined, the game flows automatically:

```
Coaching Phase  →  Both players hit READY  →  Simulation runs (~20s)
       ↓
Playback Phase  →  Watch the fight on the main screen
       ↓
Shop Phase      →  Buy items with earned gold
       ↓
Coaching Phase  →  Repeat for next round
```

**First to 3 wins** ends the match.

---

## Development Mode

If you want to work on the code, use the dev servers with hot-reload:

**Terminal 1 — Server:**
```bash
npm run dev:server
```

**Terminal 2 — Browser Display:**
```bash
npm run dev:browser
```
Opens at `http://localhost:5173`

**Terminal 3 — Mobile Interface:**
```bash
npm run dev:mobile
```
Opens at `http://localhost:5174`

> ⚠️ In dev mode, the browser and mobile clients still try to connect to `http://localhost:3000` for the WebSocket server. For LAN testing, use the production build (`npm run start`) instead.

---

## Troubleshooting

### "Cannot connect to server" on phone

1. Make sure your phone is on the **same WiFi network** as your computer
2. Check that the server is bound to `0.0.0.0` (default)
3. Try accessing `http://YOUR_COMPUTER_IP:3000/health` from your phone browser
4. If that works but the game doesn't, check that port 3000 is not blocked by a firewall

### Ollama is slow or returns 404

1. Verify Ollama is running: `curl http://localhost:11434/api/tags`
2. Check that the model is loaded: `ollama list`
3. The first call may be slow while the model loads into VRAM
4. If you have < 8GB VRAM, use a smaller model like `gemma4:4b`

### Game feels too slow / too fast

Edit `shared/constants.ts` and adjust:
- `MOVEMENT_SPEED` — how fast agents move
- `BASIC_ATTACK_DAMAGE` — how much damage basic attack deals
- `MAX_TICKS_PER_ROUND` — how long rounds last

Then rebuild: `npm run build`

---

## Project Structure

```
agentic-fight/
├── server/          # Node.js + TypeScript + Socket.io
│   ├── src/game/    # Engine, economy, shop, actions
│   ├── src/llm/     # Ollama client + playstyle memory
│   ├── src/rooms/   # Room lifecycle manager
│   └── src/websocket/  # Socket.io handlers
├── browser/         # Main display (Vanilla TS + Canvas)
│   ├── src/canvas/  # Renderer + pixel art sprites
│   └── src/game/    # Playback controller + audio
├── mobile/          # Coaching interface (Vanilla TS)
│   └── src/screens/ # Pairing, coaching, shop, watching
└── shared/          # Types, constants, move catalog
```

---

## Game Flow Summary

| Phase | What Happens | Who Does What |
|-------|-------------|---------------|
| **Lobby** | Browser creates room, shows code | Browser waits |
| **Coaching** | Players chat with their agent | Mobile: type advice, hit READY |
| **Simulating** | Server runs ~20s of AI combat | Everyone waits |
| **Playback** | Fight animation plays on browser | Browser: watch the show |
| **Shop** | Players spend earned gold | Mobile: buy items, hit DONE |

**Economy:** Winner gets 3000g, loser gets 1400g (+ loss bonus). Starting gold: 800g.

---

## Tech Stack

- **Backend:** Node.js + TypeScript + Express + Socket.io
- **Frontend:** Vanilla TypeScript + HTML Canvas
- **Real-time:** Socket.io
- **LLM:** Ollama (local) — currently using `gemma4:latest`
- **Build:** Vite (browser + mobile), tsx (server)

---

*¡A luchar, caballeros!*
