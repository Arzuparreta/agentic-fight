export function renderWatchingScreen(container: HTMLElement, message: string) {
  container.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 20px; text-align: center;">
      <div style="font-size: 64px; margin-bottom: 20px;">⚔️</div>
      <h2 style="font-family: Georgia, serif; font-size: 24px; margin-bottom: 15px;">${message}</h2>
      <p style="opacity: 0.7; font-size: 14px;">Watch the main screen for the battle!</p>
      
      <div id="hp-ticker" style="margin-top: 40px; width: 100%; max-width: 300px;">
        <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 5px;">
          <span>Agent A</span>
          <span>Agent B</span>
        </div>
        <div style="display: flex; gap: 5px; height: 20px;">
          <div style="flex: 1; background: #2c1810; border-radius: 4px; overflow: hidden;">
            <div id="hp-a" style="width: 100%; height: 100%; background: #27ae60; transition: width 0.5s;"></div>
          </div>
          <div style="flex: 1; background: #2c1810; border-radius: 4px; overflow: hidden;">
            <div id="hp-b" style="width: 100%; height: 100%; background: #27ae60; transition: width 0.5s;"></div>
          </div>
        </div>
      </div>
    </div>
  `;
}
