const path = require('path');
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const {
  initializeDatabase,
  addCard,
  removeCard,
  addTransaction,
  removeTransaction,
  getAllData,
  getTransactionsByMonth
} = require('./database');

const isMac = process.platform === 'darwin';
const isDev = process.env.VITE_DEV_SERVER_URL !== undefined;

let mainWindow;

const createWindow = async () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: 'Personal Finance',
    backgroundColor: '#f3f4f6',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    await mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

const registerIpcHandlers = () => {
  ipcMain.handle('db:get-initial-data', async () => {
    const data = await getAllData();
    return data;
  });

  ipcMain.handle('db:add-transaction', async (_event, payload) => {
    const transactions = await addTransaction(payload);
    return { transactions };
  });

  ipcMain.handle('db:remove-transaction', async (_event, transactionId) => {
    const transactions = await removeTransaction(transactionId);
    return { transactions };
  });

  ipcMain.handle('db:add-card', async (_event, payload) => {
    const cards = await addCard(payload);
    return { cards };
  });

  ipcMain.handle('db:remove-card', async (_event, cardId) => {
    const cards = await removeCard(cardId);
    return { cards };
  });

  ipcMain.handle('db:get-transactions-by-month', async (_event, { year, month }) => {
    const transactions = await getTransactionsByMonth(year, month);
    return { transactions };
  });
};

const initializeApp = async () => {
  await initializeDatabase(app);
  registerIpcHandlers();
  await createWindow();
};

app.whenReady().then(async () => {
  try {
    await initializeApp();
  } catch (error) {
    console.error('Failed to initialize application', error);
    app.quit();
  }

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (!isMac) {
    app.quit();
  }
});
