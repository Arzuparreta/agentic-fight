import { ActionHistoryEntry, OpponentTendencies } from '@shared/index';

export interface OpponentTendenciesLocal extends OpponentTendencies {}
export { ActionHistoryEntry };

export function analyzeOpponentTendencies(history: ActionHistoryEntry[]): OpponentTendencies {
  const tendencies: OpponentTendencies = {
    preferredMoves: {},
    dodgeFrequency: 0,
    approachRetreatRatio: 0,
    comboUsage: 0,
    averageDistance: 0,
    shieldUsage: 0,
  };

  if (history.length === 0) return tendencies;

  let approachCount = 0;
  let retreatCount = 0;
  let distanceSum = 0;
  let dodgeCount = 0;
  let shieldCount = 0;

  for (let i = 0; i < history.length; i++) {
    const entry = history[i];
    distanceSum += entry.distance;

    if (entry.action.startsWith('dodge_')) {
      dodgeCount++;
    } else if (entry.action === 'shield_block') {
      shieldCount++;
    } else if (entry.action !== 'idle' && !entry.action.startsWith('move_')) {
      tendencies.preferredMoves[entry.action] = (tendencies.preferredMoves[entry.action] || 0) + 1;
    }

    if (i > 0) {
      const prevDist = history[i - 1].distance;
      if (entry.distance < prevDist - 2) approachCount++;
      else if (entry.distance > prevDist + 2) retreatCount++;
    }
  }

  tendencies.dodgeFrequency = dodgeCount / history.length;
  tendencies.approachRetreatRatio = retreatCount > 0 ? approachCount / (approachCount + retreatCount) : 0.5;
  tendencies.averageDistance = distanceSum / history.length;
  tendencies.shieldUsage = shieldCount / history.length;

  return tendencies;
}
