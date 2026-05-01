import { Socket } from 'socket.io-client';

let onNewMessages: ((messages: { sender: 'player' | 'agent'; content: string }[]) => void) | null = null;

export function renderCoachingScreen(
  container: HTMLElement,
  roomId: string,
  playerId: string,
  socket: Socket,
  existingMessages?: { sender: 'player' | 'agent'; content: string }[]
) {
  const messages: { sender: 'player' | 'agent'; content: string }[] = [];

  container.innerHTML = `
    <div style="display: flex; flex-direction: column; height: 100%;">
      <div style="padding: 15px; background: #2c1810; border-bottom: 2px solid #5d4037; text-align: center;">
        <h2 style="margin: 0; font-size: 18px;">Coach Your Agent</h2>
        <p style="margin: 5px 0 0; font-size: 12px; opacity: 0.6;">Your agent is listening. Guide them to victory.</p>
      </div>
      
      <div id="chat-history" style="flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 10px;">
      </div>
      
      <div style="padding: 10px; background: #1a1a1a; border-top: 2px solid #5d4037; display: flex; gap: 10px;">
        <input type="text" id="chat-input" style="flex: 1; padding: 12px; font-size: 16px; background: #2c1810; color: #f0e6d2; border: 2px solid #5d4037; border-radius: 6px; outline: none; font-family: Georgia, serif;" placeholder="Speak to your agent..." />
        <button id="send-btn" style="padding: 12px 20px; background: #f0e6d2; color: #1a1a1a; border: none; border-radius: 6px; font-family: Georgia, serif; font-weight: bold; cursor: pointer; touch-action: manipulation;">Send</button>
      </div>
      
      <button id="ready-btn" style="margin: 10px; padding: 18px; background: #27ae60; color: white; border: none; border-radius: 8px; font-family: Georgia, serif; font-size: 20px; font-weight: bold; cursor: pointer; touch-action: manipulation;">
        READY FOR BATTLE
      </button>
    </div>
  `;

  const chatHistory = container.querySelector('#chat-history') as HTMLDivElement;
  const input = container.querySelector('#chat-input') as HTMLInputElement;
  const sendBtn = container.querySelector('#send-btn') as HTMLButtonElement;
  const readyBtn = container.querySelector('#ready-btn') as HTMLButtonElement;

  function addMessage(sender: 'player' | 'agent', content: string) {
    messages.push({ sender, content });
    const bubble = document.createElement('div');
    const isPlayer = sender === 'player';
    bubble.style.cssText = `
      align-self: ${isPlayer ? 'flex-end' : 'flex-start'};
      background: ${isPlayer ? '#f0e6d2' : '#2c1810'};
      color: ${isPlayer ? '#1a1a1a' : '#f0e6d2'};
      padding: 10px 15px;
      border-radius: 16px;
      max-width: 80%;
      font-size: 14px;
      word-wrap: break-word;
      border: ${isPlayer ? 'none' : '1px solid #5d4037'};
    `;
    bubble.textContent = content;
    chatHistory.appendChild(bubble);
    chatHistory.scrollTop = chatHistory.scrollHeight;
    console.log(`[Coaching] ${sender}: "${content.slice(0, 40)}..."`);
  }

  if (existingMessages && existingMessages.length > 0) {
    for (const msg of existingMessages) {
      addMessage(msg.sender, msg.content);
    }
  }

  onNewMessages = (newMessages: { sender: 'player' | 'agent'; content: string }[]) => {
    const unseen = newMessages.filter(
      (m) => !messages.some((existing) => existing.sender === m.sender && existing.content === m.content)
    );
    for (const msg of unseen) {
      addMessage(msg.sender, msg.content);
    }
  };

  function sendMessage() {
    const content = input.value.trim();
    if (!content) return;

    addMessage('player', content);
    input.value = '';

    console.log(`[Coaching] Emitting coaching_message: roomId=${roomId}, playerId=${playerId}, content="${content.slice(0, 40)}"`);
    socket.emit('coaching_message', {
      roomId,
      playerId,
      content,
    });
  }

  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });

  sendBtn.addEventListener('click', sendMessage);

  readyBtn.addEventListener('click', () => {
    readyBtn.style.background = '#1e8449';
    readyBtn.textContent = 'READY';
    readyBtn.disabled = true;
    socket.emit('coaching_ready', { roomId, playerId });
  });

  const agentMessageHandler = ((e: CustomEvent) => {
    const data = e.detail as { content: string };
    console.log(`[Coaching] Received agent-coaching-message event: "${data.content?.slice(0, 40)}..."`);
    addMessage('agent', data.content);
  }) as EventListener;

  window.addEventListener('agent-coaching-message', agentMessageHandler);
}

export function updateCoachingMessages(newMessages: { sender: 'player' | 'agent'; content: string }[]) {
  if (onNewMessages) {
    console.log(`[Coaching] updateCoachingMessages called with ${newMessages.length} messages`);
    onNewMessages(newMessages);
  } else {
    console.warn('[Coaching] updateCoachingMessages called but no handler registered');
  }
}