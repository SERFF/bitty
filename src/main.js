const { app, BrowserWindow, globalShortcut, ipcMain, Tray, Menu, nativeImage, screen, powerMonitor } = require('electron');
const path = require('path');
const { execFile } = require('child_process');
const AutoLaunch = require('auto-launch');
const bitwarden = require('./bitwarden');
const settings = require('./settings');

const ALLOWED_COPY_FIELDS = new Set(['username', 'password', 'uri', 'notes']);

const autoLauncher = new AutoLaunch({
    name: 'Bitty',
    mac: {
        useLaunchAgent: true,
    },
});

let mainWindow = null;
let tray = null;
let previousApp = null;
let autoLockTimer = null;

function savePreviousApp() {
    return new Promise((resolve) => {
        execFile(
            'osascript',
            ['-e', 'tell application "System Events" to get name of first application process whose frontmost is true'],
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

    const sanitized = previousApp.replace(/[^a-zA-Z0-9 ._-]/g, '');
    execFile(
        'osascript',
        ['-e', `tell application "${sanitized}" to activate`]
    );
    previousApp = null;
}

let forceQuit = false;

function createWindow() {
    const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;
    const windowWidth = 700;
    const windowHeight = 450;

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

    mainWindow.on('close', (e) => {
        if (!forceQuit) {
            e.preventDefault();
            hideWindow();
        }
    });

    mainWindow.on('blur', () => {
        hideWindow();
    });
}

function getAutoLockMs() {
    const minutes = settings.get('autoLockMinutes');
    return minutes > 0 ? minutes * 60 * 1000 : 0;
}

function resetAutoLockTimer() {
    if (autoLockTimer) clearTimeout(autoLockTimer);

    const ms = getAutoLockMs();
    if (ms <= 0) return;

    autoLockTimer = setTimeout(async () => {
        try {
            await bitwarden.lock();
            if (mainWindow) {
                mainWindow.webContents.send('window:show');
            }
        } catch (_) { }
    }, ms);
}

async function showWindow() {
    if (!mainWindow) return;

    resetAutoLockTimer();
    await savePreviousApp();

    mainWindow.setAlwaysOnTop(true, 'floating');
    mainWindow.show();
    mainWindow.focus();

    execFile(
        'osascript',
        ['-e', `tell application "System Events" to set frontmost of every process whose unix id is ${process.pid} to true`]
    );

    mainWindow.webContents.send('window:show');

    setTimeout(() => {
        mainWindow?.setAlwaysOnTop(true, 'normal');
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
    const shortcut = settings.get('globalShortcut');
    const shortcutDisplay = shortcut.replace('Control', 'Ctrl').replace('+', '+');

    const contextMenu = Menu.buildFromTemplate([
        {
            label: `Show (${shortcutDisplay})`,
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
            label: 'Settings…',
            click: () => openSettings(),
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
    globalShortcut.unregisterAll();
    const shortcut = settings.get('globalShortcut');
    globalShortcut.register(shortcut, async () => {
        if (mainWindow?.isVisible()) {
            dismissAndRestore();
        } else {
            await showWindow();
        }
    });
}

async function openSettings() {
    if (!mainWindow) return;
    await showWindow();
    mainWindow.webContents.send('window:openSettings');
}

function registerIpcHandlers() {
    ipcMain.handle('vault:search', async (_event, query) => {
        try {
            if (typeof query !== 'string') return { success: false, error: 'Invalid query' };
            resetAutoLockTimer();
            const items = bitwarden.searchItems(query);
            return { success: true, items };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('vault:item', async (_event, id) => {
        try {
            if (typeof id !== 'string') return { success: false, error: 'Invalid id' };
            resetAutoLockTimer();
            const item = bitwarden.getItemById(id);
            return { success: true, item };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('vault:copy', async (_event, id, field) => {
        try {
            if (typeof id !== 'string') return { success: false, error: 'Invalid id' };
            if (!ALLOWED_COPY_FIELDS.has(field)) return { success: false, error: 'Invalid field' };
            resetAutoLockTimer();
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
            if (typeof password !== 'string') return { success: false, error: 'Invalid password' };
            console.log('[Bitty] Unlocking vault...');
            await bitwarden.unlock(password);
            console.log('[Bitty] Unlock successful, loading items...');
            await bitwarden.listItems();
            console.log('[Bitty] Items loaded');
            resetAutoLockTimer();
            return { success: true };
        } catch (error) {
            console.error('[Bitty] Unlock failed:', error.message);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('vault:login', async (_event, email, password) => {
        try {
            if (typeof email !== 'string' || typeof password !== 'string') return { success: false, error: 'Invalid credentials' };
            console.log('[Bitty] Logging in...');
            const result = await bitwarden.login(email, password);

            if (result.needsCode) {
                console.log('[Bitty] Verification code required');
                return { success: false, needsCode: true };
            }

            console.log('[Bitty] Login successful, loading items...');
            await bitwarden.listItems();
            console.log('[Bitty] Items loaded');
            resetAutoLockTimer();
            return { success: true };
        } catch (error) {
            console.error('[Bitty] Login failed:', error.message);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('vault:submitCode', async (_event, code) => {
        try {
            if (typeof code !== 'string') return { success: false, error: 'Invalid code' };
            console.log('[Bitty] Submitting verification code...');
            await bitwarden.submitCode(code);
            console.log('[Bitty] Verification successful, loading items...');
            await bitwarden.listItems();
            console.log('[Bitty] Items loaded');
            resetAutoLockTimer();
            return { success: true };
        } catch (error) {
            console.error('[Bitty] Code submission failed:', error.message);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('vault:lock', async () => {
        try {
            if (autoLockTimer) clearTimeout(autoLockTimer);
            await bitwarden.lock();
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('vault:sync', async () => {
        try {
            resetAutoLockTimer();
            await bitwarden.sync();
            await bitwarden.listItems();
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('vault:create', async (_event, data) => {
        try {
            if (!data || typeof data.name !== 'string') return { success: false, error: 'Invalid item data' };
            resetAutoLockTimer();
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

    ipcMain.handle('settings:get', () => {
        return settings.getAll();
    });

    ipcMain.handle('settings:save', async (_event, newSettings) => {
        const previous = settings.getAll();
        const saved = settings.save(newSettings);

        if (previous.globalShortcut !== saved.globalShortcut) {
            registerShortcut();
        }

        if (previous.autoLockMinutes !== saved.autoLockMinutes) {
            resetAutoLockTimer();
        }

        if (previous.launchAtLogin !== saved.launchAtLogin) {
            if (saved.launchAtLogin) {
                await autoLauncher.enable();
            } else {
                await autoLauncher.disable();
            }
        }

        if (previous.showInDock !== saved.showInDock) {
            if (saved.showInDock) {
                app.dock?.show();
            } else {
                app.dock?.hide();
            }
        }

        await updateTrayMenu();
        return saved;
    });
}

app.dock?.hide();

app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    createWindow();
    createTray();
    registerShortcut();
    registerIpcHandlers();

    powerMonitor.on('lock-screen', async () => {
        if (settings.get('lockOnScreenLock')) {
            try {
                if (autoLockTimer) clearTimeout(autoLockTimer);
                await bitwarden.lock();
                if (mainWindow) {
                    mainWindow.webContents.send('window:show');
                }
            } catch (_) { }
        }
    });
});

app.on('before-quit', () => {
    forceQuit = true;
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
