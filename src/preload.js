const { contextBridge, ipcRenderer } = require('electron');

function onChannel(channel, callback) {
    ipcRenderer.removeAllListeners(channel);
    ipcRenderer.on(channel, callback);
}

contextBridge.exposeInMainWorld('bitty', {
    searchVault: (query) => ipcRenderer.invoke('vault:search', query),
    getItemDetails: (id) => ipcRenderer.invoke('vault:item', id),
    copyField: (id, field) => ipcRenderer.invoke('vault:copy', id, field),
    isUnlocked: () => ipcRenderer.invoke('vault:isUnlocked'),
    getStatus: () => ipcRenderer.invoke('vault:status'),
    unlock: (password) => ipcRenderer.invoke('vault:unlock', password),
    login: (email, password) => ipcRenderer.invoke('vault:login', email, password),
    submitCode: (code, password) => ipcRenderer.invoke('vault:submitCode', code, password),
    lock: () => ipcRenderer.invoke('vault:lock'),
    syncVault: () => ipcRenderer.invoke('vault:sync'),
    createItem: (data) => ipcRenderer.invoke('vault:create', data),
    generatePassword: (options) => ipcRenderer.invoke('vault:generatePassword', options),
    openUrl: (url) => ipcRenderer.invoke('shell:openUrl', url),
    dismiss: () => ipcRenderer.invoke('window:dismiss'),
    getSettings: () => ipcRenderer.invoke('settings:get'),
    saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
    onShow: (callback) => onChannel('window:show', callback),
    onOpenSettings: (callback) => onChannel('window:openSettings', callback),
    onSyncComplete: (callback) => onChannel('vault:syncComplete', callback),
    onUnlockFailed: (callback) => onChannel('vault:unlockFailed', callback),
});
