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
            return { plan: 'approach', preferredMove: 'basic_attack', reasoning: 'In range but on cooldown, repositioning.' };
        }
        return { plan: 'approach', preferredMove: 'basic_attack', reasoning: 'Closing the distance.' };
    },
};
async function runTests() {
    console.log('=== Room Manager Tests ===\n');
    const manager = new RoomManager();
    console.log('Test 1: Create room');
    const room = manager.createRoom('browser-1');
    console.log(`  Room ID: ${room.id} (length: ${room.id.length})`);
    if (room.id.length !== 4 || room.phase !== 'lobby') {
        console.error('FAIL: Test 1');
        process.exit(1);
    }
    console.log('\nTest 2: Mobile joins');
    const j1 = manager.joinRoom('mobile-1', room.id, 'mobile', 'Don Rodrigo', 'a proud Castilian knight');
    if ('error' in j1) {
        console.error('FAIL: Test 2a', j1.error);
        process.exit(1);
    }
    console.log(`  Mobile 1 joined: ${j1.player.id}`);
    if (j1.room.phase !== 'lobby') {
        console.error('FAIL: Test 2b — should still be lobby with only 1 mobile');
        process.exit(1);
    }
    const j2 = manager.joinRoom('mobile-2', room.id, 'mobile', 'Al-Mansur', 'a fierce Moorish warrior');
    if ('error' in j2) {
        console.error('FAIL: Test 2c', j2.error);
        process.exit(1);
    }
    console.log(`  Mobile 2 joined: ${j2.player.id}`);
    if (j2.room.phase !== 'coaching') {
        console.error('FAIL: Test 2d — should transition to coaching with 2 mobiles');
        process.exit(1);
    }
    console.log('\nTest 3: Coaching messages');
    const p1Id = j1.player.id;
    const p2Id = j2.player.id;
    await manager.handlePlayerCoachingMessage(room.id, p1Id, 'Be aggressive!');
    await manager.handlePlayerCoachingMessage(room.id, p2Id, 'Stay defensive.');
    const rState = manager.getPublicRoomState(room.id);
    console.log(`  P1 messages: ${rState.players[p1Id].coachingMessages.length}`);
    console.log(`  P2 messages: ${rState.players[p2Id].coachingMessages.length}`);
    if (rState.players[p1Id].coachingMessages.length < 1) {
        console.error('FAIL: Test 3');
        process.exit(1);
    }
    console.log('\nTest 4: Coaching ready triggers simulation');
    await manager.markCoachingReady(room.id, p1Id);
    const afterP1 = manager.getPublicRoomState(room.id);
    if (afterP1.phase !== 'coaching') {
        console.error('FAIL: Test 4a — should still be coaching (only 1 ready)');
        process.exit(1);
    }
    await manager.markCoachingReady(room.id, p2Id);
    const afterBoth = manager.getPublicRoomState(room.id);
    console.log(`  Phase after both ready: ${afterBoth.phase}`);
    if (afterBoth.phase !== 'simulating') {
        console.error('FAIL: Test 4b — should be simulating');
        process.exit(1);
    }
    console.log('\nTest 5: Run simulation');
    const simResult = await manager.runSimulation(room.id, dummyPlanClient);
    if ('error' in simResult) {
        console.error('FAIL: Test 5', simResult.error);
        process.exit(1);
    }
    console.log(`  Winner: ${simResult.result.winnerId || 'draw'}`);
    console.log(`  Phase: ${simResult.room.phase}`);
    console.log(`  Events: ${simResult.room.eventLog.length}`);
    if (simResult.room.phase !== 'playback') {
        console.error('FAIL: Test 5a — should be playback');
        process.exit(1);
    }
    if (simResult.room.eventLog.length === 0) {
        console.error('FAIL: Test 5b — should have events');
        process.exit(1);
    }
    console.log('\nTest 6: Playback complete -> shop');
    const pbResult = manager.markPlaybackComplete(room.id);
    if ('error' in pbResult) {
        console.error('FAIL: Test 6', pbResult.error);
        process.exit(1);
    }
    console.log(`  Phase: ${pbResult.room.phase}`);
    console.log(`  Round: ${pbResult.room.currentRound}`);
    console.log(`  Money P1: ${pbResult.room.players[p1Id].money}`);
    console.log(`  Money P2: ${pbResult.room.players[p2Id].money}`);
    if (pbResult.room.phase !== 'shop') {
        console.error('FAIL: Test 6a — should be shop');
        process.exit(1);
    }
    console.log('\nTest 7: Purchase items');
    const buy1 = manager.purchaseItem(room.id, p1Id, 'sword_lunge');
    if ('error' in buy1) {
        console.error('FAIL: Test 7a', buy1.error);
        process.exit(1);
    }
    console.log(`  P1 bought sword_lunge: ${buy1.result.success} — ${buy1.result.message}`);
    console.log(`  P1 money left: ${buy1.room.players[p1Id].money}`);
    console.log(`  P1 moves: ${buy1.room.players[p1Id].moves.join(', ')}`);
    const buy2 = manager.purchaseItem(room.id, p2Id, 'hp_boost');
    if ('error' in buy2) {
        console.error('FAIL: Test 7b', buy2.error);
        process.exit(1);
    }
    console.log(`  P2 bought hp_boost: ${buy2.result.success} — ${buy2.result.message}`);
    console.log(`  P2 max HP: ${buy2.room.players[p2Id].stats.maxHp}`);
    console.log('\nTest 8: Shop ready transitions to coaching');
    manager.markShopReady(room.id, p1Id);
    const afterShopP1 = manager.getPublicRoomState(room.id);
    if (afterShopP1.phase !== 'shop') {
        console.error('FAIL: Test 8a — should still be shop');
        process.exit(1);
    }
    manager.markShopReady(room.id, p2Id);
    const afterShopBoth = manager.getPublicRoomState(room.id);
    console.log(`  Phase: ${afterShopBoth.phase}`);
    console.log(`  Round: ${afterShopBoth.currentRound}`);
    if (afterShopBoth.phase !== 'coaching') {
        console.error('FAIL: Test 8b — should be coaching');
        process.exit(1);
    }
    console.log('\nTest 9: Disconnect and reconnect');
    const discResult = manager.leaveRoom('mobile-1');
    if (!discResult.room || !discResult.playerId) {
        console.error('FAIL: Test 9a');
        process.exit(1);
    }
    console.log(`  Player ${discResult.playerId} disconnected`);
    const reconResult = manager.reconnectRoom('mobile-1-new', room.id, discResult.playerId);
    if ('error' in reconResult) {
        console.error('FAIL: Test 9b', reconResult.error);
        process.exit(1);
    }
    console.log(`  Reconnected: ${reconResult.player.id}`);
    if (reconResult.player.socketId !== 'mobile-1-new') {
        console.error('FAIL: Test 9c — socketId not updated');
        process.exit(1);
    }
    console.log('\n=== ALL ROOM MANAGER TESTS PASSED ===');
}
runTests().catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
});
//# sourceMappingURL=room.test.js.map