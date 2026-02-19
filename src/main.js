const { app, BrowserWindow, globalShortcut, ipcMain, Tray, Menu, nativeImage, screen } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const AutoLaunch = require('auto-launch');
const bitwarden = require('./bitwarden');

const autoLauncher = new AutoLaunch({
    name: 'Bitty',
    mac: {
        useLaunchAgent: true,
    },
});

let mainWindow = null;
let tray = null;
let previousApp = null;

function savePreviousApp() {
    return new Promise((resolve) => {
        exec(
            `osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`,
            (error, stdout) => {
                if (!error && stdout.trim()) {
                    previousApp = stdout.trim();
                }
                resolve();
            }
        );
    });
}

function restorePreviousApp() {
    if (!previousApp) return;

    exec(
        `osascript -e 'tell application "${previousApp}" to activate'`
    );
    previousApp = null;
}

function createWindow() {
    const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;
    const windowWidth = 680;
    const windowHeight = 420;

    mainWindow = new BrowserWindow({
        width: windowWidth,
        height: windowHeight,
        x: Math.round((screenWidth - windowWidth) / 2),
        y: 100,
        frame: false,
        show: false,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        transparent: true,
        vibrancy: 'under-window',
        visualEffectState: 'active',
        roundedCorners: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

    mainWindow.on('blur', () => {
        hideWindow();
    });
}

async function showWindow() {
    if (!mainWindow) return;

    await savePreviousApp();

    mainWindow.setAlwaysOnTop(true, 'floating');
    mainWindow.show();
    mainWindow.focus();

    exec(
        `osascript -e 'tell application "System Events" to set frontmost of every process whose unix id is ${process.pid} to true'`
    );

    mainWindow.webContents.send('window:show');

    setTimeout(() => {
        mainWindow?.setAlwaysOnTop(true, 'normal');
        mainWindow?.webContents.executeJavaScript(`
            const el = document.querySelector('input:not([style*="display: none"]):not([disabled])');
            if (el) el.focus();
        `).catch(() => { });
    }, 150);
}

function hideWindow() {
    if (!mainWindow || !mainWindow.isVisible()) return;
    mainWindow.hide();
}

function dismissAndRestore() {
    hideWindow();
    restorePreviousApp();
}

async function createTray() {
    const iconPath = path.join(__dirname, '..', 'assets', 'iconTemplate.png');
    const icon = nativeImage.createFromPath(iconPath);
    icon.setTemplateImage(true);

    tray = new Tray(icon);
    tray.setToolTip('Bitty');

    await updateTrayMenu();
}

async function updateTrayMenu() {
    const isAutoLaunch = await autoLauncher.isEnabled();

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Show (Ctrl+Space)',
            click: () => showWindow(),
        },
        {
            label: 'Sync Vault',
            click: async () => {
                try {
                    await bitwarden.sync();
                } catch (_) { }
            },
        },
        { type: 'separator' },
        {
            label: 'Launch at Login',
            type: 'checkbox',
            checked: isAutoLaunch,
            click: async () => {
                if (isAutoLaunch) {
                    await autoLauncher.disable();
                } else {
                    await autoLauncher.enable();
                }
                await updateTrayMenu();
            },
        },
        { type: 'separator' },
        {
            label: 'Lock Vault',
            click: async () => {
                try {
                    await bitwarden.lock();
                } catch (_) { }
            },
        },
        { type: 'separator' },
        {
            label: 'Quit',
            click: () => app.quit(),
        },
    ]);

    tray.setContextMenu(contextMenu);
}

function registerShortcut() {
    globalShortcut.register('Control+Space', async () => {
        if (mainWindow?.isVisible()) {
            dismissAndRestore();
        } else {
            await showWindow();
        }
    });
}

function registerIpcHandlers() {
    ipcMain.handle('vault:search', async (_event, query) => {
        try {
            const items = bitwarden.searchItems(query);
            return { success: true, items };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('vault:item', async (_event, id) => {
        try {
            const item = bitwarden.getItemById(id);
            return { success: true, item };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('vault:copy', async (_event, id, field) => {
        try {
            const copied = bitwarden.copyField(id, field);
            if (copied) {
                dismissAndRestore();
            }
            return { success: copied };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('vault:status', async () => {
        try {
            const status = await bitwarden.getStatus();
            return { success: true, status, unlocked: bitwarden.isUnlocked() };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('vault:unlock', async (_event, password) => {
        try {
            console.log('[Bitty] Unlocking vault...');
            await bitwarden.unlock(password);
            console.log('[Bitty] Unlock successful, loading items...');
            await bitwarden.listItems();
            console.log('[Bitty] Items loaded');
            return { success: true };
        } catch (error) {
            console.error('[Bitty] Unlock failed:', error.message);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('vault:login', async (_event, email, password) => {
        try {
            console.log('[Bitty] Logging in as', email, '...');
            const result = await bitwarden.login(email, password);

            if (result.needsCode) {
                console.log('[Bitty] Verification code required');
                return { success: false, needsCode: true };
            }

            console.log('[Bitty] Login successful, loading items...');
            await bitwarden.listItems();
            console.log('[Bitty] Items loaded');
            return { success: true };
        } catch (error) {
            console.error('[Bitty] Login failed:', error.message);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('vault:submitCode', async (_event, code) => {
        try {
            console.log('[Bitty] Submitting verification code...');
            await bitwarden.submitCode(code);
            console.log('[Bitty] Verification successful, loading items...');
            await bitwarden.listItems();
            console.log('[Bitty] Items loaded');
            return { success: true };
        } catch (error) {
            console.error('[Bitty] Code submission failed:', error.message);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('vault:lock', async () => {
        try {
            await bitwarden.lock();
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('vault:sync', async () => {
        try {
            await bitwarden.sync();
            await bitwarden.listItems();
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('vault:create', async (_event, data) => {
        try {
            console.log('[Bitty] Creating item:', data.name);
            await bitwarden.createItem(data);
            console.log('[Bitty] Item created and synced');
            return { success: true };
        } catch (error) {
            console.error('[Bitty] Create failed:', error.message);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('vault:generatePassword', async (_event, options) => {
        try {
            const password = await bitwarden.generatePassword(options);
            return { success: true, password };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('window:dismiss', () => {
        dismissAndRestore();
    });
}

app.dock?.hide();

app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    createWindow();
    createTray();
    registerShortcut();
    registerIpcHandlers();
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});

app.on('window-all-closed', (e) => {
    e.preventDefault();
});

app.on('activate', (e) => {
    e.preventDefault();
});
