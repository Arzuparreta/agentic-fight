export function renderPairingScreen(container) {
    container.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 20px;">
      <h1 style="font-family: Georgia, serif; margin-bottom: 10px; font-size: 32px;">Agentic Fight</h1>
      <p style="margin-bottom: 30px; opacity: 0.7; font-size: 14px;">Coach your agent to victory</p>
      <p style="margin-bottom: 15px; font-size: 16px;">Enter room code</p>
      <input type="text" id="room-code" maxlength="4" style="text-transform: uppercase; font-size: 40px; text-align: center; width: 180px; padding: 15px; letter-spacing: 12px; background: #2c1810; color: #f0e6d2; border: 3px solid #f0e6d2; border-radius: 8px; outline: none;" placeholder="ABCD" />
      <input type="text" id="agent-name" maxlength="20" style="margin-top: 15px; font-size: 18px; text-align: center; width: 200px; padding: 10px; background: #2c1810; color: #f0e6d2; border: 2px solid #5d4037; border-radius: 6px; outline: none;" placeholder="Agent Name" />
      <select id="character-type" style="margin-top: 10px; font-size: 16px; text-align: center; width: 200px; padding: 10px; background: #2c1810; color: #f0e6d2; border: 2px solid #5d4037; border-radius: 6px; outline: none; font-family: Georgia, serif;">
        <option value="knight">Castilian Knight</option>
        <option value="moor">Moorish Warrior</option>
        <option value="friar">Inquisitor Friar</option>
        <option value="conquistador">Conquistador</option>
      </select>
      <button id="join-btn" style="margin-top: 25px; padding: 15px 50px; font-size: 20px; background: #f0e6d2; color: #1a1a1a; border: none; border-radius: 6px; font-family: Georgia, serif; font-weight: bold; cursor: pointer; touch-action: manipulation;">Join Battle</button>
    </div>
  `;
    const input = container.querySelector('#room-code');
    const nameInput = container.querySelector('#agent-name');
    const typeSelect = container.querySelector('#character-type');
    const button = container.querySelector('#join-btn');
    input.focus();
    input.addEventListener('input', () => {
        input.value = input.value.toUpperCase().replace(/[^A-Z]/g, '');
    });
    button.addEventListener('click', () => {
        const code = input.value;
        const name = nameInput.value.trim() || 'Unnamed Agent';
        const type = typeSelect.value;
        if (code.length === 4) {
            const socket = window.__socket;
            if (socket) {
                const descriptions = {
                    knight: 'a proud Castilian knight',
                    moor: 'a fierce Moorish warrior',
                    friar: 'an inquisitor friar',
                    conquistador: 'a daring conquistador',
                };
                socket.emit('join_room', {
                    roomId: code,
                    role: 'mobile',
                    agentName: name,
                    characterDescription: descriptions[type] || descriptions.knight,
                });
            }
        }
        else {
            input.style.borderColor = '#c0392b';
            setTimeout(() => { input.style.borderColor = '#f0e6d2'; }, 500);
        }
    });
}
//# sourceMappingURL=pairing.js.map