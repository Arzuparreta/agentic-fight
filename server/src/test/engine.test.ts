import { simulateRound, TacticalSequenceClient } from '../game/engine';
import { AgentConfig } from '../game/state';
import { STUB_SEQUENCE } from './stubSequence';

const stubSequenceClient: TacticalSequenceClient = {
  getSequence: async () => STUB_SEQUENCE,
};

async function runTest() {
  console.log('=== Engine Test: Stub action sequence (no LLM) ===\n');

  const agentA: AgentConfig = {
    id: 'agent-a',
    name: 'Don Rodrigo',
    stats: { maxHp: 200, movementSpeed: 10, attackDamage: 10 },
    moves: ['sword_lunge'],
    playstyleMemory: 'I rush the opponent and strike without hesitation.',
    characterDescription: 'a proud Castilian knight',
  };

  const agentB: AgentConfig = {
    id: 'agent-b',
    name: 'Al-Mansur',
    stats: { maxHp: 200, movementSpeed: 10, attackDamage: 10 },
    moves: [],
    playstyleMemory: 'I engage and destroy my enemies.',
    characterDescription: 'a fierce Moorish warrior',
  };

  const result = await simulateRound(agentA, agentB, stubSequenceClient);

  console.log('\n=== Results ===');
  console.log(`Final tick: ${result.finalTick}`);
  console.log(`Winner: ${result.winnerId || 'draw'}`);
  console.log(`Total events: ${result.eventLog.length}`);
  console.log('Metrics:', JSON.stringify(result.metrics, null, 2));

  console.log('\n=== Event Log (first 30) ===');
  for (const ev of result.eventLog.slice(0, 30)) {
    console.log(`  Tick ${ev.tick} | ${ev.agentId} | ${ev.type} |`, JSON.stringify(ev.payload));
  }

  if (result.eventLog.length > 30) {
    console.log(`  ... and ${result.eventLog.length - 30} more events`);
  }

  console.log('\n=== Reasoning Log (first 5 per agent) ===');
  for (const [agentId, entries] of Object.entries(result.reasoningLog)) {
    console.log(`\n  ${agentId}:`);
    for (const entry of entries.slice(0, 5)) {
      console.log(`    Tick ${entry.tick}: ${entry.action} — "${entry.reasoning}"`);
    }
    if (entries.length > 5) {
      console.log(`    ... and ${entries.length - 5} more entries`);
    }
  }

  const deaths = result.eventLog.filter((e) => e.type === 'death');
  const attacks = result.eventLog.filter((e) => e.type === 'attack');
  const hits = result.eventLog.filter((e) => e.type === 'hit');

  const mA = result.metrics.perAgent['agent-a'];
  const mB = result.metrics.perAgent['agent-b'];
  const idleFrac = (mA.idleTicks + mB.idleTicks) / Math.max(1, mA.totalTicks + mB.totalTicks);

  console.log('\n=== Assertions ===');
  console.log(`Deaths recorded: ${deaths.length} (expected: 1)`);
  console.log(`Attacks recorded: ${attacks.length} (expected: > 0)`);
  console.log(`Hits recorded: ${hits.length} (expected: > 0)`);
  console.log(`Simulation terminated: ${result.finalTick <= 400} (expected: true)`);
  console.log(`Plan fetches (stub): llm=${result.metrics.planFetches.llmSuccess} default=${result.metrics.planFetches.llmDefault}`);
  console.log(`Combined idle fraction: ${idleFrac.toFixed(3)}`);

  if (deaths.length !== 1) {
    console.error('FAIL: Expected exactly 1 death');
    process.exit(1);
  }
  if (attacks.length === 0) {
    console.error('FAIL: Expected at least 1 attack');
    process.exit(1);
  }
  if (hits.length === 0) {
    console.error('FAIL: Expected at least 1 hit');
    process.exit(1);
  }
  if (result.finalTick > 400) {
    console.error('FAIL: Simulation did not terminate within max ticks');
    process.exit(1);
  }
  if (result.metrics.planFetches.llmDefault !== 0) {
    console.error('FAIL: Should not have default/fallback plan fetches');
    process.exit(1);
  }

  console.log('\nPASS: All assertions passed.');
}

runTest().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
