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

const SCHEMA = {
    autoLockMinutes: { type: 'number', min: 0, max: 60 },
    clipboardClearSeconds: { type: 'number', min: 0, max: 120 },
    lockOnClose: { type: 'boolean' },
    lockOnScreenLock: { type: 'boolean' },
    globalShortcut: { type: 'string', maxLength: 50 },
    launchAtLogin: { type: 'boolean' },
    showInDock: { type: 'boolean' },
    theme: { type: 'string', allowed: ['system', 'dark', 'light'] },
    windowPosition: { type: 'string', allowed: ['center', 'left', 'right', 'cursor'] },
    resultsPerPage: { type: 'number', allowed: [25, 50, 100] },
    passwordLength: { type: 'number', min: 8, max: 128 },
    passwordUppercase: { type: 'boolean' },
    passwordLowercase: { type: 'boolean' },
    passwordNumbers: { type: 'boolean' },
    passwordSpecial: { type: 'boolean' },
    bwPath: { type: 'string', maxLength: 256 },
    serverUrl: { type: 'string', maxLength: 256 },
};

let settingsPath = null;
let cache = null;
let dataDir = null;

function getDataDir() {
    if (!dataDir) {
        const { app } = require('electron');
        dataDir = app.getPath('userData');
    }

    return dataDir;
}

function setDataDir(dir) {
    dataDir = dir;
    settingsPath = null;
    cache = null;
}

function getSettingsPath() {
    if (!settingsPath) {
        settingsPath = path.join(getDataDir(), 'settings.json');
    }
    return settingsPath;
}

function isValidValue(key, value) {
    const rule = SCHEMA[key];
    if (!rule) return false;

    if (typeof value !== rule.type) return false;

    if (rule.allowed && !rule.allowed.includes(value)) return false;

    if (rule.type === 'number') {
        if (rule.min !== undefined && value < rule.min) return false;
        if (rule.max !== undefined && value > rule.max) return false;
        if (!Number.isFinite(value)) return false;
    }

    if (rule.type === 'string') {
        if (rule.maxLength !== undefined && value.length > rule.maxLength) return false;
    }

    return true;
}

function validate(settings) {
    if (!settings || typeof settings !== 'object') return { ...DEFAULTS };

    const validated = {};

    for (const key of Object.keys(DEFAULTS)) {
        if (key in settings && isValidValue(key, settings[key])) {
            validated[key] = settings[key];
        } else {
            validated[key] = DEFAULTS[key];
        }
    }

    return validated;
}

function load() {
    if (cache) return cache;

    try {
        const raw = fs.readFileSync(getSettingsPath(), 'utf-8');
        cache = validate(JSON.parse(raw));
    } catch {
        cache = { ...DEFAULTS };
    }

    return cache;
}

function save(settings) {
    cache = validate(settings);
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

module.exports = { load, save, get, getAll, getDefaults, validate, isValidValue, setDataDir };
