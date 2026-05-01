"use strict";
// Benchmark Gemma 4 with our exact combat prompt
const OLLAMA_URL = 'http://localhost:11434';
const MODEL = 'gemma4:latest';
const TEST_PROMPT = `You are Don Rodrigo, a proud Castilian knight.
How you currently think about fighting: I rush the opponent and strike without hesitation.

Current situation (tick 47 of 600):
- Your position: 340 | Opponent position: 680
- Your HP: 75/100 | Opponent HP: 60/100
- Distance to opponent: 340 units
- Available actions: basic_attack (ready), move_left (ready), move_right (ready), idle (ready)

Respond with exactly one JSON object: { "action": "...", "reasoning": "..." }
Valid actions: move_left, move_right, basic_attack, idle
The reasoning should explain your tactical thinking in one short sentence.`;
async function benchmark() {
    console.log('=== Ollama Benchmark ===');
    console.log(`Model: ${MODEL}`);
    console.log(`URL: ${OLLAMA_URL}\n`);
    // Warm-up call
    console.log('Warming up...');
    await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: MODEL,
            prompt: TEST_PROMPT,
            stream: false,
            format: 'json',
        }),
    });
    const ITERATIONS = 10;
    const times = [];
    console.log(`Running ${ITERATIONS} iterations...\n`);
    for (let i = 0; i < ITERATIONS; i++) {
        const start = performance.now();
        const res = await fetch(`${OLLAMA_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: MODEL,
                prompt: TEST_PROMPT,
                stream: false,
                format: 'json',
            }),
        });
        const end = performance.now();
        if (!res.ok) {
            console.error(`HTTP ${res.status}`);
            continue;
        }
        const data = await res.json();
        const elapsed = end - start;
        times.push(elapsed);
        // Verify JSON validity
        let valid = false;
        try {
            const parsed = JSON.parse(data.response || '{}');
            valid = !!parsed.action;
        }
        catch {
            valid = false;
        }
        console.log(`  Run ${i + 1}: ${elapsed.toFixed(0)}ms | valid JSON: ${valid}`);
    }
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);
    console.log(`\n=== Results ===`);
    console.log(`Average: ${avg.toFixed(0)}ms`);
    console.log(`Min: ${min.toFixed(0)}ms`);
    console.log(`Max: ${max.toFixed(0)}ms`);
    // Project round duration
    const TICKS_PER_ROUND = 600;
    const CALLS_PER_ROUND = TICKS_PER_ROUND * 2; // 2 agents
    const SEC_PER_ROUND = (avg * CALLS_PER_ROUND) / 1000;
    const MIN_PER_ROUND = SEC_PER_ROUND / 60;
    console.log(`\n=== Round Time Projection ===`);
    console.log(`Ticks per round: ${TICKS_PER_ROUND}`);
    console.log(`LLM calls per round: ${CALLS_PER_ROUND}`);
    console.log(`Estimated time per round: ${SEC_PER_ROUND.toFixed(0)}s (${MIN_PER_ROUND.toFixed(1)} min)`);
    if (MIN_PER_ROUND > 2) {
        console.log(`\n⚠️  WARNING: ${MIN_PER_ROUND.toFixed(1)} minutes per round is slow.`);
        console.log(`Recommendation: Reduce LLM calls by planning every N ticks instead of every tick.`);
    }
}
benchmark().catch((err) => {
    console.error('Benchmark failed:', err);
    process.exit(1);
});
//# sourceMappingURL=benchmark.js.map