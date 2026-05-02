/** Deterministic PRNG from agent id + tick + salt — replaces Math.random() for combat continuity. */
/** Uniform [0, 1) derived from agent + tick + salt (different salts = independent streams). */
export declare function tickRand(agentId: string, tick: number, salt: number): number;
//# sourceMappingURL=rng.d.ts.map