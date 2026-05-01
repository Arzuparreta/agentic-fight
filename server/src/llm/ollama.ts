import { AgentState, GameState, getAvailableMoves } from '@shared/index';

export interface AgentAction {
  action: string;
  reasoning: string;
}

export interface AgentPlan {
  plan: 'approach' | 'retreat' | 'attack' | 'defend' | 'idle';
  preferredMove: string; // which move to use when in range
  reasoning: string;
}

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma4:latest';

function buildCombatPrompt(
  agent: AgentState,
  opponent: AgentState,
  state: GameState,
  playstyleMemory: string,
  characterDescription: string,
  errorContext?: string
): string {
  const available = getAvailableMoves(agent)
    .map((m) => {
      const cd = agent.cooldowns[m] ?? 0;
      return cd > 0 ? `${m} (cooldown: ${cd})` : `${m} (ready)`;
    })
    .join(', ');

  let prompt = `You are ${agent.name}, ${characterDescription}.
How you currently think about fighting: ${playstyleMemory || 'I fight to win, adapting to the situation as it unfolds.'}

Current situation (tick ${state.tick} of ${state.maxTicks}):
- Your position: ${agent.position} | Opponent position: ${opponent.position}
- Your HP: ${agent.hp}/${agent.maxHp} | Opponent HP: ${opponent.hp}/${opponent.maxHp}
- Distance to opponent: ${Math.abs(agent.position - opponent.position)} units
- Available moves: ${available}

You are about to make a tactical plan for the next few seconds of combat. Choose a high-level strategy and a preferred move to use when the opportunity arises.

IMPORTANT: You can move (move_left, move_right) even while your attacks are on cooldown. Repositioning — closing distance, creating space, or flanking — is often the key to victory. Do not just stand still waiting for cooldowns.

Respond with exactly one JSON object: { "plan": "...", "preferredMove": "...", "reasoning": "..." }
Valid plans: approach (get closer), retreat (create distance), attack (close in and strike), defend (hold position and counter), idle (wait)
Valid preferred moves: basic_attack${agent.moves.length > 0 ? ', ' + agent.moves.join(', ') : ''}, move_left, move_right, idle
The reasoning should explain your tactical thinking in one short sentence.`;

  if (errorContext) {
    prompt += `\n\nIMPORTANT: Your previous plan was invalid: ${errorContext}\nPlease choose a different valid plan.`;
  }

  return prompt;
}

export async function getAgentPlan(
  agent: AgentState,
  opponent: AgentState,
  state: GameState,
  playstyleMemory: string,
  characterDescription: string,
  errorContext?: string
): Promise<AgentPlan> {
  const prompt = buildCombatPrompt(agent, opponent, state, playstyleMemory, characterDescription, errorContext);

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
    const parsed = JSON.parse(raw) as AgentPlan;

    if (!parsed.plan) {
      throw new Error('LLM response missing plan field');
    }

    return {
      plan: parsed.plan.trim().toLowerCase() as AgentPlan['plan'],
      preferredMove: parsed.preferredMove?.trim().toLowerCase() || 'basic_attack',
      reasoning: parsed.reasoning || 'No reasoning provided.',
    };
  } catch (err) {
    console.error(`Ollama error for agent ${agent.id}:`, err);
    return { plan: 'approach', preferredMove: 'basic_attack', reasoning: 'LLM call failed, defaulting to approach.' };
  }
}

// Legacy single-action interface for tests
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

// ------------------------------------------------------------------
// Playstyle Memory Update
// ------------------------------------------------------------------

export interface CoachingMessage {
  sender: 'player' | 'agent';
  content: string;
}

function buildMemoryPrompt(
  previousMemory: string,
  characterDescription: string,
  coachingMessages: CoachingMessage[]
): string {
  const transcript = coachingMessages
    .map((m) => `${m.sender === 'player' ? 'Coach' : 'You'}: ${m.content}`)
    .join('\n');

  return `You are ${characterDescription}. Your coach has just spoken to you before an upcoming battle.

${previousMemory ? `How you previously thought about fighting:\n${previousMemory}\n` : 'You have no prior fighting philosophy — this is your first battle.'}

Conversation with your coach:
${transcript}

Update your personal fighting philosophy based on this conversation. Write 2-3 sentences max. Be specific about tactics, priorities, and when to use moves. This is your inner monologue — how you think about fighting. Respond with exactly one JSON object: { "memory": "..." }`;
}

export async function updatePlaystyleMemory(
  previousMemory: string,
  characterDescription: string,
  coachingMessages: CoachingMessage[]
): Promise<string> {
  const prompt = buildMemoryPrompt(previousMemory, characterDescription, coachingMessages);

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
    const parsed = JSON.parse(raw) as { memory?: string };

    const memory = parsed.memory?.trim();
    if (!memory) {
      throw new Error('LLM response missing memory field');
    }

    return memory;
  } catch (err) {
    console.error('Ollama error updating playstyle memory:', err);
    return previousMemory;
  }
}
