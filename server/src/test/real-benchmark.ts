import { simulateRound } from '../game/engine';
import { AgentConfig } from '../game/state';

async function runRealBenchmark() {
  console.log('=== Real Ollama + Planning Interval Benchmark ===\n');

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

  console.log('Starting simulation with REAL Ollama (gemma4:latest)...');
  console.log('This will take approximately 40-60 seconds...\n');

  const start = performance.now();
  const result = await simulateRound(agentA, agentB);
  const end = performance.now();

  const elapsed = end - start;

  // Count LLM calls by looking for unique reasoning entries
  const llmCallsA = result.reasoningLog['agent-a'].filter((r, i, arr) => {
    if (i === 0) return true;
    return r.reasoning !== arr[i - 1].reasoning;
  }).length;

  const llmCallsB = result.reasoningLog['agent-b'].filter((r, i, arr) => {
    if (i === 0) return true;
    return r.reasoning !== arr[i - 1].reasoning;
  }).length;

  console.log('\n=== Results ===');
  console.log(`Simulation time: ${(elapsed / 1000).toFixed(1)}s`);
  console.log(`Winner: ${result.winnerId || 'draw'}`);
  console.log(`Final tick: ${result.finalTick}`);
  console.log(`Total events: ${result.eventLog.length}`);
  console.log(`LLM calls agent A: ${llmCallsA}`);
  console.log(`LLM calls agent B: ${llmCallsB}`);
  console.log(`Total LLM calls: ${llmCallsA + llmCallsB}`);

  console.log('\n=== Sample Reasoning Log (Agent A) ===');
  for (const entry of result.reasoningLog['agent-a'].slice(0, 10)) {
    console.log(`  Tick ${entry.tick}: ${entry.action} — "${entry.reasoning}"`);
  }

  console.log('\n=== Sample Reasoning Log (Agent B) ===');
  for (const entry of result.reasoningLog['agent-b'].slice(0, 10)) {
    console.log(`  Tick ${entry.tick}: ${entry.action} — "${entry.reasoning}"`);
  }
}

runRealBenchmark().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
