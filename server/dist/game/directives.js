const PATTERN_KEYWORDS = {
    'aggressive': ['rush', 'feint_approach'],
    'aggress': ['rush', 'feint_approach'],
    'rush': ['rush'],
    'charge': ['rush'],
    'defensive': ['hold_position', 'dodge_and_counter'],
    'defend': ['hold_position', 'dodge_and_counter'],
    'passive': ['hold_position'],
    'wait': ['dodge_and_counter'],
    'counter': ['dodge_and_counter'],
    'kite': ['kite'],
    'range': ['kite'],
    'ranged': ['kite'],
    'circle': ['circle_strafe_left', 'circle_strafe_right'],
    'strafe': ['circle_strafe_left', 'circle_strafe_right'],
    'hit and run': ['hit_and_retreat'],
    'hit-and-run': ['hit_and_retreat'],
    'retreat': ['retreat'],
    'flee': ['retreat'],
    'feint': ['feint_approach'],
    'bait': ['feint_approach'],
    'approach': ['approach_direct'],
    'direct': ['approach_direct'],
};
const REACTION_KEYWORDS = {
    'block': { ifOpponentShields: 'wait' },
    'raise shield': { ifOpponentShields: 'shield' },
    'ranged attack': { ifOpponentUsesRanged: 'dodge_close' },
    'close distance': { ifOpponentUsesRanged: 'rush' },
    'chase': { ifOpponentRetreats: 'rush' },
    'pursue': { ifOpponentRetreats: 'rush' },
    'let them come': { ifOpponentRetreats: 'hold' },
    'last stand': { ifLowHP: 'berserk' },
    'berserk': { ifLowHP: 'berserk' },
    'survive': { ifLowHP: 'retreat' },
    'survival': { ifLowHP: 'retreat' },
    'dodge': { ifOpponentUsesRanged: 'dodge_close' },
    'dodge and counter': { ifLowHP: 'dodge_close', ifOpponentUsesRanged: 'dodge_close' },
    'wait for opening': { ifOpponentShields: 'wait', ifOpponentRetreats: 'hold' },
    'poke': { ifOpponentShields: 'use_ranged', ifOpponentRetreats: 'hold' },
    'all-in': { ifLowHP: 'berserk', ifOpponentRetreats: 'rush' },
    'safe': { ifLowHP: 'retreat', ifOpponentShields: 'wait' },
};
const RANGE_KEYWORDS = {
    'close range': 10,
    'melee': 15,
    'short range': 20,
    'mid range': 50,
    'medium range': 50,
    'long range': 85,
    'far': 90,
    'distance': 85,
    'crossbow range': 90,
    'ballesta': 90,
};
const MOVE_KEYWORDS = {
    'crossbow': 'crossbow',
    'ballesta': 'crossbow',
    'sword lunge': 'sword_lunge',
    'estocada': 'sword_lunge',
    'lunge': 'sword_lunge',
    'shield': 'shield_block',
    'escudo': 'shield_block',
    'war cry': 'war_cry',
    'grito': 'war_cry',
    'curse': 'inquisitor_curse',
    'maldicion': 'inquisitor_curse',
    'basic attack': 'basic_attack',
    'ataque basico': 'basic_attack',
};
export function parseDirectives(directives) {
    const parsed = [];
    for (const directive of directives) {
        const lower = directive.toLowerCase();
        const pd = { description: directive };
        for (const [keyword, patterns] of Object.entries(PATTERN_KEYWORDS)) {
            if (lower.includes(keyword)) {
                pd.movementPatternOverride = patterns[0];
                break;
            }
        }
        for (const [keyword, range] of Object.entries(RANGE_KEYWORDS)) {
            if (lower.includes(keyword)) {
                pd.preferredRangeOverride = range;
                break;
            }
        }
        for (const [keyword, move] of Object.entries(MOVE_KEYWORDS)) {
            if (lower.includes(keyword)) {
                pd.primaryMoveOverride = move;
                break;
            }
        }
        const dodgeMatch = lower.match(/dodg(?:e|ing)\s*(?:more|frequently|often|a lot)/i);
        if (dodgeMatch) {
            pd.dodgeFrequencyOverride = 80;
        }
        else if (lower.includes('dodge')) {
            pd.dodgeFrequencyOverride = 60;
        }
        if (lower.includes('aggressiv') || lower.includes('all-in') || lower.includes('no fear') || lower.includes('reckless')) {
            pd.aggressionOverride = 90;
        }
        else if (lower.includes('cautious') || lower.includes('careful') || lower.includes('safe')) {
            pd.aggressionOverride = 25;
        }
        for (const [keyword, reactions] of Object.entries(REACTION_KEYWORDS)) {
            if (lower.includes(keyword)) {
                pd.reactionsOverride = { ...pd.reactionsOverride, ...reactions };
            }
        }
        parsed.push(pd);
    }
    return parsed;
}
export function mergeDirectivesIntoPlan(plan, directives) {
    let merged = { ...plan };
    for (const d of directives) {
        if (d.movementPatternOverride !== undefined) {
            merged.movementPattern = d.movementPatternOverride;
        }
        if (d.preferredRangeOverride !== undefined) {
            // Adjust aggression/aggression based on range override
            merged.aggressionLevel = d.preferredRangeOverride > 60
                ? Math.min(merged.aggressionLevel, 40)
                : Math.max(merged.aggressionLevel, 60);
        }
        if (d.primaryMoveOverride !== undefined) {
            merged.primaryMove = d.primaryMoveOverride;
        }
        if (d.dodgeFrequencyOverride !== undefined) {
            merged.dodgeFrequency = Math.max(merged.dodgeFrequency, d.dodgeFrequencyOverride);
        }
        if (d.aggressionOverride !== undefined) {
            merged.aggressionLevel = d.aggressionOverride;
        }
        if (d.reactionsOverride !== undefined) {
            merged.reactions = { ...merged.reactions, ...d.reactionsOverride };
        }
    }
    return merged;
}
//# sourceMappingURL=directives.js.map