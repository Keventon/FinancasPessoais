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

app.commandLine.appendSwitch('disable-http2');

process.on('uncaughtException', (error) => {
  log('Uncaught exception', error);
});

process.on('unhandledRejection', (reason) => {
  log('Unhandled rejection', reason instanceof Error ? reason : { reason });
});

const isMac = process.platform === 'darwin';
const isDev = process.env.VITE_DEV_SERVER_URL !== undefined;

let mainWindow;

const getLogFilePath = () => {
  try {
    return path.join(app.getPath('logs'), 'financas-pessoais.log');
  } catch (error) {
    return path.join(process.cwd(), 'financas-pessoais.log');
  }
};

const log = (...args) => {
  try {
    const logFilePath = getLogFilePath();
    const timestamp = new Date().toISOString();
    const message = args
      .map((item) => {
        if (item instanceof Error) {
          return `${item.stack || item.message}`;
        }
        if (typeof item === 'object') {
          return JSON.stringify(item);
        }
        return String(item);
      })
      .join(' ');
    fs.appendFileSync(logFilePath, `[${timestamp}] ${message}\n`, 'utf8');
  } catch (error) {
    console.error('Failed to write log entry', error);
  }
};

const resolveIconPath = () => {
  const iconFile =
    process.platform === 'win32'
      ? 'icon.ico'
      : process.platform === 'darwin'
      ? 'icon.icns'
      : 'icon.png';
  const packaged = app.isPackaged;
  const basePath = packaged
    ? path.join(process.resourcesPath, 'build')
    : path.join(__dirname, '..', 'build');
  const fullPath = path.join(basePath, iconFile);
  const inResources = path.join(process.resourcesPath, iconFile);
  const chosenPath = packaged && fs.existsSync(inResources) ? inResources : fullPath;
  log('resolveIconPath', { packaged, iconFile, chosenPath, exists: fs.existsSync(chosenPath) });
  return fs.existsSync(chosenPath) ? chosenPath : undefined;
};

const resolveIconImage = () => {
  const iconPath = resolveIconPath();
  if (!iconPath) {
    log('Icon path not found');
    return null;
  }
  const image = nativeImage.createFromPath(iconPath);
  log('Loaded dock icon', { iconPath, empty: image.isEmpty() });
  return image && !image.isEmpty() ? image : null;
};

const createWindow = async () => {
  log('Creating main window', { isDev });
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: APP_NAME,
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
  log('Database initialized');
  registerIpcHandlers();
  log('IPC handlers ready');
  await createWindow();
  log('Main window created');
};

app.whenReady().then(async () => {
  log('App ready lifecycle started');
  app.setName(APP_NAME);
  if (process.platform === 'win32') {
    app.setAppUserModelId(APP_ID);
  }

  try {
    await initializeApp();
  } catch (error) {
    console.error('Failed to initialize application', error);
    log('Initialization failed', error);
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
    log('All windows closed, quitting app');
    app.quit();
  }
});
