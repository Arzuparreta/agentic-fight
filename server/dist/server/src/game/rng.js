/** Deterministic PRNG from agent id + tick + salt — replaces Math.random() for combat continuity. */
function hashString(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}
function mulberry32(seed) {
    return function () {
        let a = seed | 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
/** Uniform [0, 1) derived from agent + tick + salt (different salts = independent streams). */
export function tickRand(agentId, tick, salt) {
    const seed = (hashString(agentId) ^ Math.imul(tick, 2654435761) ^ Math.imul(salt, 1597334677)) >>> 0;
    return mulberry32(seed)();
}
//# sourceMappingURL=rng.js.map