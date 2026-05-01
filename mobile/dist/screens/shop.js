import { MOVE_CATALOG } from '@shared/index';
export function renderShopScreen(container, roomId, playerId, socket) {
    container.innerHTML = `
    <div style="display: flex; flex-direction: column; height: 100%;">
      <div style="padding: 15px; background: #2c1810; border-bottom: 2px solid #5d4037; text-align: center;">
        <h2 style="margin: 0; font-size: 20px;">⚔️ The Armory</h2>
        <p id="money-display" style="margin: 8px 0 0; font-size: 18px; color: #f1c40f;">💰 0 gold</p>
      </div>
      
      <div id="items-list" style="flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 12px;">
        <!-- Items injected here -->
      </div>
      
      <div id="purchase-msg" style="text-align: center; padding: 8px; font-size: 14px; min-height: 20px;"></div>
      
      <button id="shop-ready-btn" style="margin: 10px; padding: 18px; background: #2980b9; color: white; border: none; border-radius: 8px; font-family: Georgia, serif; font-size: 20px; font-weight: bold; cursor: pointer; touch-action: manipulation;">
        ✓ DONE SHOPPING
      </button>
    </div>
  `;
    const itemsList = container.querySelector('#items-list');
    const moneyDisplay = container.querySelector('#money-display');
    const purchaseMsg = container.querySelector('#purchase-msg');
    const readyBtn = container.querySelector('#shop-ready-btn');
    let currentMoney = 0;
    let ownedItems = new Set();
    function renderItems() {
        itemsList.innerHTML = '';
        for (const [id, def] of Object.entries(MOVE_CATALOG)) {
            if (id === 'basic_attack')
                continue;
            if (ownedItems.has(id))
                continue;
            const canAfford = currentMoney >= def.cost;
            const itemEl = document.createElement('div');
            itemEl.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: #2c1810;
        padding: 15px;
        border-radius: 8px;
        border: 2px solid ${canAfford ? '#5d4037' : '#3e2723'};
        opacity: ${canAfford ? 1 : 0.5};
      `;
            const typeIcon = def.type === 'move' ? '⚔️' : '💪';
            itemEl.innerHTML = `
        <div style="flex: 1;">
          <div style="font-weight: bold; font-size: 16px;">${typeIcon} ${def.name}</div>
          <div style="font-size: 12px; opacity: 0.7; margin-top: 4px;">${def.description}</div>
          <div style="font-size: 12px; color: #f1c40f; margin-top: 4px;">💰 ${def.cost}</div>
        </div>
        <button class="buy-btn" data-id="${id}" style="padding: 10px 20px; background: ${canAfford ? '#27ae60' : '#555'}; color: white; border: none; border-radius: 6px; font-family: Georgia, serif; font-weight: bold; cursor: ${canAfford ? 'pointer' : 'not-allowed'}; touch-action: manipulation;">
          ${canAfford ? 'Buy' : 'Too expensive'}
        </button>
      `;
            itemsList.appendChild(itemEl);
        }
        // Add buy button listeners
        itemsList.querySelectorAll('.buy-btn').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                const itemId = e.target.getAttribute('data-id');
                socket.emit('purchase_item', { roomId, playerId, itemId });
            });
        });
    }
    // Listen for economy updates
    window.addEventListener('economy-update', ((e) => {
        const data = e.detail;
        currentMoney = data.money[playerId] || 0;
        moneyDisplay.textContent = `💰 ${currentMoney} gold`;
        renderItems();
    }));
    // Listen for purchase results
    window.addEventListener('purchase-result', ((e) => {
        const result = e.detail;
        purchaseMsg.textContent = result.message;
        purchaseMsg.style.color = result.success ? '#27ae60' : '#c0392b';
        if (result.success) {
            ownedItems.add(result.itemId || '');
        }
    }));
    readyBtn.addEventListener('click', () => {
        readyBtn.style.background = '#1a5276';
        readyBtn.textContent = '✓ DONE';
        readyBtn.disabled = true;
        socket.emit('shop_ready', { roomId, playerId });
    });
    // Initial render
    renderItems();
}
//# sourceMappingURL=shop.js.map