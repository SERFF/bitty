const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
    autoLockMinutes: 5,
    clipboardClearSeconds: 30,
    lockOnClose: false,
    lockOnScreenLock: false,

    globalShortcut: 'Control+Space',
    launchAtLogin: false,
    showInDock: false,

    theme: 'system',
    windowPosition: 'center',
    resultsPerPage: 50,

    passwordLength: 20,
    passwordUppercase: true,
    passwordLowercase: true,
    passwordNumbers: true,
    passwordSpecial: true,

    bwPath: '/opt/homebrew/bin/bw',
    serverUrl: '',
};

let settingsPath = null;
let cache = null;

function getSettingsPath() {
    if (!settingsPath) {
        settingsPath = path.join(app.getPath('userData'), 'settings.json');
    }
    return settingsPath;
}

function load() {
    if (cache) return cache;

    try {
        const raw = fs.readFileSync(getSettingsPath(), 'utf-8');
        cache = { ...DEFAULTS, ...JSON.parse(raw) };
    } catch {
        cache = { ...DEFAULTS };
    }

    return cache;
}

function save(settings) {
    cache = { ...DEFAULTS, ...settings };
    const dir = path.dirname(getSettingsPath());

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(getSettingsPath(), JSON.stringify(cache, null, 2));
    return cache;
}

function get(key) {
    const all = load();
    return key in all ? all[key] : DEFAULTS[key];
}

function getAll() {
    return load();
}

function getDefaults() {
    return { ...DEFAULTS };
}

module.exports = { load, save, get, getAll, getDefaults };
