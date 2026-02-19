const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCRYPT_KEYLEN = 64;
const ENCRYPTION_KEYLEN = 32;
const IV_LENGTH = 16;
const SALT_LENGTH = 16;
const ALGORITHM = 'aes-256-gcm';

let encryptionKey = null;
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
}

function getCachePath() {
    return path.join(getDataDir(), 'vault-cache.json');
}

function getHashPath() {
    return path.join(getDataDir(), 'password-hash.json');
}

function ensureDir(filePath) {
    const dir = path.dirname(filePath);

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function deriveEncryptionKey(password, salt) {
    return crypto.scryptSync(password, salt, ENCRYPTION_KEYLEN);
}

function setEncryptionKey(password) {
    const salt = crypto.randomBytes(SALT_LENGTH).toString('hex');
    encryptionKey = { key: deriveEncryptionKey(password, salt), salt };
}

function clearEncryptionKey() {
    encryptionKey = null;
}

function encrypt(plaintext) {
    if (!encryptionKey) return null;

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey.key, iv);

    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
        salt: encryptionKey.salt,
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
        data: encrypted.toString('hex'),
    };
}

function decrypt(envelope, password) {
    const key = deriveEncryptionKey(password, envelope.salt);
    const iv = Buffer.from(envelope.iv, 'hex');
    const tag = Buffer.from(envelope.tag, 'hex');
    const data = Buffer.from(envelope.data, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf-8');
}

function load(password) {
    try {
        const raw = fs.readFileSync(getCachePath(), 'utf-8');
        const parsed = JSON.parse(raw);

        if (Array.isArray(parsed)) {
            return parsed;
        }

        if (!parsed.salt || !parsed.iv || !parsed.tag || !parsed.data) {
            return [];
        }

        const plaintext = decrypt(parsed, password);
        return JSON.parse(plaintext);
    } catch {
        return [];
    }
}

function save(items) {
    const plaintext = JSON.stringify(items);
    const envelope = encrypt(plaintext);

    if (!envelope) return;

    ensureDir(getCachePath());
    fs.writeFileSync(getCachePath(), JSON.stringify(envelope));
}

function clear() {
    try {
        fs.unlinkSync(getCachePath());
    } catch {
    }
}

function savePasswordHash(password) {
    const salt = crypto.randomBytes(SALT_LENGTH).toString('hex');
    const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');

    ensureDir(getHashPath());
    fs.writeFileSync(getHashPath(), JSON.stringify({ salt, hash }));
}

function verifyPassword(password) {
    try {
        const raw = fs.readFileSync(getHashPath(), 'utf-8');
        const { salt, hash } = JSON.parse(raw);
        const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
        return crypto.timingSafeEqual(derived, Buffer.from(hash, 'hex'));
    } catch {
        return false;
    }
}

function clearPasswordHash() {
    try {
        fs.unlinkSync(getHashPath());
    } catch {
    }
}

module.exports = {
    load,
    save,
    clear,
    setEncryptionKey,
    clearEncryptionKey,
    savePasswordHash,
    verifyPassword,
    clearPasswordHash,
    setDataDir,
};
