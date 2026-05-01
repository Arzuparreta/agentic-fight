export interface Vec2 {
  x: number;
  y: number;
}

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
  type: 'move' | 'attack' | 'special' | 'hit' | 'death' | 'idle';
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
  agentA: { id: string; hpRemaining: number };
  agentB: { id: string; hpRemaining: number };
  earnings: Record<string, number>;
}
