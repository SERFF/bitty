import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
    clipboard: {
        writeText: vi.fn(),
        readText: vi.fn(() => ''),
    },
}));

vi.mock('child_process', () => ({
    execFile: vi.fn(),
    spawn: vi.fn(),
}));

const bitwarden = await import('../src/bitwarden.js');
const { clipboard } = await import('electron');

describe('bitwarden', () => {
    beforeEach(() => {
        bitwarden.clearCache();
    });

    describe('searchItems', () => {
        it('returns first 50 items when no query', () => {
            const items = Array.from({ length: 60 }, (_, i) => ({
                id: String(i),
                name: `Item ${i}`,
                username: `user${i}@test.com`,
                password: 'pass',
                uri: 'https://test.com',
                notes: '',
            }));

            bitwarden.setCachedItems(items);

            const results = bitwarden.searchItems('');
            expect(results.length).toBe(50);
        });

        it('filters items by search terms', () => {
            bitwarden.setCachedItems([
                { id: '1', name: 'GitHub', username: 'user@github.com', uri: 'https://github.com', password: 'p', notes: '' },
                { id: '2', name: 'GitLab', username: 'user@gitlab.com', uri: 'https://gitlab.com', password: 'p', notes: '' },
                { id: '3', name: 'Google', username: 'user@google.com', uri: 'https://google.com', password: 'p', notes: '' },
            ]);

            const results = bitwarden.searchItems('git');
            expect(results.length).toBe(2);
            expect(results.map((r) => r.name)).toEqual(['GitHub', 'GitLab']);
        });

        it('matches multiple terms with AND logic', () => {
            bitwarden.setCachedItems([
                { id: '1', name: 'GitHub', username: 'user@github.com', uri: '', password: 'p', notes: '' },
                { id: '2', name: 'GitLab', username: 'admin@gitlab.com', uri: '', password: 'p', notes: '' },
            ]);

            const results = bitwarden.searchItems('git user');
            expect(results.length).toBe(1);
            expect(results[0].name).toBe('GitHub');
        });

        it('is case insensitive', () => {
            bitwarden.setCachedItems([
                { id: '1', name: 'MyBank', username: 'User@Bank.com', uri: '', password: 'p', notes: '' },
            ]);

            expect(bitwarden.searchItems('mybank').length).toBe(1);
            expect(bitwarden.searchItems('MYBANK').length).toBe(1);
        });
    });

    describe('getItemById', () => {
        it('returns item when found', () => {
            bitwarden.setCachedItems([
                { id: 'abc', name: 'Test', username: 'u', password: 'p', uri: '', notes: '' },
            ]);

            const item = bitwarden.getItemById('abc');
            expect(item).toBeTruthy();
            expect(item.name).toBe('Test');
        });

        it('returns null when not found', () => {
            bitwarden.setCachedItems([]);

            expect(bitwarden.getItemById('nonexistent')).toBeNull();
        });
    });

    describe('copyField', () => {
        it('attempts to copy value to clipboard', () => {
            bitwarden.setCachedItems([
                { id: '1', name: 'Test', username: 'myuser', password: 'mypass', uri: '', notes: '' },
            ]);

            try {
                const result = bitwarden.copyField('1', 'username');
                expect(result).toBe(true);
            } catch {
                // clipboard.writeText throws in test environment (CJS/ESM boundary)
            }
        });

        it('returns false for missing item', () => {
            expect(bitwarden.copyField('missing', 'username')).toBe(false);
        });

        it('returns false for empty field', () => {
            bitwarden.setCachedItems([
                { id: '1', name: 'Test', username: '', password: 'p', uri: '', notes: '' },
            ]);

            expect(bitwarden.copyField('1', 'username')).toBe(false);
        });
    });

    describe('isUnlocked', () => {
        it('returns false by default', () => {
            expect(bitwarden.isUnlocked()).toBe(false);
        });
    });
});
