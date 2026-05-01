import {
  AgentState,
  GameState,
  getAvailableMoves,
  getMoveDef,
  PlaystyleProfile,
  PlaystyleParameters,
  CoachingMessage,
  MOVE_CATALOG,
  TacticalPlan,
  TacticalReactions,
  MovementPattern,
  ActionHistoryEntry,
  OpponentTendencies,
  RoundSummary,
} from '@shared/index';
import { ActionHistoryEntry as BHActionHistoryEntry, analyzeOpponentTendencies } from '../game/behavior';

export interface AgentAction {
  action: string;
  reasoning: string;
}

export interface AgentPlan {
  plan: 'approach' | 'retreat' | 'attack' | 'defend' | 'idle';
  preferredMove: string;
  reasoning: string;
}

const VALID_MOVEMENT_PATTERNS: MovementPattern[] = [
  'approach_direct',
  'circle_strafe_left',
  'circle_strafe_right',
  'hit_and_retreat',
  'dodge_and_counter',
  'rush',
  'kite',
  'hold_position',
  'feint_approach',
  'retreat',
];

const VALID_REACTION_OPTIONS = [
  'retreat', 'rush', 'use_ranged', 'wait', 'dodge_close', 'hold', 'berserk', 'shield', 'kite',
];

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
    .map((h) => `  Tick ${h.tick}: ${h.action} at (${h.position.x},${h.position.y}) HP:${h.hp}/${h.maxHp} dist:${h.distance.toFixed(0)}`)
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

function buildTacticalPrompt(
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
  const available = getAvailableMoves(agent)
    .map((m) => {
      const cd = agent.cooldowns[m] ?? 0;
      const def = getMoveDef(m);
      const rangeStr = def?.range ? `, range:${def.range}` : '';
      const dmgStr = def?.damage ? `, dmg:${def.damage}` : '';
      return cd > 0 ? `${m} (cd:${cd}${rangeStr}${dmgStr})` : `${m} (ready${rangeStr}${dmgStr})`;
    })
    .join(', ');

  const dist = euclideanDistance(agent.position, opponent.position);
  const myEffects = agent.statusEffects.map((se) => `${se.type}(${se.value}, ${se.remainingTicks} ticks)`).join(', ') || 'none';
  const oppEffects = opponent.statusEffects.map((se) => `${se.type}(${se.value}, ${se.remainingTicks} ticks)`).join(', ') || 'unknown (estimate from behavior)';

  let narrative = 'I fight to win, adapting to the situation as it unfolds.';
  let directivesStr = '';
  if (playstyleProfile) {
    narrative = playstyleProfile.narrative;
    directivesStr = playstyleProfile.directives.length > 0
      ? `\nYour specific tactical directives from your coach: ${playstyleProfile.directives.join('; ')}.`
      : '';
  }

  const hpPressure = agent.hp / agent.maxHp > opponent.hp / opponent.maxHp
    ? 'You are winning the HP race.'
    : agent.hp / agent.maxHp < opponent.hp / opponent.maxHp
      ? 'You are losing the HP race — consider more aggressive or defensive plays.'
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

  let roundSummaryStr = '';
  if (roundSummaries.length > 0) {
    const last = roundSummaries[roundSummaries.length - 1];
    roundSummaryStr = `\nLast round: You ${last.won ? 'WON' : 'LOST'}. Key events: ${last.keyEvents.slice(0, 5).join('; ')}. What worked: ${last.whatWorked.join(', ')}. What didn't: ${last.whatDidNotWork.join(', ')}.`;
  }

  const prompt = `You are ${agent.name}, ${characterDescription}.
How you currently think about fighting: ${narrative}${directivesStr}

Current situation (tick ${state.tick} of ${state.maxTicks}):
- Your position: (${agent.position.x}, ${agent.position.y}) | Opponent position: (${opponent.position.x}, ${opponent.position.y})
- Your HP: ${agent.hp}/${agent.maxHp} | Opponent HP: ${opponent.hp}/${opponent.maxHp}
- Distance to opponent: ${dist.toFixed(0)} units (trend: ${distanceTrend})
- Your active effects: ${myEffects}
- Opponent estimated effects: ${oppEffects}
- Available moves: ${available}
- Dodge: ${agent.dodgeCooldown > 0 ? `cooldown ${agent.dodgeCooldown} ticks` : 'ready'}

Recent opponent actions:
${formatActionHistory(opponentHistory)}

Opponent behavioral tendencies: ${formatTendencies(tendencies)}

${hpPressure}${roundSummaryStr}

Choose a tactical plan for the next few seconds. You must select a movement pattern, set your momentary aggression level, decide how often to dodge, and specify how to react to opponent behaviors.

Movement patterns:
- approach_direct: Move straight toward opponent
- circle_strafe_left/right: Orbit opponent at ideal range, always moving perpendicular
- hit_and_retreat: Attack, then back off, then reapproach
- dodge_and_counter: Wait for opponent to commit, dodge, then strike during recovery
- rush: Close distance as fast as possible, maximize DPS
- kite: Maintain maximum range, only use ranged attacks, retreat if opponent closes in
- hold_position: Stay in place, only attack when opponent enters range
- feint_approach: Approach confidently, then dodge sideways when close, creating openings
- retreat: Move away from opponent

Respond with exactly one JSON object:
{
  "strategy": "1-2 sentence description of your current tactical thinking",
  "movementPattern": "one of: ${VALID_MOVEMENT_PATTERNS.join(', ')}",
  "primaryMove": "the move you want to use most when in range (e.g. basic_attack, sword_lunge, crossbow, etc.)",
  "dodgeFrequency": 0-100 (how often to attempt dodges: 0=never, 100=dodge every chance),
  "aggressionLevel": 0-100 (momentary aggression: 0=totally passive, 100=all-out attack),
  "reactions": {
    "ifOpponentShields": "one of: ${VALID_REACTION_OPTIONS.join(', ')}",
    "ifOpponentRetreats": "one of: ${VALID_REACTION_OPTIONS.join(', ')}",
    "ifLowHP": "one of: ${VALID_REACTION_OPTIONS.join(', ')}",
    "ifOpponentUsesRanged": "one of: ${VALID_REACTION_OPTIONS.join(', ')}"
  },
  "reasoning": "1-2 sentences explaining your plan"
}`;

  if (errorContext) {
    return prompt + `\n\nIMPORTANT: Your previous plan was invalid: ${errorContext}\nPlease choose a different valid plan.`;
  }

  return prompt;
}

function validateTacticalPlan(parsed: any): TacticalPlan {
  const defaultPlan: TacticalPlan = {
    strategy: 'Adapting to the situation.',
    movementPattern: 'approach_direct',
    primaryMove: 'basic_attack',
    dodgeFrequency: 30,
    aggressionLevel: 50,
    reactions: {
      ifOpponentShields: 'wait',
      ifOpponentRetreats: 'hold',
      ifLowHP: 'retreat',
      ifOpponentUsesRanged: 'dodge_close',
    },
    reasoning: 'Default plan.',
  };

  if (!parsed) return defaultPlan;

  const strategy = typeof parsed.strategy === 'string' ? parsed.strategy.trim() : defaultPlan.strategy;
  const reasoning = typeof parsed.reasoning === 'string' ? parsed.reasoning.trim() : defaultPlan.reasoning;

  const movementPattern = VALID_MOVEMENT_PATTERNS.includes(parsed.movementPattern)
    ? parsed.movementPattern
    : defaultPlan.movementPattern;

  const primaryMove = typeof parsed.primaryMove === 'string' ? parsed.primaryMove.trim().toLowerCase() : defaultPlan.primaryMove;

  const dodgeFrequency = typeof parsed.dodgeFrequency === 'number'
    ? Math.max(0, Math.min(100, Math.round(parsed.dodgeFrequency)))
    : defaultPlan.dodgeFrequency;

  const aggressionLevel = typeof parsed.aggressionLevel === 'number'
    ? Math.max(0, Math.min(100, Math.round(parsed.aggressionLevel)))
    : defaultPlan.aggressionLevel;

  const reactions: TacticalReactions = {
    ifOpponentShields: VALID_REACTION_OPTIONS.includes(parsed.reactions?.ifOpponentShields)
      ? parsed.reactions.ifOpponentShields : defaultPlan.reactions.ifOpponentShields,
    ifOpponentRetreats: VALID_REACTION_OPTIONS.includes(parsed.reactions?.ifOpponentRetreats)
      ? parsed.reactions.ifOpponentRetreats : defaultPlan.reactions.ifOpponentRetreats,
    ifLowHP: VALID_REACTION_OPTIONS.includes(parsed.reactions?.ifLowHP)
      ? parsed.reactions.ifLowHP : defaultPlan.reactions.ifLowHP,
    ifOpponentUsesRanged: VALID_REACTION_OPTIONS.includes(parsed.reactions?.ifOpponentUsesRanged)
      ? parsed.reactions.ifOpponentUsesRanged : defaultPlan.reactions.ifOpponentUsesRanged,
  };

  return {
    strategy,
    movementPattern,
    primaryMove,
    dodgeFrequency,
    aggressionLevel,
    reactions,
    reasoning,
  };
}

export async function getTacticalPlan(
  agent: AgentState,
  opponent: AgentState,
  state: GameState,
  playstyleMemory: string,
  characterDescription: string,
  actionHistory: ActionHistoryEntry[],
  opponentHistory: ActionHistoryEntry[],
  roundSummaries: RoundSummary[],
  errorContext?: string
): Promise<TacticalPlan> {
  const playstyleProfile: PlaystyleProfile | null = playstyleMemory
    ? JSON.parse(playstyleMemory)
    : null;

  const tendencies = analyzeOpponentTendencies(opponentHistory);

  const prompt = buildTacticalPrompt(
    agent, opponent, state, playstyleProfile,
    characterDescription, actionHistory, opponentHistory,
    tendencies, roundSummaries, errorContext
  );

  try {
    console.log(`[LLM] Requesting tactical plan for agent ${agent.id}...`);
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
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`Failed to parse LLM response as JSON: ${raw.slice(0, 100)}`);
    }

    const plan = validateTacticalPlan(parsed);
    console.log(`[LLM] Tactical plan for ${agent.id}: ${plan.movementPattern} / ${plan.primaryMove} / agg:${plan.aggressionLevel} / dodge:${plan.dodgeFrequency}`);
    return plan;
  } catch (err) {
    console.error(`[LLM] Error getting tactical plan for ${agent.id}:`, err);
    return {
      strategy: 'Default strategy due to LLM error.',
      movementPattern: 'approach_direct',
      primaryMove: 'basic_attack',
      dodgeFrequency: 30,
      aggressionLevel: 50,
      reactions: {
        ifOpponentShields: 'wait',
        ifOpponentRetreats: 'hold',
        ifLowHP: 'retreat',
        ifOpponentUsesRanged: 'dodge_close',
      },
      reasoning: 'LLM call failed, defaulting to basic approach.',
    };
  }
}

// Backward compatible: getAgentPlan wraps getTacticalPlan
export async function getAgentPlan(
  agent: AgentState,
  opponent: AgentState,
  state: GameState,
  playstyleMemory: string,
  characterDescription: string,
  errorContext?: string
): Promise<AgentPlan> {
  const tactical = await getTacticalPlan(
    agent, opponent, state, playstyleMemory,
    characterDescription, [], [], [], errorContext
  );

  const planMap: Record<string, 'approach' | 'retreat' | 'attack' | 'defend' | 'idle'> = {
    approach_direct: 'approach',
    circle_strafe_left: 'approach',
    circle_strafe_right: 'approach',
    hit_and_retreat: 'attack',
    dodge_and_counter: 'defend',
    rush: 'attack',
    kite: 'defend',
    hold_position: 'defend',
    feint_approach: 'approach',
    retreat: 'retreat',
  };

  return {
    plan: planMap[tactical.movementPattern] || 'approach',
    preferredMove: tactical.primaryMove,
    reasoning: tactical.reasoning,
  };
}

export async function getAgentAction(
  agent: AgentState,
  opponent: AgentState,
  state: GameState,
  playstyleMemory: string,
  characterDescription: string,
  errorContext?: string
): Promise<AgentAction> {
  const plan = await getAgentPlan(agent, opponent, state, playstyleMemory, characterDescription, errorContext);
  return {
    action: plan.preferredMove,
    reasoning: plan.reasoning,
  };
}

// Coaching Conversation System

export interface CoachingContext {
  agentName: string;
  characterDescription: string;
  money: number;
  ownedMoves: string[];
  ownedBoosts: string[];
  lastRoundResult?: { won: boolean; score: string; notes: string };
  opponentCharacter?: string;
  roundNumber: number;
}

function buildAvailableItemsDescription(ctx: CoachingContext): string {
  const ownedMoves = ctx.ownedMoves
    .map(id => {
      const def = MOVE_CATALOG[id];
      return def ? `${def.name} (${id}) - ${def.description}` : id;
    })
    .join('\n');

  const ownedBoosts = ctx.ownedBoosts
    .map(id => {
      const def = MOVE_CATALOG[id];
      return def ? `${def.name} (${id}) - ${def.description}` : id;
    })
    .join('\n');

  const availableItems = Object.entries(MOVE_CATALOG)
    .filter(([id]) => !ctx.ownedMoves.includes(id) && !ctx.ownedBoosts.includes(id))
    .map(([id, def]) => `${def.name} (${id}) - ${def.cost}g - ${def.description}`)
    .join('\n');

  let desc = `You have ${ctx.money}g in gold.\n`;
  if (ownedMoves) desc += `\nYour combat moves:\n${ownedMoves}`;
  else desc += `\nYou have no combat moves yet (only basic attack).`;
  if (ownedBoosts) desc += `\nYour stat boosts:\n${ownedBoosts}`;
  desc += `\n\nAvailable items in the shop:\n${availableItems}`;
  return desc;
}

function buildOpeningPrompt(ctx: CoachingContext): string {
  const itemsDesc = buildAvailableItemsDescription(ctx);

  let context = '';
  if (ctx.lastRoundResult) {
    const { won, score, notes } = ctx.lastRoundResult;
    context = `Last round: you ${won ? 'WON' : 'LOST'} (${score}). ${notes}\n`;
  }

  return `You are ${ctx.agentName}, ${ctx.characterDescription}. You are speaking to your lord/coach before a battle.

${context}
${itemsDesc}

You are in round ${ctx.roundNumber}. Initiate a conversation with your lord. Ask for guidance on how to fight, referencing your available tools, your gold, and the current situation. Be in character — speak as ${ctx.characterDescription} would.

Keep it to 1-2 sentences. End with a question or request for guidance.

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
  const itemsDesc = buildAvailableItemsDescription(ctx);

  const transcript = conversation
    .map(m => `${m.sender === 'player' ? 'Coach' : 'You'}: ${m.content}`)
    .join('\n');

  return `You are ${ctx.agentName}, ${ctx.characterDescription}. You are in conversation with your lord/coach.

${itemsDesc}

Conversation so far:
${transcript}

Your coach just said: "${playerMessage}"

Respond in character as ${ctx.characterDescription}. Acknowledge what your coach said, show understanding, and if appropriate ask a follow-up question or confirm your understanding. Keep it to 1-3 sentences.

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
  const itemsDesc = buildAvailableItemsDescription(ctx);

  const transcript = conversation
    .map(m => `${m.sender === 'player' ? 'Coach' : 'You'}: ${m.content}`)
    .join('\n');

  return `You are ${ctx.agentName}, ${ctx.characterDescription}. Here is your full coaching conversation with your lord:

${transcript}

${itemsDesc}

Based on this conversation, generate your fighting profile:

1. A 2-3 sentence narrative describing your fighting philosophy — how you think about combat, your priorities, and your mindset.
2. Numeric values (0-100) for these traits:
   - aggressiveness: how aggressively you seek engagement (0=passive, 100=always attacking)
   - risk_tolerance: how willing you are to take damage to deal damage (0=very cautious, 100=reckless)
   - preferred_range: your ideal combat distance (0=melee/close, 100=long range)
   - patience: how long you wait before committing (0=rush in immediately, 100=wait and observe)
   - defensiveness: how much you prioritize defense (0=all offense, 100=all defense)
   - combo_preference: how likely you are to chain abilities together (0=single moves, 100=combos)
3. 2-4 specific behavioral directives — concrete tactics your lord wants you to follow. These should reference your actual available moves and be actionable. Examples: "use crossbow from max range", "wait for opponent to attack first then counter", "dodge frequently and attack during recovery", "circle strafe to the left while using sword lunge".

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
    .filter((e) => e.type === 'attack' || e.type === 'death' || e.type === 'special' || e.type === 'dodge')
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