import { AgentState, StatusEffect, AttackProfile } from './types';
export interface MoveDef {
    id: string;
    name: string;
    cost: number;
    type: 'move' | 'boost';
    description: string;
    damage?: number;
    range?: number;
    cooldown?: number;
    duration?: number;
    statusEffect?: Omit<StatusEffect, 'remainingTicks'>;
    attackProfile?: AttackProfile;
    statChanges?: Partial<{
        maxHp: number;
        movementSpeed: number;
        attackDamage: number;
    }>;
}
export declare const MOVE_CATALOG: Record<string, MoveDef>;
export declare function getAvailableMoves(agent: AgentState): string[];
export declare function isMoveOffCooldown(agent: AgentState, moveId: string): boolean;
export declare function getMoveDef(moveId: string): MoveDef | undefined;
//# sourceMappingURL=moves.d.ts.map