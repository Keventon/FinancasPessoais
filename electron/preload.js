const { contextBridge, ipcRenderer } = require('electron');

const invoke = async (channel, payload) => {
  try {
    return await ipcRenderer.invoke(channel, payload);
  } catch (error) {
    console.error(`IPC invoke error on channel ${channel}`, error);
    throw error;
  }
};

contextBridge.exposeInMainWorld('financeApi', {
  getInitialData: () => invoke('db:get-initial-data'),
  addTransaction: (data) => invoke('db:add-transaction', data),
  removeTransaction: (id) => invoke('db:remove-transaction', id),
  addCard: (data) => invoke('db:add-card', data),
  removeCard: (id) => invoke('db:remove-card', id),
  getTransactionsByMonth: ({ year, month }) =>
    invoke('db:get-transactions-by-month', { year, month })
});
