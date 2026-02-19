const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bitty', {
    searchVault: (query) => ipcRenderer.invoke('vault:search', query),
    getItemDetails: (id) => ipcRenderer.invoke('vault:item', id),
    copyField: (id, field) => ipcRenderer.invoke('vault:copy', id, field),
    getStatus: () => ipcRenderer.invoke('vault:status'),
    unlock: (password) => ipcRenderer.invoke('vault:unlock', password),
    login: (email, password) => ipcRenderer.invoke('vault:login', email, password),
    submitCode: (code) => ipcRenderer.invoke('vault:submitCode', code),
    lock: () => ipcRenderer.invoke('vault:lock'),
    syncVault: () => ipcRenderer.invoke('vault:sync'),
    createItem: (data) => ipcRenderer.invoke('vault:create', data),
    generatePassword: (options) => ipcRenderer.invoke('vault:generatePassword', options),
    dismiss: () => ipcRenderer.invoke('window:dismiss'),
    onShow: (callback) => ipcRenderer.on('window:show', callback),
});
