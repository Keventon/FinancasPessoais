const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, ipcMain, shell, nativeImage } = require('electron');
const {
  initializeDatabase,
  addCard,
  removeCard,
  addTransaction,
  removeTransaction,
  updateTransaction,
  getAllData,
  getTransactionsByMonth,
  getSavingsHistory
} = require('./database');

const APP_NAME = 'Finanças Pessoais';
const APP_ID = 'com.financaspessoais.app';

app.name = APP_NAME;
process.title = APP_NAME;

const isMac = process.platform === 'darwin';
const isDev = process.env.VITE_DEV_SERVER_URL !== undefined;

let mainWindow;

const resolveIconPath = () => {
  const iconFile =
    process.platform === 'win32'
      ? 'icon.ico'
      : process.platform === 'darwin'
      ? 'icon.icns'
      : 'icon.png';
  const basePath = app.isPackaged
    ? path.join(process.resourcesPath, 'build')
    : path.join(__dirname, '..', 'build');
  const fullPath = path.join(basePath, iconFile);
  return fs.existsSync(fullPath) ? fullPath : undefined;
};

const resolveIconImage = () => {
  const iconPath = resolveIconPath();
  if (!iconPath) {
    return null;
  }
  const image = nativeImage.createFromPath(iconPath);
  return image && !image.isEmpty() ? image : null;
};

const createWindow = async () => {
  const iconPath = resolveIconPath();
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: APP_NAME,
    backgroundColor: '#f3f4f6',
    icon: iconPath,
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
    const savings = await getSavingsHistory();
    return { transactions, savings };
  });

  ipcMain.handle('db:remove-transaction', async (_event, transactionId) => {
    const transactions = await removeTransaction(transactionId);
    const savings = await getSavingsHistory();
    return { transactions, savings };
  });

  ipcMain.handle('db:update-transaction', async (_event, payload) => {
    const transactions = await updateTransaction(payload);
    const savings = await getSavingsHistory();
    return { transactions, savings };
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

  ipcMain.handle('db:get-savings-history', async () => {
    const savings = await getSavingsHistory();
    return { savings };
  });
};

const initializeApp = async () => {
  await initializeDatabase(app);
  registerIpcHandlers();
  await createWindow();
};

app.whenReady().then(async () => {
  app.setName(APP_NAME);
  if (process.platform === 'win32') {
    app.setAppUserModelId(APP_ID);
  }
  if (isMac && app.dock) {
    const dockIcon = resolveIconImage();
    if (dockIcon) {
      app.dock.setIcon(dockIcon);
    }
  }

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
