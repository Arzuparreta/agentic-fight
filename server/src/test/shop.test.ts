import { RoomPlayer, Stats, RoundResult } from '@shared/index';
import { purchaseItem, getAvailableItems } from '../game/shop';
import { calculateEarnings, EconomyState } from '../game/economy';

function createTestPlayer(id: string, money: number, moves: string[] = [], stats?: Partial<Stats>): RoomPlayer {
  return {
    id,
    socketId: id + '-socket',
    role: 'mobile',
    agentName: id,
    characterDescription: 'a test fighter',
    stats: { maxHp: 200, movementSpeed: 10, attackDamage: 10, ...stats },
    moves,
    money,
    coachingMessages: [],
    playstyleMemory: '',
    playstyleProfile: null,
    ready: false,
    roundSummaries: [],
  };
}

function runTests() {
  console.log('=== Shop & Economy Tests ===\n');

  console.log('Test 1: Buy sword_lunge');
  const p1 = createTestPlayer('p1', 1000);
  const r1 = purchaseItem(p1, 'sword_lunge');
  console.log(`  Result: ${r1.success} — ${r1.message}`);
  console.log(`  Money left: ${p1.money} (expected: 400)`);
  console.log(`  Moves: ${p1.moves.join(', ')}`);
  if (!r1.success || p1.money !== 400 || !p1.moves.includes('sword_lunge')) {
    console.error('FAIL: Test 1');
    process.exit(1);
  }

  console.log('\nTest 2: Buy crossbow without enough money');
  const p2 = createTestPlayer('p2', 500);
  const r2 = purchaseItem(p2, 'crossbow');
  console.log(`  Result: ${r2.success} — ${r2.message}`);
  if (r2.success) {
    console.error('FAIL: Test 2');
    process.exit(1);
  }

  console.log('\nTest 3: Buy sword_lunge twice');
  const p3 = createTestPlayer('p3', 2000, ['sword_lunge']);
  const r3 = purchaseItem(p3, 'sword_lunge');
  console.log(`  Result: ${r3.success} — ${r3.message}`);
  if (r3.success) {
    console.error('FAIL: Test 3');
    process.exit(1);
  }

  console.log('\nTest 4: Buy hp_boost');
  const p4 = createTestPlayer('p4', 1000);
  const r4 = purchaseItem(p4, 'hp_boost');
  console.log(`  Result: ${r4.success} — ${r4.message}`);
  console.log(`  HP: ${p4.stats.maxHp} (expected: 220)`);
  console.log(`  Money left: ${p4.money} (expected: 700)`);
  if (!r4.success || p4.stats.maxHp !== 220 || p4.money !== 700) {
    console.error('FAIL: Test 4');
    process.exit(1);
  }

  console.log('\nTest 5: Available items after purchases');
  const p5 = createTestPlayer('p5', 5000, ['sword_lunge', 'hp_boost']);
  const available = getAvailableItems(p5);
  console.log(`  Available: ${available.join(', ')}`);
  if (available.includes('sword_lunge') || available.includes('hp_boost') || available.includes('basic_attack')) {
    console.error('FAIL: Test 5 — owned items or basic_attack should not be available');
    process.exit(1);
  }

  console.log('\n=== Economy Tests ===\n');

  console.log('Test 6: Winner gets 3000, loser gets 1400');
  const roundResult: RoundResult = {
    roundNumber: 1,
    winnerId: 'p1',
    agentA: { id: 'p1', hpRemaining: 30 },
    agentB: { id: 'p2', hpRemaining: 0 },
    earnings: {},
  };
  const econ: EconomyState = {
    money: { p1: 800, p2: 800 },
    consecutiveLosses: { p1: 0, p2: 0 },
  };
  const { earnings, newEconomy } = calculateEarnings(roundResult, econ);
  console.log(`  p1 earnings: ${earnings.p1} (expected: 3000)`);
  console.log(`  p2 earnings: ${earnings.p2} (expected: 1400)`);
  console.log(`  p1 money: ${newEconomy.money.p1} (expected: 3800)`);
  console.log(`  p2 money: ${newEconomy.money.p2} (expected: 2200)`);
  if (earnings.p1 !== 3000 || earnings.p2 !== 1400 || newEconomy.money.p1 !== 3800 || newEconomy.money.p2 !== 2200) {
    console.error('FAIL: Test 6');
    process.exit(1);
  }

  console.log('\nTest 7: Consecutive loss bonus');
  const roundResult2: RoundResult = {
    roundNumber: 2,
    winnerId: 'p1',
    agentA: { id: 'p1', hpRemaining: 50 },
    agentB: { id: 'p2', hpRemaining: 0 },
    earnings: {},
  };
  const econ2: EconomyState = {
    money: { p1: 3800, p2: 2200 },
    consecutiveLosses: { p1: 0, p2: 1 },
  };
  const { earnings: e2, newEconomy: ne2 } = calculateEarnings(roundResult2, econ2);
  console.log(`  p2 earnings: ${e2.p2} (expected: 1600 — 1400 + 200 bonus)`);
  console.log(`  p2 consecutive losses: ${ne2.consecutiveLosses.p2} (expected: 2)`);
  if (e2.p2 !== 1600 || ne2.consecutiveLosses.p2 !== 2) {
    console.error('FAIL: Test 7');
    process.exit(1);
  }

  console.log('\nTest 8: Max loss bonus cap (600)');
  const econ3: EconomyState = {
    money: { p1: 5000, p2: 5000 },
    consecutiveLosses: { p1: 0, p2: 10 },
  };
  const { earnings: e3 } = calculateEarnings(roundResult, econ3);
  console.log(`  p2 earnings: ${e3.p2} (expected: 2000 — 1400 + 600 max bonus)`);
  if (e3.p2 !== 2000) {
    console.error('FAIL: Test 8');
    process.exit(1);
  }

  console.log('\n=== ALL SHOP & ECONOMY TESTS PASSED ===');
}

runTests();
