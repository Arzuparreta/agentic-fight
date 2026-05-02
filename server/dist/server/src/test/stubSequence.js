/** Deterministic action sequence for benchmarks/tests without LLM. */
export const STUB_SEQUENCE = {
    strategy: 'Stub sequence for deterministic simulation.',
    actions: [
        { macro: 'approach', duration: 20 },
        { macro: 'attack', moveId: 'sword_lunge' },
        { macro: 'circle_left', duration: 15 },
        { macro: 'attack', moveId: 'sword_lunge' },
    ],
    interruptConditions: ['opponent_winding_up'],
    reasoning: 'stub',
};
//# sourceMappingURL=stubSequence.js.map