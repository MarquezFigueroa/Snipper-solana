document.addEventListener('DOMContentLoaded', () => {
  const statusElement = document.getElementById('status');
  const walletAddressElement = document.getElementById('wallet-address');
  const balanceElement = document.getElementById('balance');
  const startBotButton = document.getElementById('start-bot');
  const stopBotButton = document.getElementById('stop-bot');
  const consoleElement = document.getElementById('console');

  let botRunning = false;

  const socket = io();

  socket.on('message', (msg) => {
    const messageElement = document.createElement('div');
    messageElement.textContent = msg;
    consoleElement.appendChild(messageElement);
    consoleElement.scrollTop = consoleElement.scrollHeight;
  });

  async function fetchWalletInfo() {
    try {
      const response = await fetch('/api/wallet-info');
      const data = await response.json();
      walletAddressElement.textContent = `Address: ${data.address}`;
      balanceElement.textContent = `Balance: ${data.balance}`;
      statusElement.textContent = 'Connected';
    } catch (error) {
      statusElement.textContent = 'Failed to connect';
      console.error('Error fetching wallet info:', error);
    }
  }

  async function startBot() {
    if (botRunning) return;
    try {
      const response = await fetch('/api/start-bot', { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        statusElement.textContent = 'Bot running';
        botRunning = true;
      }
    } catch (error) {
      statusElement.textContent = 'Failed to start bot';
      console.error('Error starting bot:', error);
    }
  }

  async function stopBot() {
    if (!botRunning) return;
    try {
      const response = await fetch('/api/stop-bot', { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        statusElement.textContent = 'Bot stopped';
        botRunning = false;
      }
    } catch (error) {
      statusElement.textContent = 'Failed to stop bot';
      console.error('Error stopping bot:', error);
    }
  }

  startBotButton.addEventListener('click', startBot);
  stopBotButton.addEventListener('click', stopBot);

  fetchWalletInfo();
});
