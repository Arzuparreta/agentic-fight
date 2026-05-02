import { simulateRound } from '../game/engine';
async function runRealBenchmark() {
    console.log('=== Real Ollama + Sequence Benchmark ===\n');
    const agentA = {
        id: 'agent-a',
        name: 'Don Rodrigo',
        stats: { maxHp: 200, movementSpeed: 10, attackDamage: 10 },
        moves: ['sword_lunge'],
        playstyleMemory: 'I rush forward and strike without mercy.',
        characterDescription: 'a proud Castilian knight',
    };
    const agentB = {
        id: 'agent-b',
        name: 'Al-Mansur',
        stats: { maxHp: 200, movementSpeed: 10, attackDamage: 10 },
        moves: ['sword_lunge'],
        playstyleMemory: 'I wait for the opponent to overextend, then punish them.',
        characterDescription: 'a fierce Moorish warrior',
    };
    console.log('Starting simulation with REAL Ollama (gemma4:latest)...');
    console.log('This will take approximately 30-60 seconds...\n');
    const start = performance.now();
    const result = await simulateRound(agentA, agentB);
    const end = performance.now();
    const elapsed = end - start;
    const llmCallsA = result.reasoningLog['agent-a'].filter((r, i, arr) => {
        if (i === 0)
            return true;
        return r.reasoning !== arr[i - 1].reasoning;
    }).length;
    const llmCallsB = result.reasoningLog['agent-b'].filter((r, i, arr) => {
        if (i === 0)
            return true;
        return r.reasoning !== arr[i - 1].reasoning;
    }).length;
    const attacks = result.eventLog.filter((e) => e.type === 'attack');
    const hits = result.eventLog.filter((e) => e.type === 'hit' && !e.payload.dodged);
    const dodged = result.eventLog.filter((e) => e.type === 'hit' && e.payload.dodged);
    const deaths = result.eventLog.filter((e) => e.type === 'death');
    const whiffs = result.eventLog.filter((e) => e.type === 'whiff');
    const windups = result.eventLog.filter((e) => e.type === 'windup');
    console.log('\n=== Results ===');
    console.log(`Simulation time: ${(elapsed / 1000).toFixed(1)}s`);
    console.log(`Winner: ${result.winnerId || 'draw'}`);
    console.log(`Final tick: ${result.finalTick}`);
    console.log(`Total events: ${result.eventLog.length}`);
    console.log(`Windups: ${windups.length}`);
    console.log(`Attacks landed: ${attacks.length}`);
    console.log(`Hits (damage): ${hits.length}`);
    console.log(`Hits dodged: ${dodged.length}`);
    console.log(`Whiffs: ${whiffs.length}`);
    console.log(`Deaths: ${deaths.length}`);
    console.log(`LLM calls agent A: ${llmCallsA}`);
    console.log(`LLM calls agent B: ${llmCallsB}`);
    console.log(`Total LLM calls: ${llmCallsA + llmCallsB}`);
    console.log('\n=== Sample Reasoning Log (Agent A, unique only) ===');
    const uniqueA = [];
    for (const entry of result.reasoningLog['agent-a']) {
        const line = `Tick ${entry.tick}: ${entry.action} — "${entry.reasoning}"`;
        if (!uniqueA.includes(line)) {
            uniqueA.push(line);
            if (uniqueA.length <= 15)
                console.log(`  ${line}`);
        }
    }
    console.log('\n=== Sample Reasoning Log (Agent B, unique only) ===');
    const uniqueB = [];
    for (const entry of result.reasoningLog['agent-b']) {
        const line = `Tick ${entry.tick}: ${entry.action} — "${entry.reasoning}"`;
        if (!uniqueB.includes(line)) {
            uniqueB.push(line);
            if (uniqueB.length <= 15)
                console.log(`  ${line}`);
        }
    }
}
runRealBenchmark().catch((err) => {
    console.error('Benchmark failed:', err);
    process.exit(1);
});
//# sourceMappingURL=real-benchmark.js.map