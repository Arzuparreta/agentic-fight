import { simulateRound } from '../game/engine';
import { STUB_TACTICAL_PLAN } from './stubTacticalPlan';
const stubPlanClient = {
    getPlan: async () => STUB_TACTICAL_PLAN,
};
async function runBenchmark() {
    console.log('=== Planning Interval Benchmark ===\n');
    const agentA = {
        id: 'agent-a',
        name: 'Don Rodrigo',
        stats: { maxHp: 150, movementSpeed: 3, attackDamage: 8 },
        moves: [],
        playstyleMemory: 'I rush forward and strike without mercy.',
        characterDescription: 'a proud Castilian knight',
    };
    const agentB = {
        id: 'agent-b',
        name: 'Al-Mansur',
        stats: { maxHp: 150, movementSpeed: 3, attackDamage: 8 },
        moves: [],
        playstyleMemory: 'I wait for the opponent to overextend, then punish them.',
        characterDescription: 'a fierce Moorish warrior',
    };
    const start = performance.now();
    const result = await simulateRound(agentA, agentB, stubPlanClient);
    const end = performance.now();
    const elapsed = end - start;
    const llmCallsA = result.reasoningLog['agent-a'].filter((r, i, arr) => {
        // Count unique plan changes (reasoning changes significantly)
        if (i === 0)
            return true;
        return r.reasoning !== arr[i - 1].reasoning;
    }).length;
    const llmCallsB = result.reasoningLog['agent-b'].filter((r, i, arr) => {
        if (i === 0)
            return true;
        return r.reasoning !== arr[i - 1].reasoning;
    }).length;
    console.log(`Simulation time: ${elapsed.toFixed(0)}ms`);
    console.log(`Winner: ${result.winnerId || 'draw'}`);
    console.log(`Final tick: ${result.finalTick}`);
    console.log(`Total events: ${result.eventLog.length}`);
    console.log(`Idle ticks A/B: ${result.metrics.perAgent['agent-a'].idleTicks}/${result.metrics.perAgent['agent-a'].totalTicks} — ${result.metrics.perAgent['agent-b'].idleTicks}/${result.metrics.perAgent['agent-b'].totalTicks}`);
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
//# sourceMappingURL=plan-benchmark.js.map