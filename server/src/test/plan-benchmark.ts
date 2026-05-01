import { simulateRound, PlanClient } from '../game/engine';
import { AgentConfig } from '../game/state';

const dummyPlanClient: PlanClient = {
  getPlan: async (agent, opponent) => {
    const dist = Math.abs(agent.position - opponent.position);
    const onCooldown = (agent.cooldowns['basic_attack'] ?? 0) > 0;

    if (dist <= 80 && !onCooldown) {
      return { plan: 'attack', preferredMove: 'basic_attack', reasoning: 'In range!' };
    }

    if (dist <= 80 && onCooldown) {
      return { plan: 'approach', preferredMove: 'basic_attack', reasoning: 'In range but on cooldown.' };
    }

    return { plan: 'approach', preferredMove: 'basic_attack', reasoning: 'Closing distance.' };
  },
};

async function runBenchmark() {
  console.log('=== Planning Interval Benchmark ===\n');

  const agentA: AgentConfig = {
    id: 'agent-a',
    name: 'Don Rodrigo',
    stats: { maxHp: 150, movementSpeed: 3, attackDamage: 8 },
    moves: [],
    playstyleMemory: 'I rush forward and strike without mercy.',
    characterDescription: 'a proud Castilian knight',
  };

  const agentB: AgentConfig = {
    id: 'agent-b',
    name: 'Al-Mansur',
    stats: { maxHp: 150, movementSpeed: 3, attackDamage: 8 },
    moves: [],
    playstyleMemory: 'I wait for the opponent to overextend, then punish them.',
    characterDescription: 'a fierce Moorish warrior',
  };

  const start = performance.now();
  const result = await simulateRound(agentA, agentB, dummyPlanClient);
  const end = performance.now();

  const elapsed = end - start;
  const llmCallsA = result.reasoningLog['agent-a'].filter((r, i, arr) => {
    // Count unique plan changes (reasoning changes significantly)
    if (i === 0) return true;
    return r.reasoning !== arr[i - 1].reasoning;
  }).length;

  const llmCallsB = result.reasoningLog['agent-b'].filter((r, i, arr) => {
    if (i === 0) return true;
    return r.reasoning !== arr[i - 1].reasoning;
  }).length;

  console.log(`Simulation time: ${elapsed.toFixed(0)}ms`);
  console.log(`Winner: ${result.winnerId || 'draw'}`);
  console.log(`Final tick: ${result.finalTick}`);
  console.log(`Total events: ${result.eventLog.length}`);
  console.log(`LLM calls agent A: ${llmCallsA}`);
  console.log(`LLM calls agent B: ${llmCallsB}`);
  console.log(`Total LLM calls: ${llmCallsA + llmCallsB}`);
  console.log(`Events per tick: ${(result.eventLog.length / result.finalTick).toFixed(2)}`);

  if (result.finalTick > 600) {
    console.error('FAIL: Did not terminate');
    process.exit(1);
  }

  console.log('\nPASS: Planning interval benchmark complete.');
}

runBenchmark().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
