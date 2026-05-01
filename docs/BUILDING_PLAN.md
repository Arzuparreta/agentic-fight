# AGENTIC FIGHT — Building Plan

> **Instructions for the coding agent:**
> You must NEVER make an architectural, design, or technology decision on your own.
> At every decision point marked `🛑 STOP — ASK THE USER`, you must pause, present the options clearly, and wait for the user's answer before writing any code.
> Do not assume. Do not proceed past a STOP point without a confirmed answer.
> If something is not covered by a STOP point but requires a choice, invent a new STOP point and ask anyway.

---

## Project Overview

A multiplayer browser-based game where:

- Each player coaches an AI agent (LLM) via a **mobile chat interface**
- Mobiles connect to a shared **browser screen** via a pairing code
- The agents fight in a **2D side-view space** (Street Fighter-style layout)
- Fights are **pre-simulated** then **played back** as animation — not real-time
- After each round, players earn money (CS:GO curve: winner earns more, loser earns less but still something)
- Money is spent in a **shop** to buy new moves and stat boosts
- The coaching conversation shapes the agent's in-fight behavior via system prompt injection

**Theme:** Reyes Católicos Spain (late 15th century) — knights, friars, Moorish warriors, conquistadors, Inquisition-era iconography.

---

## Phase 0 — Technology Stack

🛑 **STOP — ASK THE USER:**

Before writing a single file, ask the user to decide each of the following. Present them as explicit choices, not assumptions.

### 0.1 — Backend language and runtime

Options:

- A) **Node.js + TypeScript** (same language front and back, large ecosystem)
- B) **Python** (easier LLM integration libraries, FastAPI or Flask)
- C) **Go** (fast, good for WebSockets, less LLM tooling)
- D) Other — ask the user to specify

### 0.2 — Frontend framework

Options:

- A) **React** (component model suits the game UI and shop)
- B) **Vanilla JS + HTML Canvas** (less abstraction, more control for animation)
- C) **Vue**
- D) Other — ask the user to specify

### 0.3 — Real-time communication (browser ↔ server ↔ mobile)

Options:

- A) **Native WebSockets** (raw, no dependency)
- B) **Socket.io** (reconnection, rooms, fallbacks built in)
- C) **Server-Sent Events** for server→client + REST for client→server
- D) Other — ask the user to specify

### 0.4 — LLM provider

Options:

- A) **Anthropic Claude** (claude-sonnet-4-20250514)
- B) **OpenAI GPT-4o**
- C) **Local model via Ollama**
- D) Abstracted — use a provider interface so it can be swapped. Ask which to use first.

### 0.5 — Mobile interface: is it a separate app or a responsive web page?

Options:

- A) **Responsive web page** — same codebase, different route (`/mobile`), works in any mobile browser
- B) **Separate mobile app** (React Native, Expo) — more native feel, more work
- Ask the user which they prefer.

### 0.6 — Persistence: do we need a database in v1?

Options:

- A) **In-memory only** — game state lives in server RAM, reset on restart. Simplest.
- B) **SQLite** — lightweight file-based persistence. Survives restarts.
- C) **PostgreSQL / other** — production-grade, more setup.
- Ask the user what they need for v1.

### 0.7 — Monorepo or separate repos?

Options:

- A) **Monorepo** — one repo, folders for `server/`, `browser/`, `mobile/` (if separate)
- B) **Separate repos** per service
- Ask the user.

---

## Phase 1 — Project Scaffolding

> Only begin this phase after ALL Phase 0 questions are answered.

🛑 **STOP — ASK THE USER** before creating any folder structure:

- Show the proposed folder structure based on their Phase 0 answers and ask for approval before creating anything.

### What to scaffold

- Root config files (`package.json` / `pyproject.toml` / etc. depending on 0.1)
- `server/` — game engine, WebSocket server, LLM caller
- `browser/` — main display: fight playback, shop UI
- `mobile/` — coaching chat interface (or `/mobile` route inside `browser/`)
- Shared types/interfaces (if TypeScript: a `shared/` package with game state types)
- Environment variable setup (`.env.example` with LLM API key, port, etc.)
- README with how to run locally

🛑 **STOP — ASK THE USER:**

- After showing the scaffolded structure, ask: "Does this match what you expected? Any folders or files to add, rename, or remove?"

---

## Phase 2 — Game Engine (Server-Side Simulation)

> This is the core. Build and test this completely before touching any UI.

### 2.1 — Define the game constants

🛑 **STOP — ASK THE USER** for each of the following values before hardcoding anything:

- **Arena width:** How wide is the play area in game units? (e.g. 1000 units)
- **Tick rate:** How many simulation ticks per second of game time? (e.g. 10 ticks/sec = each tick is 100ms of game time)
- **Max ticks per round:** When does a round end if nobody dies? (e.g. 300 ticks = 30 seconds of game time)
- **Starting HP:** How much HP does each agent start with? (e.g. 100)
- **Basic attack damage:** How much does the basic attack deal? (e.g. 10)
- **Basic attack range:** How close do characters need to be to land a basic attack? (in game units, e.g. 80)
- **Basic attack cooldown:** How many ticks between basic attacks? (e.g. 15 ticks)
- **Movement speed:** How many units does a character move per tick? (e.g. 8)

### 2.2 — Define the game state structure

Once constants are confirmed, implement the core types:

```
GameState {
  tick: number
  agents: {
    [agentId]: {
      position: number        // x position (1D for now — see note below)
      hp: number
      maxHp: number
      cooldowns: { [moveName]: number }  // ticks remaining
      moves: string[]         // move names the player has purchased
      status: "alive" | "dead"
    }
  }
  eventLog: SimEvent[]
}

SimEvent {
  tick: number
  agentId: string
  type: "move" | "attack" | "special" | "hit" | "death" | "idle"
  payload: object             // position, damage, targetId, etc.
}
```

🛑 **STOP — ASK THE USER:**

- Show the proposed types and ask: "Does this structure make sense? Anything missing or wrong?"
- Ask explicitly: **"Should the arena be 1D (left/right only, like actual Street Fighter) or true 2D (agents can also move up/down)?"** This changes the position field from `number` to `{x, y}` and changes all movement logic.

### 2.3 — Implement the simulation loop

The simulation function signature:

```
simulateRound(agentAPrompt: string, agentBPrompt: string, agentAMoves: string[], agentBMoves: string[], agentAStats: Stats, agentBStats: Stats) → SimEvent[]
```

Logic per tick:

1. Build a text representation of the current game state for each agent
2. Call the LLM for each agent (in parallel) — get an action back
3. Validate the action (is the move available? is it off cooldown? is the target in range?)
4. Apply the action to game state
5. Log the SimEvent
6. Check win condition (HP ≤ 0 or max ticks reached)
7. Advance tick

🛑 **STOP — ASK THE USER:**

- "Should both agents act simultaneously each tick (their decisions are made in parallel before either resolves), or alternately (agent A acts, state updates, then agent B acts)?"
- "If an agent tries to use a move that's on cooldown or out of range, should it: (A) automatically fall back to the best available action, (B) waste the tick doing nothing, or (C) ask the LLM again with an error message?"

### 2.4 — LLM action interface

Each tick, the agent receives a prompt like:

```
You are [agent name], a [character description].
Your strategic directive: [coaching summary from player]

Current situation:
- Your position: 340 | Opponent position: 680
- Your HP: 75/100 | Opponent HP: 60/100
- Available actions: move_left, move_right, basic_attack (ready), lunge (cooldown: 3)
- Tick: 47 of 300

Respond with exactly one JSON object: { "action": "...", "reasoning": "..." }
Valid actions: move_left, move_right, basic_attack, lunge, idle
```

🛑 **STOP — ASK THE USER:**

- "Should the agent's reasoning be logged and shown to the player after the fight, or is it internal only?"
- "Should the agent see the opponent's purchased moves, or only their position and HP?"

### 2.5 — Test the engine with a dummy agent

Before any UI, test the simulation loop with a hardcoded dummy agent that always does the same action. Verify:

- The event log is generated correctly
- HP reaches 0 and the round ends
- Cooldowns are tracked correctly
- The simulation terminates in all cases (no infinite loops)

🛑 **STOP — ASK THE USER** after running the first test simulation:

- Show the raw event log output and ask: "Does this look correct? Any behavior that seems wrong?"

---

## Phase 3 — Economy and Shop System

### 3.1 — Economy constants

🛑 **STOP — ASK THE USER:**

- **Winner earnings per round:** How much money does the winner earn? (e.g. 3000)
- **Loser earnings per round:** How much does the loser earn? (e.g. 1400 — CS:GO style)
- **Starting money:** Do players start round 1 with any money? (e.g. 800 — enough for one cheap item)
- **Consecutive loss bonus:** Does the loser get more money the more rounds they've lost in a row? (CS:GO has this — ask if they want it)

### 3.2 — Define the item catalog (v1)

🛑 **STOP — ASK THE USER** before defining any items:

- "I need to define the first set of purchasable moves and boosts. These should fit the Reyes Católicos theme. I'll propose a list — please approve, modify, or replace each one."

Proposed v1 item catalog (present this to the user for approval):

| ID | Name | Type | Cost | Effect | Theme |
|----|------|------|------|--------|-------|
| `sword_lunge` | Estocada | Move | 600 | Close-range lunge, high damage, long cooldown | Knight's thrust |
| `shield_block` | Escudo | Move | 500 | Reduces damage for N ticks | Castilian shield |
| `crossbow` | Ballesta | Move | 800 | Ranged attack (works at distance) | Crossbowman |
| `war_cry` | Grito de Guerra | Move | 400 | Boosts attack damage for N ticks | Battle cry |
| `hp_boost` | Fortaleza | Boost | 300 | +20 max HP (permanent for round) | Endurance |
| `speed_boost` | Ligereza | Boost | 400 | +3 movement per tick | Light-footed |
| `inquisitor_curse` | Maldición | Move | 1000 | Opponent's cooldowns slow down | Inquisition |

Ask: "Should items be permanent (carried into future rounds once bought) or consumable (bought fresh each round)?"

### 3.3 — Shop state

The shop UI must track per player:

- Current money
- Items owned
- Items available to buy (those not yet owned, or consumables)

🛑 **STOP — ASK THE USER:**

- "Should the shop close when both players have confirmed they're ready, or after a fixed time limit?"
- "Can a player see what the opponent is buying?"

---

## Phase 4 — WebSocket Server and Room System

### 4.1 — Room lifecycle

```
Room {
  id: string                  // 4-char pairing code (e.g. "BRGD")
  phase: "lobby" | "coaching" | "simulating" | "playback" | "shop" | "ended"
  players: {
    [playerId]: {
      role: "browser" | "mobile"
      agentName: string
      stats: Stats
      moves: string[]
      money: number
      coachingMessages: Message[]
      ready: boolean
    }
  }
  currentRound: number
  eventLog: SimEvent[]        // populated after simulation
  roundHistory: RoundResult[]
}
```

🛑 **STOP — ASK THE USER:**

- "How many rounds does a match last? Fixed number (e.g. best of 5), or until one player reaches X wins, or until money runs out?"
- "What happens if a player disconnects mid-round?"

### 4.2 — WebSocket message protocol

Define all message types before implementing:

**Client → Server:**

- `join_room { roomId, role }` — browser or mobile joins
- `coaching_message { content }` — player sends a message to their agent
- `coaching_ready {}` — player signals they're done coaching
- `purchase_item { itemId }` — player buys from shop
- `shop_ready {}` — player signals done shopping

**Server → Client:**

- `room_state { room }` — full state sync
- `phase_change { newPhase }` — round phase changed
- `simulation_complete { eventLog }` — fight is ready to play back
- `economy_update { money, roundResult }` — after fight resolves
- `error { message }` — invalid action, etc.

🛑 **STOP — ASK THE USER:**

- "Show this protocol to the user and ask: Are any messages missing? Is there anything here that shouldn't exist yet?"

---

## Phase 5 — Browser Display

> The main screen. Shown on a laptop/TV. Two players watch it together.

### 5.1 — Playback renderer

Takes the `SimEvent[]` log and animates it.

🛑 **STOP — ASK THE USER:**

- "Should the characters be: (A) simple colored rectangles with a name label (fast to build, abstract), (B) pixel art sprites matching the Reyes Católicos theme (beautiful, requires art assets), or (C) SVG vector characters (compromise — stylized but codeable without art tools)?"
- "Should the fight be shown on a flat ground with a background image, or abstract (no background)?"
- "Should there be sound effects in v1? (Yes / No / Later)"

### 5.2 — HUD elements

During playback show:

- HP bars for both agents
- Character names
- Current tick / round timer
- Move names when they're used (pop-up labels)

🛑 **STOP — ASK THE USER:**

- "Anything else you want visible on the main screen during playback?"

### 5.3 — Shop screen (browser)

After each round, the browser shows:

- Round result (who won, final HP)
- Both players' money
- The item catalog

🛑 **STOP — ASK THE USER:**

- "Should the browser show both players' inventories during the shop phase, or keep them hidden from each other?"

---

## Phase 6 — Mobile Coaching Interface

> Each player's phone. Minimalist. Just a chat.

### 6.1 — Core screens

- **Pairing screen** — enter the 4-char room code
- **Waiting screen** — "Waiting for opponent..."
- **Coaching screen** — chat UI with the agent. Input at bottom. Messages above.
- **Ready button** — large, obvious. Sends `coaching_ready`.
- **Shop screen** — list of available items with Buy buttons, money display
- **Watching screen** — "Fight is happening... watch the main screen" + a simple HP ticker

🛑 **STOP — ASK THE USER:**

- "Should the mobile show a live HP bar during the fight (synced from the server), or just a passive 'fight in progress' message?"
- "Should the coaching chat persist between rounds so the player can scroll back and see what they said before?"

### 6.2 — Coaching-to-system-prompt pipeline

When `coaching_ready` is received from a player:

1. Take the full `coachingMessages[]` array for that player's agent
2. Call the LLM with: `"Summarize the following coaching instructions into a short strategic directive for a fighter. Be specific about tactics, priorities, and when to use each move. Max 3 sentences."` + the messages
3. Store the summary as `agent.strategicDirective`
4. Inject this as the opening of the agent's system prompt in Phase 2

🛑 **STOP — ASK THE USER:**

- "Should the player see the summarized directive before the fight starts? ('Your agent's plan: advance aggressively, save Estocada for when opponent HP is below 40%') — or is it invisible?"
- "Should the agent be able to ask the player clarifying questions during the coaching phase, or is coaching one-directional (player talks, agent listens)?"

---

## Phase 7 — Integration and First Playable Round

> Wire everything together for a single round, end to end.

### Integration checklist (do not mark done without testing each)

- [ ] Mobile connects to server via pairing code
- [ ] Coaching messages are sent and stored server-side
- [ ] Both players hit "ready" → server transitions to `simulating` phase
- [ ] Simulation runs, event log is generated
- [ ] Event log is sent to browser
- [ ] Browser plays back the fight correctly
- [ ] Economy is calculated and sent to both mobiles
- [ ] Shop phase opens — purchases are applied to agent stats/moves
- [ ] Round 2 begins with updated agents

🛑 **STOP — ASK THE USER** after first successful end-to-end run:

- "Watch the first full round. Does the fight feel right? Is the pacing too fast, too slow? Does anything look broken?"
- List any specific behaviors that seemed wrong and address them before proceeding.

---

## Phase 8 — Polish and Balance (Do Last)

> Only enter this phase after Phase 7 is stable.

🛑 **STOP — ASK THE USER** before starting each sub-item:

### 8.1 — Agent behavior tuning

- Does the agent make sensible decisions, or does it spam one move?
- Tune the prompt structure if behavior seems degenerate
- Ask: "Do you want a 'personality' system where different character types (knight vs friar vs Moorish warrior) have default behavioral tendencies even before coaching?"

### 8.2 — Balance

- Is any item obviously overpowered?
- Is the basic attack so weak that round 1 is boring?
- Ask the user to play 3 rounds and report what felt unfair

### 8.3 — Visual polish

- Background art / theme
- Font (something period-appropriate)
- Sound (if decided in 5.1)

### 8.4 — Deployment

🛑 **STOP — ASK THE USER:**

- "Where do you want to host this? (Local only / a VPS / Vercel+Railway / other)"
- "Do you need HTTPS for the mobile to work on real phones? (Yes, required for non-localhost)"
- "Do you want a public URL or is this for local LAN play only?"

---

## Appendix A — Decisions Log

The coding agent must maintain this table throughout the project. Every time the user answers a STOP question, record it here.

| # | Question | User's Answer | Date |
|---|----------|---------------|------|
| 0.1 | Backend language | | |
| 0.2 | Frontend framework | | |
| 0.3 | Real-time communication | | |
| 0.4 | LLM provider | | |
| 0.5 | Mobile: responsive web or app | | |
| 0.6 | Persistence in v1 | | |
| 0.7 | Monorepo or separate repos | | |
| 2.2a | Arena: 1D or 2D | | |
| 2.3a | Simultaneous or alternating ticks | | |
| 2.3b | Invalid action fallback behavior | | |
| 2.4a | Agent reasoning: logged or internal | | |
| 2.4b | Agent sees opponent's moves | | |
| 3.1 | Economy constants | | |
| 3.2 | Item catalog approved | | |
| 3.2b | Items permanent or consumable | | |
| 3.3a | Shop close condition | | |
| 3.3b | Opponent shop visibility | | |
| 4.1a | Match length | | |
| 4.1b | Disconnect handling | | |
| 5.1a | Character visuals | | |
| 5.1b | Background | | |
| 5.1c | Sound effects | | |
| 6.1a | Mobile during fight | | |
| 6.1b | Chat history persistence | | |
| 6.2a | Directive shown to player | | |
| 6.2b | Agent can ask questions | | |
| 8.1 | Personality system | | |
| 8.4 | Deployment target | | |

---

## Appendix B — What the Coding Agent Must Never Do

- Never pick a tech stack option without asking
- Never hardcode a game balance number without asking
- Never design an item without presenting it for approval
- Never start a new phase without confirming the previous phase is working
- Never assume a design question has an obvious answer
- If the user's answer is ambiguous, ask a follow-up before proceeding
