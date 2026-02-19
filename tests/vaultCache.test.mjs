import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';

const vaultCache = await import('../src/vaultCache.js');

describe('vaultCache', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vaultCache.setDataDir('/tmp/bitty-test');
    });

    describe('savePasswordHash / verifyPassword', () => {
        it('verifies a correct password', () => {
            let storedData = null;

            vi.spyOn(fs, 'existsSync').mockReturnValue(true);
            vi.spyOn(fs, 'writeFileSync').mockImplementation((_path, data) => {
                storedData = data;
            });
            vi.spyOn(fs, 'readFileSync').mockImplementation(() => storedData);

            vaultCache.savePasswordHash('my-master-password');

            expect(storedData).toBeTruthy();
            expect(vaultCache.verifyPassword('my-master-password')).toBe(true);
        });

        it('rejects an incorrect password', () => {
            let storedData = null;

            vi.spyOn(fs, 'existsSync').mockReturnValue(true);
            vi.spyOn(fs, 'writeFileSync').mockImplementation((_path, data) => {
                storedData = data;
            });
            vi.spyOn(fs, 'readFileSync').mockImplementation(() => storedData);

            vaultCache.savePasswordHash('correct-password');

            expect(vaultCache.verifyPassword('wrong-password')).toBe(false);
        });

        it('returns false when no hash file exists', () => {
            vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
                throw new Error('ENOENT');
            });

            expect(vaultCache.verifyPassword('any-password')).toBe(false);
        });

        it('uses scrypt producing a 64-byte hash', () => {
            let storedData = null;

            vi.spyOn(fs, 'existsSync').mockReturnValue(true);
            vi.spyOn(fs, 'writeFileSync').mockImplementation((_path, data) => {
                storedData = data;
            });

            vaultCache.savePasswordHash('test');
            const parsed = JSON.parse(storedData);

            expect(parsed.hash.length).toBe(128);
            expect(parsed.salt.length).toBe(32);
        });
    });

    describe('encrypt / decrypt round-trip', () => {
        it('saves and loads items when encryption key is set', () => {
            let storedCache = null;

            vi.spyOn(fs, 'existsSync').mockReturnValue(true);
            vi.spyOn(fs, 'writeFileSync').mockImplementation((_path, data) => {
                storedCache = data;
            });
            vi.spyOn(fs, 'readFileSync').mockImplementation(() => storedCache);

            const items = [
                { id: '1', name: 'GitHub', username: 'user@test.com', password: 'secret123' },
                { id: '2', name: 'GitLab', username: 'admin@test.com', password: 'pass456' },
            ];

            vaultCache.setEncryptionKey('my-password');
            vaultCache.save(items);

            expect(storedCache).toBeTruthy();

            const rawParsed = JSON.parse(storedCache);
            expect(rawParsed).toHaveProperty('salt');
            expect(rawParsed).toHaveProperty('iv');
            expect(rawParsed).toHaveProperty('tag');
            expect(rawParsed).toHaveProperty('data');
            expect(rawParsed).not.toHaveProperty('name');

            const loaded = vaultCache.load('my-password');
            expect(loaded).toEqual(items);
        });

        it('returns empty array when decrypting with wrong password', () => {
            let storedCache = null;

            vi.spyOn(fs, 'existsSync').mockReturnValue(true);
            vi.spyOn(fs, 'writeFileSync').mockImplementation((_path, data) => {
                storedCache = data;
            });
            vi.spyOn(fs, 'readFileSync').mockImplementation(() => storedCache);

            const items = [{ id: '1', name: 'Test', password: 'secret' }];

            vaultCache.setEncryptionKey('correct-password');
            vaultCache.save(items);

            const loaded = vaultCache.load('wrong-password');
            expect(loaded).toEqual([]);
        });

        it('returns empty array when no cache file exists', () => {
            vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
                throw new Error('ENOENT');
            });

            expect(vaultCache.load('any')).toEqual([]);
        });

        it('loads legacy unencrypted cache files', () => {
            const legacyItems = [
                { id: '1', name: 'OldItem', username: 'u', password: 'p' },
            ];

            vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(legacyItems));

            const loaded = vaultCache.load('any-password');
            expect(loaded).toEqual(legacyItems);
        });

        it('does not write when encryption key is not set', () => {
            vi.spyOn(fs, 'existsSync').mockReturnValue(true);
            const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => { });

            vaultCache.clearEncryptionKey();
            vaultCache.save([{ id: '1' }]);

            expect(writeSpy).not.toHaveBeenCalled();
        });
    });

    describe('clear', () => {
        it('deletes the cache file', () => {
            const unlinkSpy = vi.spyOn(fs, 'unlinkSync').mockImplementation(() => { });

            vaultCache.clear();

            expect(unlinkSpy).toHaveBeenCalled();
        });

        it('does not throw when file does not exist', () => {
            vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {
                throw new Error('ENOENT');
            });

            expect(() => vaultCache.clear()).not.toThrow();
        });
    });
});
