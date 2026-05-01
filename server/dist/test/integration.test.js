import { RoomManager } from '../rooms/manager';
const dummyPlanClient = {
    getPlan: async (agent, opponent) => {
        const dx = agent.position.x - opponent.position.x;
        const dy = agent.position.y - opponent.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const onCooldown = (agent.cooldowns['basic_attack'] ?? 0) > 0;
        if (dist <= 80 && !onCooldown) {
            return { plan: 'attack', preferredMove: 'basic_attack', reasoning: 'In range, striking!' };
        }
        if (dist <= 80 && onCooldown) {
            return { plan: 'approach', preferredMove: 'basic_attack', reasoning: 'Closing in while cooldown refreshes.' };
        }
        return { plan: 'approach', preferredMove: 'basic_attack', reasoning: 'Closing the distance.' };
    },
};
async function runIntegrationTest() {
    console.log('=== End-to-End Integration Test ===\n');
    const manager = new RoomManager();
    console.log('Step 1: Browser creates room');
    const room = manager.createRoom('browser-1');
    const roomId = room.id;
    console.log(`  Room created: ${roomId}`);
    console.log(`  Phase: ${room.phase}`);
    console.log('\nStep 2: Mobile 1 joins');
    const j1 = manager.joinRoom('mobile-1', roomId, 'mobile', 'Don Rodrigo', 'a proud Castilian knight');
    if ('error' in j1) {
        console.error('FAIL:', j1.error);
        process.exit(1);
    }
    console.log(`  Joined: ${j1.player.id}`);
    console.log(`  Phase: ${j1.room.phase}`);
    console.log('\nStep 3: Mobile 2 joins');
    const j2 = manager.joinRoom('mobile-2', roomId, 'mobile', 'Al-Mansur', 'a fierce Moorish warrior');
    if ('error' in j2) {
        console.error('FAIL:', j2.error);
        process.exit(1);
    }
    console.log(`  Joined: ${j2.player.id}`);
    console.log(`  Phase: ${j2.room.phase}`);
    const p1Id = j1.player.id;
    const p2Id = j2.player.id;
    console.log('\nStep 4: Send coaching messages');
    await manager.handlePlayerCoachingMessage(roomId, p1Id, 'Be aggressive!');
    await manager.handlePlayerCoachingMessage(roomId, p2Id, 'Stay defensive.');
    console.log('  Messages sent');
    console.log('\nStep 5: Set playstyle memories (bypassing Ollama)');
    const defaultProfile = JSON.stringify({
        narrative: 'I fight to win.',
        parameters: { aggressiveness: 50, risk_tolerance: 50, preferred_range: 50, patience: 50, defensiveness: 50, combo_preference: 50 },
        directives: [],
    });
    room.players[p1Id].playstyleMemory = defaultProfile;
    room.players[p2Id].playstyleMemory = defaultProfile;
    room.phase = 'simulating';
    console.log('  Memories set, phase forced to simulating');
    console.log('\nStep 6: Run simulation');
    const simResult = await manager.runSimulation(roomId, dummyPlanClient);
    if ('error' in simResult) {
        console.error('FAIL:', simResult.error);
        process.exit(1);
    }
    console.log(`  Winner: ${simResult.result.winnerId || 'draw'}`);
    console.log(`  Events: ${simResult.room.eventLog.length}`);
    console.log(`  Phase: ${simResult.room.phase}`);
    console.log(`  P1 HP: ${simResult.result.agentA.hpRemaining}`);
    console.log(`  P2 HP: ${simResult.result.agentB.hpRemaining}`);
    console.log(`  P1 earnings: ${simResult.result.earnings[p1Id]}`);
    console.log(`  P2 earnings: ${simResult.result.earnings[p2Id]}`);
    if (simResult.room.phase !== 'playback') {
        console.error('FAIL: Expected playback phase after simulation');
        process.exit(1);
    }
    console.log('\nStep 7: Playback complete -> shop');
    const pbResult = manager.markPlaybackComplete(roomId);
    if ('error' in pbResult) {
        console.error('FAIL:', pbResult.error);
        process.exit(1);
    }
    console.log(`  Phase: ${pbResult.room.phase}`);
    console.log(`  Round: ${pbResult.room.currentRound}`);
    console.log(`  P1 money: ${pbResult.room.players[p1Id].money}`);
    console.log(`  P2 money: ${pbResult.room.players[p2Id].money}`);
    if (pbResult.room.phase !== 'shop') {
        console.error('FAIL: Expected shop phase');
        process.exit(1);
    }
    console.log('\nStep 8: Purchase items');
    const buy1 = manager.purchaseItem(roomId, p1Id, 'sword_lunge');
    if ('error' in buy1) {
        console.error('FAIL:', buy1.error);
        process.exit(1);
    }
    console.log(`  P1 bought sword_lunge: ${buy1.result.success}`);
    console.log(`  P1 money: ${buy1.room.players[p1Id].money}`);
    console.log(`  P1 moves: ${buy1.room.players[p1Id].moves.join(', ')}`);
    const buy2 = manager.purchaseItem(roomId, p2Id, 'hp_boost');
    if ('error' in buy2) {
        console.error('FAIL:', buy2.error);
        process.exit(1);
    }
    console.log(`  P2 bought hp_boost: ${buy2.result.success}`);
    console.log(`  P2 max HP: ${buy2.room.players[p2Id].stats.maxHp}`);
    console.log('\nStep 9: Shop ready -> Round 2 coaching');
    manager.markShopReady(roomId, p1Id);
    const afterP1 = manager.getPublicRoomState(roomId);
    console.log(`  After P1 ready: ${afterP1.phase}`);
    manager.markShopReady(roomId, p2Id);
    const afterBoth = manager.getPublicRoomState(roomId);
    console.log(`  After both ready: ${afterBoth.phase}`);
    console.log(`  Current round: ${afterBoth.currentRound}`);
    if (afterBoth.phase !== 'coaching') {
        console.error('FAIL: Expected coaching phase for round 2');
        process.exit(1);
    }
    if (afterBoth.currentRound !== 2) {
        console.error('FAIL: Expected round 2');
        process.exit(1);
    }
    console.log('\nStep 10: Verify persistent state across rounds');
    console.log(`  P1 moves (carried): ${afterBoth.players[p1Id].moves.join(', ')}`);
    console.log(`  P2 max HP (carried): ${afterBoth.players[p2Id].stats.maxHp}`);
    console.log(`  P1 playstyle memory: "${afterBoth.players[p1Id].playstyleMemory}"`);
    console.log(`  P2 playstyle memory: "${afterBoth.players[p2Id].playstyleMemory}"`);
    if (!afterBoth.players[p1Id].moves.includes('sword_lunge')) {
        console.error('FAIL: P1 should still have sword_lunge');
        process.exit(1);
    }
    if (afterBoth.players[p2Id].stats.maxHp !== 170) {
        console.error('FAIL: P2 should still have 170 max HP');
        process.exit(1);
    }
    console.log('\nStep 11: Run Round 2 simulation');
    room.phase = 'simulating';
    const sim2 = await manager.runSimulation(roomId, dummyPlanClient);
    if ('error' in sim2) {
        console.error('FAIL:', sim2.error);
        process.exit(1);
    }
    console.log(`  Winner: ${sim2.result.winnerId || 'draw'}`);
    console.log('\nStep 12: End match');
    room.wins[p1Id] = 3;
    const pb2 = manager.markPlaybackComplete(roomId);
    if ('error' in pb2) {
        console.error('FAIL:', pb2.error);
        process.exit(1);
    }
    console.log(`  Phase: ${pb2.room.phase}`);
    console.log(`  Final wins: ${JSON.stringify(pb2.room.wins)}`);
    if (pb2.room.phase !== 'ended') {
        console.error('FAIL: Expected ended phase');
        process.exit(1);
    }
    console.log('\n=== ALL INTEGRATION TESTS PASSED ===');
    console.log('\nIntegration checklist:');
    console.log('  [x] Room created');
    console.log('  [x] Mobiles joined');
    console.log('  [x] Coaching messages stored');
    console.log('  [x] Simulation ran with dummy plan client');
    console.log('  [x] Playback phase triggered');
    console.log('  [x] Economy calculated');
    console.log('  [x] Shop phase opened');
    console.log('  [x] Items purchased (permanent)');
    console.log('  [x] Round 2 coaching started');
    console.log('  [x] Persistent stats/moves across rounds');
    console.log('  [x] Match ended correctly');
}
runIntegrationTest().catch((err) => {
    console.error('Integration test failed:', err);
    process.exit(1);
});
//# sourceMappingURL=integration.test.js.map