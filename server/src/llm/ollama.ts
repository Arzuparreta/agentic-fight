import {
  AgentState,
  GameState,
  getAvailableMoves,
  getMoveDef,
  PlaystyleProfile,
  PlaystyleParameters,
  CoachingMessage,
  MOVE_CATALOG,
  ActionSequence,
  MacroAction,
  VALID_MACRO_ACTIONS,
  ActionHistoryEntry,
  OpponentTendencies,
  RoundSummary,
} from '@shared/index';
import { analyzeOpponentTendencies, ActionHistoryEntry as BHActionHistoryEntry } from '../game/behavior';

export interface AgentAction {
  action: string;
  reasoning: string;
}

export type SequenceSource = 'llm' | 'default' | 'retry_llm';

export interface SequenceCallResult {
  sequence: ActionSequence;
  source: SequenceSource;
  durationMs: number;
  error?: string;
}

function defaultSequenceFailure(reason: string): ActionSequence {
  return {
    strategy: reason,
    actions: [{ macro: 'approach', duration: 20 }, { macro: 'attack' }],
    interruptConditions: ['opponent_winding_up'],
    reasoning: 'Default sequence: approach and attack.',
  };
}

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma4:latest';
const LLM_TIMEOUT_MS = 30000;

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number = LLM_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

function euclideanDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function formatActionHistory(history: ActionHistoryEntry[], maxEntries: number = 10): string {
  if (history.length === 0) return 'No recent actions.';
  const recent = history.slice(-maxEntries);
  return recent
    .map((h) => `  Tick ${h.tick}: ${h.action} at (${Math.round(h.position.x)},${Math.round(h.position.y)}) HP:${h.hp}/${h.maxHp} dist:${h.distance.toFixed(0)}`)
    .join('\n');
}

function formatTendencies(tendencies: OpponentTendencies): string {
  const topMoves = Object.entries(tendencies.preferredMoves)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([m, c]) => `${m}(${c}x)`)
    .join(', ');

  return `Approach/retreat ratio: ${(tendencies.approachRetreatRatio * 100).toFixed(0)}%, Dodge frequency: ${(tendencies.dodgeFrequency * 100).toFixed(0)}%, Shield usage: ${(tendencies.shieldUsage * 100).toFixed(0)}%, Top moves: ${topMoves || 'none'}, Avg distance: ${tendencies.averageDistance.toFixed(0)}`;
}

function formatAvailableMoves(agent: AgentState): string {
  return getAvailableMoves(agent)
    .map((m) => {
      const cd = agent.cooldowns[m] ?? 0;
      const def = getMoveDef(m);
      const ready = cd <= 0 ? 'READY' : `cd:${cd}`;
      const frameInfo = def?.attackProfile
        ? `windup:${def.attackProfile.windupTicks} active:${def.attackProfile.activeTicks} recovery:${def.attackProfile.recoveryTicks}`
        : '';
      return `  - ${m}: ${def?.name || m} | dmg:${def?.damage || 0} range:${def?.range || 0} | ${ready} | ${frameInfo}`;
    })
    .join('\n');
}

function buildSequencePrompt(
  agent: AgentState,
  opponent: AgentState,
  state: GameState,
  playstyleProfile: PlaystyleProfile | null,
  characterDescription: string,
  actionHistory: ActionHistoryEntry[],
  opponentHistory: ActionHistoryEntry[],
  tendencies: OpponentTendencies,
  roundSummaries: RoundSummary[],
  errorContext?: string
): string {
  const dist = euclideanDistance(agent.physics.position, opponent.physics.position);
  const myEffects = agent.statusEffects.map((se) => `${se.type}(${se.value}, ${se.remainingTicks}t)`).join(', ') || 'none';
  const oppEffects = opponent.statusEffects.map((se) => `${se.type}(${se.value}, ${se.remainingTicks}t)`).join(', ') || 'none';

  let narrative = 'I fight to win, adapting to the situation as it unfolds.';
  let directivesStr = '';
  if (playstyleProfile) {
    narrative = playstyleProfile.narrative;
    directivesStr = playstyleProfile.directives.length > 0
      ? `\nYour coach's directives: ${playstyleProfile.directives.join('; ')}.`
      : '';
  }

  const hpPressure = agent.hp / agent.maxHp > opponent.hp / opponent.maxHp
    ? 'You are winning the HP race.'
    : agent.hp / agent.maxHp < opponent.hp / opponent.maxHp
      ? 'You are losing the HP race — consider aggressive or defensive plays.'
      : 'HP is roughly even.';

  const distanceTrend = actionHistory.length >= 3
    ? actionHistory.slice(-3).reduce((acc, h, i, arr) => {
        if (i === 0) return 0;
        return acc + (h.distance - arr[i - 1].distance);
      }, 0) < -5 ? 'closing in' : actionHistory.slice(-3).reduce((acc, h, i, arr) => {
        if (i === 0) return 0;
        return acc + (h.distance - arr[i - 1].distance);
      }, 0) > 5 ? 'moving apart' : 'stable'
    : 'unknown';

  let currentSequenceStr = '';
  if (agent.sequenceExecution) {
    const exec = agent.sequenceExecution;
    const current = exec.sequence.actions[exec.currentActionIndex];
    currentSequenceStr = `\nYou are currently executing: ${current?.macro || 'idle'} (step ${exec.currentActionIndex + 1}/${exec.sequence.actions.length}).`;
  }

  let roundSummaryStr = '';
  if (roundSummaries.length > 0) {
    const last = roundSummaries[roundSummaries.length - 1];
    roundSummaryStr = `\nLast round: You ${last.won ? 'WON' : 'LOST'}. What worked: ${last.whatWorked.join(', ')}. What didn't: ${last.whatDidNotWork.join(', ')}.`;
  }

  const prompt = `IMPORTANT: You must respond with ONLY a valid JSON object. No markdown, no explanation, no prose before or after the JSON.

You are ${agent.name}, ${characterDescription}.
How you think about fighting: ${narrative}${directivesStr}

Current situation (tick ${state.tick} of ${state.maxTicks}):
- Your position: (${Math.round(agent.physics.position.x)}, ${Math.round(agent.physics.position.y)}) | Opponent: (${Math.round(opponent.physics.position.x)}, ${Math.round(opponent.physics.position.y)})
- Your HP: ${agent.hp}/${agent.maxHp} | Opponent HP: ${opponent.hp}/${opponent.maxHp}
- Distance: ${dist.toFixed(0)} units (trend: ${distanceTrend})
- Your effects: ${myEffects}
- Opponent effects: ${oppEffects}
- Dodge: ${agent.dodgeCooldown > 0 ? `cooldown ${agent.dodgeCooldown} ticks` : 'READY'}
- Your attack state: ${agent.attackState.phase}${agent.attackState.moveId ? ` (${agent.attackState.moveId})` : ''}
- Opponent attack state: ${opponent.attackState.phase}${opponent.attackState.moveId ? ` (${opponent.attackState.moveId})` : ''}
${currentSequenceStr}

Your available moves:
${formatAvailableMoves(agent)}

Recent opponent actions:
${formatActionHistory(opponentHistory)}

Opponent tendencies: ${formatTendencies(tendencies)}

${hpPressure}${roundSummaryStr}

You must choose a sequence of macro-actions to execute over the next ~2 seconds (up to 40 ticks). Each macro is a pre-defined behavior. You can chain 1–6 macros in a sequence.

Available macros:
- approach: close distance aggressively
- circle_left / circle_right: orbit opponent at ideal range
- feint_approach: approach, then dodge sideways when close to bait an attack
- bait: hover just outside opponent range, auto-dodge if they commit
- dodge: quick burst evasion (can specify directionHint like "left" or "back_right")
- attack: commit to an attack (specify moveId, e.g. "sword_lunge")
- retreat: create distance
- shield_up: raise shield_block if available
- wait: hold position, observe
- kite: maintain max range, use ranged attacks
- punish: rush in and strike when opponent whiffs (misses an attack)
- dodge_and_counter: bait opponent attack, dodge it, then counter-strike
- rushdown: close distance fast and attack

Interrupt conditions (the sequence will abort if any trigger):
- opponent_winding_up
- opponent_attacking
- opponent_whiffed / opponent_recovery
- low_hp
- opponent_low_hp
- in_range
- out_of_range
- dodge_ready
- opponent_shielded
- opponent_retreating

Respond with exactly one JSON object:
{
  "strategy": "1-2 sentence description of your current tactical thinking",
  "actions": [
    { "macro": "approach", "duration": 15 },
    { "macro": "attack", "moveId": "sword_lunge" }
  ],
  "interruptConditions": ["opponent_winding_up"],
  "reasoning": "1-2 sentences explaining your plan"
}`;

  if (errorContext) {
    return prompt + `\n\nIMPORTANT: Your previous sequence was invalid: ${errorContext}\nPlease choose a different valid sequence.`;
  }

  return prompt;
}

function validateSequence(parsed: any): ActionSequence {
  const defaultSeq = defaultSequenceFailure('Default due to validation failure.');
  if (!parsed || typeof parsed !== 'object') return defaultSeq;

  const strategy = typeof parsed.strategy === 'string' ? parsed.strategy.trim() : defaultSeq.strategy;
  const reasoning = typeof parsed.reasoning === 'string' ? parsed.reasoning.trim() : defaultSeq.reasoning;

  const actions: ActionSequence['actions'] = [];
  if (Array.isArray(parsed.actions)) {
    for (const a of parsed.actions) {
      if (!a || typeof a !== 'object') continue;
      const macro = (VALID_MACRO_ACTIONS as readonly string[]).includes(a.macro) ? a.macro : 'approach';
      const duration = typeof a.duration === 'number' ? Math.max(1, Math.min(60, Math.round(a.duration))) : undefined;
      const moveId = typeof a.moveId === 'string' ? a.moveId.trim().toLowerCase() : undefined;
      const directionHint = typeof a.directionHint === 'string' ? a.directionHint.trim().toLowerCase() : undefined;
      actions.push({ macro: macro as MacroAction, duration, moveId, directionHint });
    }
  }
  if (actions.length === 0) {
    actions.push({ macro: 'approach', duration: 20 }, { macro: 'attack' });
  }

  const interruptConditions: string[] = [];
  if (Array.isArray(parsed.interruptConditions)) {
    for (const c of parsed.interruptConditions) {
      if (typeof c === 'string') interruptConditions.push(c);
    }
  }

  return { strategy, actions, interruptConditions, reasoning };
}

function buildMinimalRetryPrompt(agent: AgentState, opponent: AgentState, state: GameState): string {
  return `Respond with ONLY a JSON object and nothing else.

Example:
{"strategy":"Rush and attack","actions":[{"macro":"approach","duration":15},{"macro":"attack","moveId":"basic_attack"}],"interruptConditions":["opponent_winding_up"],"reasoning":"Closing fast to strike"}

Your macro options: ${VALID_MACRO_ACTIONS.join(', ')}.

Situation: tick ${state.tick}. You at (${Math.round(agent.physics.position.x)},${Math.round(agent.physics.position.y)}) HP ${agent.hp}/${agent.maxHp}. Opponent at (${Math.round(opponent.physics.position.x)},${Math.round(opponent.physics.position.y)}) HP ${opponent.hp}/${opponent.maxHp}.`;
}

function extractJson(raw: string): string | null {
  // Strip markdown code blocks
  let cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
  cleaned = cleaned.trim();

  // Find first { and last }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return cleaned.slice(firstBrace, lastBrace + 1);
  }

  // Sometimes models output arrays
  const firstBracket = cleaned.indexOf('[');
  const lastBracket = cleaned.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    return cleaned.slice(firstBracket, lastBracket + 1);
  }

  return null;
}

async function generateSequenceOnce(
  prompt: string,
  agentId: string
): Promise<{ ok: true; raw: string } | { ok: false; error: string }> {
  try {
    console.log(`[LLM] Requesting action sequence for agent ${agentId}...`);
    const res = await fetchWithTimeout(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        format: 'json',
      }),
    });

    if (!res.ok) {
      return { ok: false, error: `Ollama HTTP ${res.status}` };
    }

    const data = await res.json();
    let raw = typeof data.response === 'string' ? data.response : '{}';
    if (!raw.trim()) {
      return { ok: false, error: 'Empty LLM response' };
    }

    // Extract JSON if model wrapped it in prose/markdown
    const extracted = extractJson(raw);
    if (extracted) {
      raw = extracted;
    }

    return { ok: true, raw };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export async function getSequenceWithTrace(
  agent: AgentState,
  opponent: AgentState,
  state: GameState,
  playstyleMemory: string,
  characterDescription: string,
  actionHistory: ActionHistoryEntry[],
  opponentHistory: ActionHistoryEntry[],
  roundSummaries: RoundSummary[],
  errorContext?: string
): Promise<SequenceCallResult> {
  const t0 = performance.now();

  let playstyleProfile: PlaystyleProfile | null = null;
  if (playstyleMemory) {
    try {
      playstyleProfile = JSON.parse(playstyleMemory);
    } catch {
      playstyleProfile = null;
    }
  }

  const tendencies = analyzeOpponentTendencies(opponentHistory as BHActionHistoryEntry[]);

  const prompt = buildSequencePrompt(
    agent, opponent, state, playstyleProfile,
    characterDescription, actionHistory, opponentHistory,
    tendencies, roundSummaries, errorContext
  );

  const first = await generateSequenceOnce(prompt, agent.id);
  if (!first.ok) {
    const durationMs = performance.now() - t0;
    return {
      sequence: defaultSequenceFailure('Default due to LLM error.'),
      source: 'default',
      durationMs,
      error: first.error,
    };
  }

  try {
    const parsed = JSON.parse(first.raw);
    const sequence = validateSequence(parsed);
    const durationMs = performance.now() - t0;
    console.log(
      `[LLM] Sequence for ${agent.id}: ${sequence.actions.map((a) => a.macro).join(' -> ')}`
    );
    return { sequence, source: 'llm', durationMs };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn(`[LLM] Parse failed for ${agent.id}, retry with minimal prompt: ${errMsg}`);

    const retryPrompt = buildMinimalRetryPrompt(agent, opponent, state);
    const second = await generateSequenceOnce(retryPrompt, agent.id);

    if (second.ok) {
      try {
        const parsed2 = JSON.parse(second.raw);
        const sequence = validateSequence(parsed2);
        const durationMs = performance.now() - t0;
        console.log(`[LLM] Retry sequence for ${agent.id}: ${sequence.actions.map((a) => a.macro).join(' -> ')}`);
        return { sequence, source: 'retry_llm', durationMs, error: errMsg };
      } catch (err2: unknown) {
        const durationMs = performance.now() - t0;
        const err2Msg = err2 instanceof Error ? err2.message : String(err2);
        return {
          sequence: defaultSequenceFailure('Default due to LLM error.'),
          source: 'default',
          durationMs,
          error: `${errMsg}; retry: ${err2Msg}`,
        };
      }
    }

    const durationMs = performance.now() - t0;
    return {
      sequence: defaultSequenceFailure('Default due to LLM error.'),
      source: 'default',
      durationMs,
      error: `${errMsg}; retry HTTP: ${second.error}`,
    };
  }
}

// Backward-compatible wrapper that adapts old TacticalPlanClient callers (if any)
export async function getTacticalPlanWithTrace(
  agent: AgentState,
  opponent: AgentState,
  state: GameState,
  playstyleMemory: string,
  characterDescription: string,
  actionHistory: ActionHistoryEntry[],
  opponentHistory: ActionHistoryEntry[],
  roundSummaries: RoundSummary[],
  errorContext?: string
): Promise<any> {
  // This wrapper converts ActionSequence back to old TacticalPlan shape for any legacy callers.
  const r = await getSequenceWithTrace(agent, opponent, state, playstyleMemory, characterDescription, actionHistory, opponentHistory, roundSummaries, errorContext);
  return {
    plan: {
      strategy: r.sequence.strategy,
      movementPattern: 'approach_direct',
      primaryMove: r.sequence.actions.find((a) => a.macro === 'attack')?.moveId || 'basic_attack',
      dodgeFrequency: 30,
      aggressionLevel: 50,
      reactions: {
        ifOpponentShields: 'wait',
        ifOpponentRetreats: 'rush',
        ifLowHP: 'retreat',
        ifOpponentUsesRanged: 'dodge_close',
      },
      reasoning: r.sequence.reasoning,
    },
    source: r.source,
    durationMs: r.durationMs,
    error: r.error,
  };
}

/* ───────────────────────────────────────────
   Coaching Conversation System (FIXED)
   ─────────────────────────────────────────── */

export interface CoachingContext {
  agentName: string;
  characterDescription: string;
  lastRoundResult?: { won: boolean; score: string; notes: string };
  opponentCharacter?: string;
  roundNumber: number;
}

function buildOpeningPrompt(ctx: CoachingContext): string {
  let context = '';
  if (ctx.lastRoundResult) {
    const { won, score, notes } = ctx.lastRoundResult;
    context = `Last round: you ${won ? 'WON' : 'LOST'} (${score}). ${notes}\n`;
  }

  return `You are ${ctx.agentName}, ${ctx.characterDescription}. You are speaking to your lord/coach before a battle.

${context}
You are in round ${ctx.roundNumber}. Your opponent is ${ctx.opponentCharacter || 'an unknown warrior'}.

Initiate a conversation with your lord. Ask for guidance on how to fight — your tactics, timing, and approach. Reference your fighting style and the opponent if you know them. Be in character.

Keep it to 1-2 sentences. End with a question about fighting strategy.

Respond with exactly one JSON object: { "message": "..." }`;
}

export async function generateAgentOpeningMessage(ctx: CoachingContext): Promise<string> {
  const prompt = buildOpeningPrompt(ctx);

  try {
    console.log(`[LLM] Generating opening message for ${ctx.agentName}...`);
    const res = await fetchWithTimeout(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        format: 'json',
      }),
    });

    if (!res.ok) {
      throw new Error(`Ollama HTTP ${res.status}`);
    }

    const data = await res.json();
    const raw = data.response || '{}';
    const parsed = JSON.parse(raw) as { message?: string };

    const message = parsed.message?.trim();
    if (!message) {
      throw new Error('LLM response missing message field');
    }

    console.log(`[LLM] Opening message for ${ctx.agentName}: "${message.slice(0, 60)}..."`);
    return message;
  } catch (err) {
    console.error('[LLM] Error generating opening message:', err);
    return `My lord, I await your counsel. How shall I fight?`;
  }
}

function buildResponsePrompt(ctx: CoachingContext, conversation: CoachingMessage[], playerMessage: string): string {
  const transcript = conversation
    .map(m => `${m.sender === 'player' ? 'Coach' : 'You'}: ${m.content}`)
    .join('\n');

  return `You are ${ctx.agentName}, ${ctx.characterDescription}. You are in conversation with your lord/coach before battle.

Conversation so far:
${transcript}

Your coach just said: "${playerMessage}"

Respond in character. Acknowledge the advice, share your thoughts on how you'll apply it in combat, and if appropriate ask a follow-up about tactics, timing, or specific moves. Keep it to 1-3 sentences.

Respond with exactly one JSON object: { "message": "..." }`;
}

export async function generateAgentResponse(
  ctx: CoachingContext,
  conversation: CoachingMessage[],
  playerMessage: string
): Promise<string> {
  const prompt = buildResponsePrompt(ctx, conversation, playerMessage);

  try {
    console.log(`[LLM] Generating response for ${ctx.agentName}...`);
    const res = await fetchWithTimeout(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        format: 'json',
      }),
    });

    if (!res.ok) {
      throw new Error(`Ollama HTTP ${res.status}`);
    }

    const data = await res.json();
    const raw = data.response || '{}';
    const parsed = JSON.parse(raw) as { message?: string };

    const message = parsed.message?.trim();
    if (!message) {
      throw new Error('LLM response missing message field');
    }

    console.log(`[LLM] Response for ${ctx.agentName}: "${message.slice(0, 60)}..."`);
    return message;
  } catch (err) {
    console.error('[LLM] Error generating agent response:', err);
    return `I understand, my lord. I shall fight as you command.`;
  }
}

function buildSynthesisPrompt(ctx: CoachingContext, conversation: CoachingMessage[]): string {
  const transcript = conversation
    .map(m => `${m.sender === 'player' ? 'Coach' : 'You'}: ${m.content}`)
    .join('\n');

  return `You are ${ctx.agentName}, ${ctx.characterDescription}. Here is your full coaching conversation with your lord:

${transcript}

Based on this conversation, generate your fighting profile:

1. A 2-3 sentence narrative describing your fighting philosophy — how you think about combat, your priorities, and your mindset.
2. Numeric values (0-100) for these traits:
   - aggressiveness: how aggressively you seek engagement (0=passive, 100=always attacking)
   - risk_tolerance: how willing you are to take damage to deal damage (0=very cautious, 100=reckless)
   - preferred_range: your ideal combat distance (0=melee/close, 100=long range)
   - patience: how long you wait before committing (0=rush in immediately, 100=wait and observe)
   - defensiveness: how much you prioritize defense (0=all offense, 100=all defense)
   - combo_preference: how likely you are to chain abilities together (0=single moves, 100=combos)
3. 2-4 specific behavioral directives — concrete tactics your lord wants you to follow. These should be about WHEN and HOW to use your abilities in combat. Examples: "wait for opponent to attack first, then dodge and punish with sword_lunge", "use crossbow to poke from max range", "bait opponent into whiffing then counter-attack", "dodge_and_counter when opponent winds up a heavy attack".

Respond with exactly one JSON object:
{ "narrative": "...", "parameters": { "aggressiveness": 50, "risk_tolerance": 50, "preferred_range": 50, "patience": 50, "defensiveness": 50, "combo_preference": 50 }, "directives": ["...", "..."] }`;
}

export async function synthesizePlaystyle(
  ctx: CoachingContext,
  conversation: CoachingMessage[]
): Promise<PlaystyleProfile> {
  const prompt = buildSynthesisPrompt(ctx, conversation);

  try {
    console.log(`[LLM] Synthesizing playstyle for ${ctx.agentName}...`);
    const res = await fetchWithTimeout(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        format: 'json',
      }),
    });

    if (!res.ok) {
      throw new Error(`Ollama HTTP ${res.status}`);
    }

    const data = await res.json();
    const raw = data.response || '{}';
    const parsed = JSON.parse(raw) as {
      narrative?: string;
      parameters?: PlaystyleParameters;
      directives?: string[];
    };

    const narrative = parsed.narrative?.trim();
    if (!narrative) {
      throw new Error('LLM response missing narrative field');
    }

    const defaults: PlaystyleParameters = {
      aggressiveness: 50,
      risk_tolerance: 50,
      preferred_range: 50,
      patience: 50,
      defensiveness: 50,
      combo_preference: 50,
    };

    const parameters: PlaystyleParameters = {
      aggressiveness: clamp(parsed.parameters?.aggressiveness ?? 50, 0, 100),
      risk_tolerance: clamp(parsed.parameters?.risk_tolerance ?? 50, 0, 100),
      preferred_range: clamp(parsed.parameters?.preferred_range ?? 50, 0, 100),
      patience: clamp(parsed.parameters?.patience ?? 50, 0, 100),
      defensiveness: clamp(parsed.parameters?.defensiveness ?? 50, 0, 100),
      combo_preference: clamp(parsed.parameters?.combo_preference ?? 50, 0, 100),
    };

    const directives = parsed.directives?.filter(d => d.trim().length > 0).slice(0, 4) ?? [];

    return { narrative, parameters, directives };
  } catch (err) {
    console.error('[LLM] Error synthesizing playstyle:', err);
    return {
      narrative: 'I fight to win, adapting to the situation.',
      parameters: { aggressiveness: 50, risk_tolerance: 50, preferred_range: 50, patience: 50, defensiveness: 50, combo_preference: 50 },
      directives: [],
    };
  }
}

export async function generateRoundSummary(
  agentName: string,
  characterDescription: string,
  eventLog: Array<{ tick: number; agentId: string; type: string; payload: Record<string, unknown> }>,
  won: boolean,
  agentId: string,
  opponentId: string
): Promise<RoundSummary> {
  const keyEvents = eventLog
    .filter((e) => e.type === 'attack' || e.type === 'death' || e.type === 'special' || e.type === 'dodge' || e.type === 'whiff' || e.type === 'counter_window')
    .filter((e) => e.agentId === agentId || e.agentId === opponentId)
    .slice(-15)
    .map((e) => `${e.type} by ${e.agentId === agentId ? 'you' : 'opponent'} at tick ${e.tick}`);

  const defaultSummary: RoundSummary = {
    roundNumber: 0,
    won,
    keyEvents: keyEvents.slice(0, 10),
    opponentTendencies: {
      preferredMoves: {},
      dodgeFrequency: 0,
      approachRetreatRatio: 0.5,
      comboUsage: 0,
      averageDistance: 300,
      shieldUsage: 0,
    },
    whatWorked: won ? ['Aggressive playstyle'] : [],
    whatDidNotWork: won ? [] : ['Need to adapt strategy'],
  };

  try {
    const prompt = `You are ${agentName}, ${characterDescription}. You just ${won ? 'WON' : 'LOST'} a round of combat.

Key events from the round:
${keyEvents.join('\n') || 'No notable events.'}

Summarize:
1. What tactics worked well for you (1-3 items)
2. What tactics did NOT work (1-3 items)

Respond with exactly one JSON object:
{ "whatWorked": ["..."], "whatDidNotWork": ["..."] }`;

    const res = await fetchWithTimeout(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        format: 'json',
      }),
    });

    if (!res.ok) {
      throw new Error(`Ollama HTTP ${res.status}`);
    }

    const data = await res.json();
    const raw = data.response || '{}';
    const parsed = JSON.parse(raw) as { whatWorked?: string[]; whatDidNotWork?: string[] };

    defaultSummary.whatWorked = parsed.whatWorked?.slice(0, 3) || defaultSummary.whatWorked;
    defaultSummary.whatDidNotWork = parsed.whatDidNotWork?.slice(0, 3) || defaultSummary.whatDidNotWork;
  } catch (err) {
    console.error('[LLM] Error generating round summary:', err);
  }

  return defaultSummary;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
