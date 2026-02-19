import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';

const settings = await import('../src/settings.js');

describe('settings', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        settings.setDataDir('/tmp/bitty-test');
    });

    describe('validate', () => {
        it('passes through valid settings', () => {
            const input = {
                autoLockMinutes: 10,
                clipboardClearSeconds: 15,
                lockOnClose: true,
                lockOnScreenLock: true,
                globalShortcut: 'Control+Shift+B',
                launchAtLogin: true,
                showInDock: true,
                theme: 'dark',
                windowPosition: 'cursor',
                resultsPerPage: 100,
                passwordLength: 32,
                passwordUppercase: false,
                passwordLowercase: true,
                passwordNumbers: true,
                passwordSpecial: false,
                bwPath: '/usr/local/bin/bw',
                serverUrl: 'https://vault.example.com',
            };

            const result = settings.validate(input);
            expect(result).toEqual(input);
        });

        it('strips unknown keys', () => {
            const input = {
                autoLockMinutes: 5,
                maliciousKey: 'rm -rf /',
            };

            const result = settings.validate(input);
            expect(result).not.toHaveProperty('maliciousKey');
            expect(result).toHaveProperty('autoLockMinutes', 5);
        });

        it('falls back to defaults for invalid types', () => {
            const result = settings.validate({
                autoLockMinutes: 'not-a-number',
                lockOnClose: 'yes',
                theme: 42,
            });

            expect(result.autoLockMinutes).toBe(5);
            expect(result.lockOnClose).toBe(false);
            expect(result.theme).toBe('system');
        });

        it('rejects out-of-range numbers', () => {
            const result = settings.validate({
                autoLockMinutes: 999,
                passwordLength: 3,
                clipboardClearSeconds: -1,
            });

            expect(result.autoLockMinutes).toBe(5);
            expect(result.passwordLength).toBe(20);
            expect(result.clipboardClearSeconds).toBe(30);
        });

        it('rejects values not in allowed list', () => {
            const result = settings.validate({
                theme: 'hacker',
                windowPosition: 'bottom',
                resultsPerPage: 42,
            });

            expect(result.theme).toBe('system');
            expect(result.windowPosition).toBe('center');
            expect(result.resultsPerPage).toBe(50);
        });

        it('rejects strings exceeding maxLength', () => {
            const longPath = 'a'.repeat(257);
            const result = settings.validate({
                bwPath: longPath,
                serverUrl: longPath,
            });

            expect(result.bwPath).toBe('/opt/homebrew/bin/bw');
            expect(result.serverUrl).toBe('');
        });

        it('rejects NaN and Infinity', () => {
            const result = settings.validate({
                autoLockMinutes: NaN,
                passwordLength: Infinity,
            });

            expect(result.autoLockMinutes).toBe(5);
            expect(result.passwordLength).toBe(20);
        });

        it('returns full defaults for null input', () => {
            const result = settings.validate(null);
            expect(result).toEqual(settings.getDefaults());
        });

        it('returns full defaults for non-object input', () => {
            const result = settings.validate('string');
            expect(result).toEqual(settings.getDefaults());
        });
    });

    describe('isValidValue', () => {
        it('accepts valid boolean', () => {
            expect(settings.isValidValue('lockOnClose', true)).toBe(true);
            expect(settings.isValidValue('lockOnClose', false)).toBe(true);
        });

        it('rejects non-boolean for boolean field', () => {
            expect(settings.isValidValue('lockOnClose', 'yes')).toBe(false);
            expect(settings.isValidValue('lockOnClose', 1)).toBe(false);
        });

        it('rejects unknown keys', () => {
            expect(settings.isValidValue('hackerMode', true)).toBe(false);
        });

        it('validates number ranges', () => {
            expect(settings.isValidValue('autoLockMinutes', 0)).toBe(true);
            expect(settings.isValidValue('autoLockMinutes', 60)).toBe(true);
            expect(settings.isValidValue('autoLockMinutes', 61)).toBe(false);
            expect(settings.isValidValue('autoLockMinutes', -1)).toBe(false);
        });

        it('validates enum values', () => {
            expect(settings.isValidValue('theme', 'dark')).toBe(true);
            expect(settings.isValidValue('theme', 'rainbow')).toBe(false);
        });
    });

    describe('save', () => {
        it('validates settings before saving', () => {
            vi.spyOn(fs, 'existsSync').mockReturnValue(true);
            vi.spyOn(fs, 'writeFileSync').mockImplementation(() => { });

            const result = settings.save({
                autoLockMinutes: 999,
                theme: 'hacker',
                bwPath: '/usr/bin/bw',
            });

            expect(result.autoLockMinutes).toBe(5);
            expect(result.theme).toBe('system');
            expect(result.bwPath).toBe('/usr/bin/bw');
        });
    });
});
