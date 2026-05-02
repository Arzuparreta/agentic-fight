export interface Vec2 {
    x: number;
    y: number;
}
export type MovementAction = 'move_left' | 'move_right' | 'move_up' | 'move_down' | 'move_up_left' | 'move_up_right' | 'move_down_left' | 'move_down_right';
export type DodgeDirection = 'dodge_left' | 'dodge_right' | 'dodge_up' | 'dodge_down' | 'dodge_up_left' | 'dodge_up_right' | 'dodge_down_left' | 'dodge_down_right';
export interface StatusEffect {
    id: string;
    type: 'damage_reduction' | 'damage_boost' | 'cooldown_slow';
    value: number;
    remainingTicks: number;
}
export interface PlaystyleParameters {
    aggressiveness: number;
    risk_tolerance: number;
    preferred_range: number;
    patience: number;
    defensiveness: number;
    combo_preference: number;
}
export interface PlaystyleProfile {
    narrative: string;
    parameters: PlaystyleParameters;
    directives: string[];
}
export interface AgentState {
    id: string;
    name: string;
    position: Vec2;
    hp: number;
    maxHp: number;
    stats: Stats;
    cooldowns: Record<string, number>;
    moves: string[];
    statusEffects: StatusEffect[];
    status: 'alive' | 'dead';
    dodgeCooldown: number;
    invincibleUntilTick: number;
    isDodging: boolean;
    dodgeDirection: DodgeDirection | null;
    facingAngle: number;
}
export interface GameState {
    tick: number;
    maxTicks: number;
    agents: Record<string, AgentState>;
    eventLog: SimEvent[];
}
export interface SimEvent {
    tick: number;
    agentId: string;
    type: 'move' | 'attack' | 'special' | 'hit' | 'death' | 'idle' | 'dodge' | 'move_diagonal';
    payload: Record<string, unknown>;
}
export interface Stats {
    movementSpeed: number;
    attackDamage: number;
    maxHp: number;
}
export interface CoachingMessage {
    sender: 'player' | 'agent';
    content: string;
    timestamp: number;
}
export interface RoomPlayer {
    id: string;
    socketId: string;
    role: 'browser' | 'mobile';
    agentName: string;
    characterDescription: string;
    stats: Stats;
    moves: string[];
    money: number;
    coachingMessages: CoachingMessage[];
    playstyleMemory: string;
    playstyleProfile: PlaystyleProfile | null;
    ready: boolean;
    roundSummaries: RoundSummary[];
}
export interface Message {
    sender: 'player' | 'agent';
    content: string;
    timestamp: number;
}
export interface DisconnectState {
    disconnectedAt: number;
    timer: ReturnType<typeof setTimeout>;
}
export interface Room {
    id: string;
    phase: 'lobby' | 'coaching' | 'simulating' | 'playback' | 'shop' | 'ended';
    players: Record<string, RoomPlayer>;
    socketToPlayer: Record<string, string>;
    currentRound: number;
    eventLog: SimEvent[];
    roundHistory: RoundResult[];
    disconnects: Record<string, DisconnectState>;
    economy: {
        money: Record<string, number>;
        consecutiveLosses: Record<string, number>;
    };
    wins: Record<string, number>;
}
export interface RoundResult {
    roundNumber: number;
    winnerId: string | null;
    agentA: {
        id: string;
        hpRemaining: number;
    };
    agentB: {
        id: string;
        hpRemaining: number;
    };
    earnings: Record<string, number>;
}
export interface ActionHistoryEntry {
    tick: number;
    agentId: string;
    action: string;
    position: Vec2;
    hp: number;
    maxHp: number;
    distance: number;
    statusEffects: string[];
}
export interface OpponentTendencies {
    preferredMoves: Record<string, number>;
    dodgeFrequency: number;
    approachRetreatRatio: number;
    comboUsage: number;
    averageDistance: number;
    shieldUsage: number;
}
export interface RoundSummary {
    roundNumber: number;
    won: boolean;
    keyEvents: string[];
    opponentTendencies: OpponentTendencies;
    whatWorked: string[];
    whatDidNotWork: string[];
}
export type MovementPattern = 'approach_direct' | 'circle_strafe_left' | 'circle_strafe_right' | 'hit_and_retreat' | 'dodge_and_counter' | 'rush' | 'kite' | 'hold_position' | 'feint_approach' | 'retreat';
export type ReactionKey = 'ifOpponentShields' | 'ifOpponentRetreats' | 'ifLowHP' | 'ifOpponentUsesRanged';
export type ReactionOption = 'retreat' | 'rush' | 'use_ranged' | 'wait' | 'dodge_close' | 'hold' | 'berserk' | 'shield' | 'kite';
export interface TacticalReactions {
    ifOpponentShields: ReactionOption;
    ifOpponentRetreats: ReactionOption;
    ifLowHP: ReactionOption;
    ifOpponentUsesRanged: ReactionOption;
}
export interface TacticalPlan {
    strategy: string;
    movementPattern: MovementPattern;
    primaryMove: string;
    dodgeFrequency: number;
    aggressionLevel: number;
    reactions: TacticalReactions;
    reasoning: string;
}
export interface ParsedDirective {
    preferredRangeOverride?: number;
    primaryMoveOverride?: string;
    movementPatternOverride?: MovementPattern;
    dodgeFrequencyOverride?: number;
    aggressionOverride?: number;
    reactionsOverride?: Partial<TacticalReactions>;
    description: string;
}
//# sourceMappingURL=types.d.ts.map