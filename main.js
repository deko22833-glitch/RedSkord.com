const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const path = require('path');

let mainWindow;
let serverProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false
    },
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    title: 'Redskord Messenger'
  });

  // Запускаем сервер
  const serverPath = path.join(__dirname, 'server', 'index.js');
  serverProcess = spawn('node', [serverPath], {
    cwd: __dirname,
    stdio: 'inherit'
  });

  // Ждем немного и открываем клиент
  setTimeout(() => {
    mainWindow.loadURL('http://localhost:3000');
  }, 2000);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Обработка закрытия приложения
process.on('SIGINT', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
  app.quit();
});

