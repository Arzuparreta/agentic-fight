import { simulateRound } from '../game/engine';
const dummyPlanClient = {
    getPlan: async (agent, opponent) => {
        const dx = agent.position.x - opponent.position.x;
        const dy = agent.position.y - opponent.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const onCooldown = (agent.cooldowns['basic_attack'] ?? 0) > 0;
        if (dist <= 80 && !onCooldown) {
            return { plan: 'attack', preferredMove: 'basic_attack', reasoning: 'In range, striking!' };
        }
        if (dist <= 80 && onCooldown) {
            return { plan: 'approach', preferredMove: 'basic_attack', reasoning: 'In range but on cooldown, holding position.' };
        }
        return { plan: 'approach', preferredMove: 'basic_attack', reasoning: 'Closing the distance.' };
    },
};
async function runTest() {
    console.log('=== Engine Test: Smart Dummy Agents ===\n');
    const agentA = {
        id: 'agent-a',
        name: 'Don Rodrigo',
        stats: { maxHp: 150, movementSpeed: 3, attackDamage: 8 },
        moves: [],
        playstyleMemory: 'I rush the opponent and strike without hesitation.',
        characterDescription: 'a proud Castilian knight',
    };
    const agentB = {
        id: 'agent-b',
        name: 'Al-Mansur',
        stats: { maxHp: 150, movementSpeed: 3, attackDamage: 8 },
        moves: [],
        playstyleMemory: 'I engage and destroy my enemies.',
        characterDescription: 'a fierce Moorish warrior',
    };
    const result = await simulateRound(agentA, agentB, dummyPlanClient);
    console.log('\n=== Results ===');
    console.log(`Final tick: ${result.finalTick}`);
    console.log(`Winner: ${result.winnerId || 'draw'}`);
    console.log(`Total events: ${result.eventLog.length}`);
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
    console.log('\n=== Assertions ===');
    console.log(`Deaths recorded: ${deaths.length} (expected: 1)`);
    console.log(`Attacks recorded: ${attacks.length} (expected: > 0)`);
    console.log(`Hits recorded: ${hits.length} (expected: > 0)`);
    console.log(`Simulation terminated: ${result.finalTick <= 600} (expected: true)`);
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
    if (result.finalTick > 600) {
        console.error('FAIL: Simulation did not terminate within max ticks');
        process.exit(1);
    }
    console.log('\nPASS: All assertions passed.');
}
runTest().catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
});
//# sourceMappingURL=engine.test.js.map