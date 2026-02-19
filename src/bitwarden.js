const { spawn, execFile } = require('child_process');
const { clipboard } = require('electron');
const settings = require('./settings');
const vaultCache = require('./vaultCache');

function getBwPath() {
  return settings.get('bwPath');
}

function getClipboardClearMs() {
  return settings.get('clipboardClearSeconds') * 1000;
}

let sessionKey = null;
let cachedItems = [];
let pendingLoginProcess = null;
let clipboardTimer = null;

function runBw(args, options = {}) {
  return new Promise((resolve, reject) => {
    const env = { ...(options.env || process.env) };

    if (sessionKey) {
      env.BW_SESSION = sessionKey;
    }

    const { env: _discardedEnv, ...restOptions } = options;

    execFile(getBwPath(), args, { env, timeout: 30000, ...restOptions }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

function runBwInteractive(args, envOverride = null) {
  return new Promise((resolve, reject) => {
    const env = envOverride || { ...process.env };

    if (sessionKey) {
      env.BW_SESSION = sessionKey;
    }

    const child = spawn(getBwPath(), args, {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill('SIGKILL');
        reject(new Error('Command timed out. Check your credentials.'));
      }
    }, 30000);

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;

      if (code !== 0) {
        const errorMsg = stderr.trim() || stdout.trim() || `bw exited with code ${code}`;
        reject(new Error(errorMsg));
        return;
      }
      resolve(stdout.trim());
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      reject(error);
    });

    child.stdin.end();
  });
}

async function logout() {
  try {
    await runBw(['logout']);
  } catch (_) { }
  sessionKey = null;
  cachedItems = [];
  vaultCache.clearEncryptionKey();
  vaultCache.clear();
  vaultCache.clearPasswordHash();
}

async function getStatus() {
  try {
    const output = await runBw(['status']);
    return JSON.parse(output);
  } catch (error) {
    const msg = error.message.toLowerCase();

    if (msg.includes('not the expected type') || msg.includes('key') || msg.includes('corrupt')) {
      console.log('[Bitty] Corrupted CLI state detected, resetting with logout...');
      await logout();
      return { status: 'unauthenticated' };
    }

    throw error;
  }
}

function login(email, password) {
  return new Promise((resolve, reject) => {
    killPendingLogin();

    const env = { ...process.env, BW_PASSWORD: password };
    const child = spawn(getBwPath(), ['login', email, '--passwordenv', 'BW_PASSWORD', '--raw'], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      pendingLoginProcess = null;
      settle(resolve, { needsCode: true });
    }, 15000);

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      console.log('[Bitty] bw stderr:', chunk.trim());
      const lower = (stderr).toLowerCase();

      if (lower.includes('otp') || lower.includes('two-step') || lower.includes('verification') || lower.includes('2fa') || lower.includes('code')) {
        pendingLoginProcess = { child, stdout: '', stderr: '' };

        child.stdout.removeAllListeners('data');
        child.stdout.on('data', (d) => {
          pendingLoginProcess.stdout += d.toString();
        });

        settle(resolve, { needsCode: true });
      }
    });

    child.on('close', (code) => {
      pendingLoginProcess = null;

      if (code === 0 && stdout.trim()) {
        sessionKey = stdout.trim();
        settle(resolve, { sessionKey });
        return;
      }

      const errorMsg = stderr.trim() || stdout.trim() || `Login failed (exit code ${code})`;
      settle(reject, new Error(errorMsg));
    });

    child.on('error', (error) => {
      pendingLoginProcess = null;
      settle(reject, error);
    });
  });
}

function submitCode(code) {
  return new Promise((resolve, reject) => {
    if (!pendingLoginProcess) {
      reject(new Error('No pending login process. Please try logging in again.'));
      return;
    }

    const { child } = pendingLoginProcess;
    let settled = false;

    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      pendingLoginProcess = null;
      fn(value);
    };

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      settle(reject, new Error('Verification timed out. Please try again.'));
    }, 30000);

    child.stdout.removeAllListeners('data');
    let stdout = pendingLoginProcess.stdout || '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
      console.log('[Bitty] bw stdout after code:', data.toString().trim());
    });

    child.stderr.on('data', (data) => {
      console.log('[Bitty] bw stderr after code:', data.toString().trim());
    });

    child.on('close', (exitCode) => {
      console.log('[Bitty] bw login closed with code:', exitCode, 'stdout:', stdout.trim());

      if (exitCode === 0 && stdout.trim()) {
        sessionKey = stdout.trim();
        settle(resolve, sessionKey);
        return;
      }

      settle(reject, new Error('Verification failed. Please check the code and try again.'));
    });

    console.log('[Bitty] Writing OTP code to stdin...');
    child.stdin.write(code + '\n');
    child.stdin.end();
  });
}

function killPendingLogin() {
  if (pendingLoginProcess) {
    try {
      pendingLoginProcess.child.kill('SIGKILL');
    } catch (_) { }
    pendingLoginProcess = null;
  }
}

async function unlock(password) {
  const output = await runBw(
    ['unlock', '--passwordenv', 'BW_PASSWORD', '--raw'],
    { env: { ...process.env, BW_PASSWORD: password } }
  );
  sessionKey = output;
  return sessionKey;
}

function lock() {
  sessionKey = null;
  cachedItems = [];
  vaultCache.clearEncryptionKey();
  return runBw(['lock']);
}

async function sync() {
  await runBw(['sync']);
}

async function listItems() {
  if (cachedItems.length > 0) {
    return cachedItems;
  }

  const output = await runBw(['list', 'items']);
  const items = JSON.parse(output);

  cachedItems = items
    .filter((item) => item.type === 1)
    .map((item) => ({
      id: item.id,
      name: item.name,
      username: item.login?.username || '',
      password: item.login?.password || '',
      uri: item.login?.uris?.[0]?.uri || '',
      notes: item.notes || '',
      folderId: item.folderId,
    }));

  vaultCache.save(cachedItems);

  return cachedItems;
}

function loadCachedItems(password) {
  const items = vaultCache.load(password);

  if (items.length === 0) {
    return false;
  }

  cachedItems = items;
  return true;
}

function searchItems(query) {
  if (!query) {
    return cachedItems.slice(0, 50);
  }

  const terms = query.toLowerCase().split(/\s+/);

  return cachedItems
    .filter((item) => {
      const haystack = `${item.name} ${item.username} ${item.uri}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    })
    .slice(0, 50);
}

function getItemById(id) {
  return cachedItems.find((item) => item.id === id) || null;
}

function copyField(id, field) {
  const item = getItemById(id);
  if (!item) return false;

  const value = item[field];
  if (!value) return false;

  clipboard.writeText(value);

  if (clipboardTimer) clearTimeout(clipboardTimer);

  const clearMs = getClipboardClearMs();
  if (clearMs > 0) {
    clipboardTimer = setTimeout(() => {
      if (clipboard.readText() === value) {
        clipboard.writeText('');
      }
      clipboardTimer = null;
    }, clearMs);
  }

  return true;
}

async function createItem({ name, username, password, uri, notes }) {
  const itemJson = {
    type: 1,
    name,
    notes: notes || null,
    login: {
      username: username || null,
      password: password || null,
      uris: uri ? [{ uri, match: null }] : [],
    },
  };

  const encoded = Buffer.from(JSON.stringify(itemJson)).toString('base64');
  await runBw(['create', 'item', encoded]);
  cachedItems = [];
  await sync();
  await listItems();
}

async function generatePassword({ length = 20, uppercase = true, lowercase = true, numbers = true, special = true } = {}) {
  const args = ['generate'];

  if (uppercase) args.push('-u');
  if (lowercase) args.push('-l');
  if (numbers) args.push('-n');
  if (special) args.push('-s');
  args.push('--length', String(length));

  return runBw(args);
}

function clearCache() {
  cachedItems = [];
}

function isUnlocked() {
  return sessionKey !== null;
}

function setCachedItems(items) {
  cachedItems = items;
}

module.exports = {
  getStatus,
  login,
  submitCode,
  unlock,
  lock,
  sync,
  listItems,
  loadCachedItems,
  searchItems,
  getItemById,
  copyField,
  createItem,
  generatePassword,
  clearCache,
  setCachedItems,
  isUnlocked,
};
