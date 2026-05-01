import { getAvailableMoves, MOVE_CATALOG } from '@shared/index';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma4:latest';
// ------------------------------------------------------------------
// Combat Planning (called during simulation)
// ------------------------------------------------------------------
function buildCombatPrompt(agent, opponent, state, playstyleProfile, characterDescription, errorContext) {
    const available = getAvailableMoves(agent)
        .map((m) => {
        const cd = agent.cooldowns[m] ?? 0;
        return cd > 0 ? `${m} (cooldown: ${cd})` : `${m} (ready)`;
    })
        .join(', ');
    const dist = euclideanDistance(agent.position, opponent.position);
    let narrative = 'I fight to win, adapting to the situation as it unfolds.';
    let directives = '';
    if (playstyleProfile) {
        narrative = playstyleProfile.narrative;
        directives = playstyleProfile.directives.length > 0
            ? `\nYour specific tactical directives: ${playstyleProfile.directives.join('; ')}.`
            : '';
    }
    const prompt = `You are ${agent.name}, ${characterDescription}.
How you currently think about fighting: ${narrative}${directives}

Current situation (tick ${state.tick} of ${state.maxTicks}):
- Your position: (${agent.position.x}, ${agent.position.y}) | Opponent position: (${opponent.position.x}, ${opponent.position.y})
- Your HP: ${agent.hp}/${agent.maxHp} | Opponent HP: ${opponent.hp}/${opponent.maxHp}
- Distance to opponent: ${dist.toFixed(0)} units
- Available moves: ${available}

You are about to make a tactical plan for the next few seconds of combat. Choose a high-level strategy and a preferred move to use when the opportunity arises.

IMPORTANT: You can move (move_left, move_right, move_up, move_down) even while your attacks are on cooldown. Repositioning — closing distance, creating space, or flanking — is often the key to victory. Do not just stand still waiting for cooldowns.

Respond with exactly one JSON object: { "plan": "...", "preferredMove": "...", "reasoning": "..." }
Valid plans: approach (get closer), retreat (create distance), attack (close in and strike), defend (hold position and counter), idle (wait)
Valid preferred moves: basic_attack${agent.moves.length > 0 ? ', ' + agent.moves.join(', ') : ''}, move_left, move_right, move_up, move_down, idle
The reasoning should explain your tactical thinking in one short sentence.`;
    if (errorContext) {
        return prompt + `\n\nIMPORTANT: Your previous plan was invalid: ${errorContext}\nPlease choose a different valid plan.`;
    }
    return prompt;
}
function euclideanDistance(a, b) {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}
export async function getAgentPlan(agent, opponent, state, playstyleMemory, characterDescription, errorContext) {
    const playstyleProfile = playstyleMemory
        ? JSON.parse(playstyleMemory)
        : null;
    const prompt = buildCombatPrompt(agent, opponent, state, playstyleProfile, characterDescription, errorContext);
    try {
        const res = await fetch(`${OLLAMA_URL}/api/generate`, {
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
        const parsed = JSON.parse(raw);
        if (!parsed.plan) {
            throw new Error('LLM response missing plan field');
        }
        return {
            plan: parsed.plan.trim().toLowerCase(),
            preferredMove: parsed.preferredMove?.trim().toLowerCase() || 'basic_attack',
            reasoning: parsed.reasoning || 'No reasoning provided.',
        };
    }
    catch (err) {
        console.error(`Ollama error for agent ${agent.id}:`, err);
        return { plan: 'approach', preferredMove: 'basic_attack', reasoning: 'LLM call failed, defaulting to approach.' };
    }
}
export async function getAgentAction(agent, opponent, state, playstyleMemory, characterDescription, errorContext) {
    const plan = await getAgentPlan(agent, opponent, state, playstyleMemory, characterDescription, errorContext);
    return {
        action: plan.preferredMove,
        reasoning: plan.reasoning,
    };
}
function buildAvailableItemsDescription(ctx) {
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
    if (ownedMoves)
        desc += `\nYour combat moves:\n${ownedMoves}`;
    else
        desc += `\nYou have no combat moves yet (only basic attack).`;
    if (ownedBoosts)
        desc += `\nYour stat boosts:\n${ownedBoosts}`;
    desc += `\n\nAvailable items in the shop:\n${availableItems}`;
    return desc;
}
function buildOpeningPrompt(ctx) {
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
export async function generateAgentOpeningMessage(ctx) {
    const prompt = buildOpeningPrompt(ctx);
    try {
        const res = await fetch(`${OLLAMA_URL}/api/generate`, {
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
        const parsed = JSON.parse(raw);
        const message = parsed.message?.trim();
        if (!message) {
            throw new Error('LLM response missing message field');
        }
        return message;
    }
    catch (err) {
        console.error('Ollama error generating opening message:', err);
        return `My lord, I await your counsel. How shall I fight?`;
    }
}
function buildResponsePrompt(ctx, conversation, playerMessage) {
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
export async function generateAgentResponse(ctx, conversation, playerMessage) {
    const prompt = buildResponsePrompt(ctx, conversation, playerMessage);
    try {
        const res = await fetch(`${OLLAMA_URL}/api/generate`, {
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
        const parsed = JSON.parse(raw);
        const message = parsed.message?.trim();
        if (!message) {
            throw new Error('LLM response missing message field');
        }
        return message;
    }
    catch (err) {
        console.error('Ollama error generating agent response:', err);
        `I understand, my lord. I shall fight as you command.`;
        return `I understand, my lord. I shall fight as you command.`;
    }
}
function buildSynthesisPrompt(ctx, conversation) {
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
3. 2-4 specific behavioral directives — concrete tactics your lord wants you to follow. These should reference your actual available moves and be actionable.

Respond with exactly one JSON object:
{ "narrative": "...", "parameters": { "aggressiveness": 50, "risk_tolerance": 50, "preferred_range": 50, "patience": 50, "defensiveness": 50, "combo_preference": 50 }, "directives": ["...", "..."] }`;
}
export async function synthesizePlaystyle(ctx, conversation) {
    const prompt = buildSynthesisPrompt(ctx, conversation);
    try {
        const res = await fetch(`${OLLAMA_URL}/api/generate`, {
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
        const parsed = JSON.parse(raw);
        const narrative = parsed.narrative?.trim();
        if (!narrative) {
            throw new Error('LLM response missing narrative field');
        }
        const defaults = {
            aggressiveness: 50,
            risk_tolerance: 50,
            preferred_range: 50,
            patience: 50,
            defensiveness: 50,
            combo_preference: 50,
        };
        const parameters = {
            aggressiveness: clamp(parsed.parameters?.aggressiveness ?? 50, 0, 100),
            risk_tolerance: clamp(parsed.parameters?.risk_tolerance ?? 50, 0, 100),
            preferred_range: clamp(parsed.parameters?.preferred_range ?? 50, 0, 100),
            patience: clamp(parsed.parameters?.patience ?? 50, 0, 100),
            defensiveness: clamp(parsed.parameters?.defensiveness ?? 50, 0, 100),
            combo_preference: clamp(parsed.parameters?.combo_preference ?? 50, 0, 100),
        };
        const directives = parsed.directives?.filter(d => d.trim().length > 0).slice(0, 4) ?? [];
        return { narrative, parameters, directives };
    }
    catch (err) {
        console.error('Ollama error synthesizing playstyle:', err);
        return {
            narrative: 'I fight to win, adapting to the situation.',
            parameters: { aggressiveness: 50, risk_tolerance: 50, preferred_range: 50, patience: 50, defensiveness: 50, combo_preference: 50 },
            directives: [],
        };
    }
}
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
//# sourceMappingURL=ollama.js.map