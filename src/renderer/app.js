const State = {
    UNLOCK: 'unlock',
    LIST: 'list',
    DETAIL: 'detail',
    ADD: 'add',
};

const MONOGRAM_COLORS = [
    '#FF453A', '#FF6961', '#FF9F0A', '#FFD60A',
    '#30D158', '#34C759', '#63E6E2', '#64D2FF',
    '#0A84FF', '#5E5CE6', '#BF5AF2', '#FF2D55',
    '#AC8E68', '#8E8E93',
];

let currentState = State.UNLOCK;
let items = [];
let selectedIndex = 0;
let selectedFieldIndex = 0;
let currentItem = null;
let passwordRevealed = false;
let pendingEmail = '';
let pendingPassword = '';
let isTransitioning = false;

const unlockView = document.getElementById('unlock-view');
const searchView = document.getElementById('search-view');
const addView = document.getElementById('add-view');
const emailInput = document.getElementById('email-input');
const passwordInput = document.getElementById('password-input');
const codeInput = document.getElementById('code-input');
const statusMessage = document.getElementById('status-message');
const spinner = document.getElementById('spinner');
const unlockHint = document.getElementById('unlock-hint');
const searchInput = document.getElementById('search-input');
const resultsList = document.getElementById('results-list');
const emptyState = document.getElementById('empty-state');
const listPanel = document.getElementById('list-panel');
const detailPanel = document.getElementById('detail-panel');
const detailTitle = document.getElementById('detail-title');
const detailFields = document.getElementById('detail-fields');
const statusIndicator = document.getElementById('status-indicator');
const addStatus = document.getElementById('add-status');
const addName = document.getElementById('add-name');
const addUsername = document.getElementById('add-username');
const addPassword = document.getElementById('add-password');
const addUri = document.getElementById('add-uri');
const addNotes = document.getElementById('add-notes');
const addFormInputs = () => [addName, addUsername, addPassword, addUri, addNotes];

const FIELDS = [
    { key: 'username', label: 'Username' },
    { key: 'password', label: 'Password', masked: true },
    { key: 'uri', label: 'URL' },
    { key: 'notes', label: 'Notes' },
];

function getMonogramColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return MONOGRAM_COLORS[Math.abs(hash) % MONOGRAM_COLORS.length];
}

function getMonogramLetter(name) {
    if (!name) return '?';
    const cleaned = name.replace(/^(https?:\/\/)?(www\.)?/i, '').trim();
    return (cleaned[0] || '?').toUpperCase();
}

function switchState(newState, options = {}) {
    const stateChanged = currentState !== newState;
    currentState = newState;

    unlockView.classList.toggle('hidden', newState !== State.UNLOCK);
    searchView.classList.toggle('hidden', newState !== State.LIST && newState !== State.DETAIL);
    addView.classList.toggle('hidden', newState !== State.ADD);

    if (newState === State.LIST) {
        detailPanel.classList.add('hidden');
        listPanel.style.flex = '1';
        if (stateChanged) {
            searchInput.focus();
        }
    }

    if (newState === State.DETAIL) {
        detailPanel.classList.remove('hidden');
        listPanel.style.flex = '1';
    }

    if (newState === State.ADD) {
        addFormInputs().forEach((input) => {
            input.value = '';
            input.disabled = false;
        });
        addStatus.textContent = '';
        addStatus.className = 'add-status';
        addName.focus();
    }

    if (newState === State.UNLOCK) {
        if (stateChanged) {
            passwordInput.value = '';
            codeInput.value = '';
        }
        statusMessage.textContent = '';
        passwordInput.disabled = false;
        emailInput.disabled = false;
        codeInput.disabled = false;
        codeInput.style.display = 'none';
        pendingEmail = '';
        pendingPassword = '';

        if (options.loading) {
            spinner.classList.add('visible');
            emailInput.style.display = 'none';
            passwordInput.style.display = 'none';
            unlockHint.style.display = 'none';
            statusMessage.textContent = 'Connecting to vault…';
            statusMessage.style.color = '';
        } else if (options.needsLogin) {
            spinner.classList.remove('visible');
            emailInput.style.display = '';
            passwordInput.style.display = '';
            unlockHint.style.display = '';
            if (stateChanged) {
                emailInput.value = '';
            }
            statusMessage.textContent = 'Sign in to Bitwarden';
            statusMessage.style.color = '';
            emailInput.focus();
        } else {
            spinner.classList.remove('visible');
            emailInput.style.display = 'none';
            passwordInput.style.display = '';
            unlockHint.style.display = '';
            statusMessage.textContent = 'Enter your master password';
            statusMessage.style.color = '';
            passwordInput.focus();
        }
    }
}

let renderedItemIds = [];

function updateSelection() {
    const children = resultsList.children;
    for (let i = 0; i < children.length; i++) {
        children[i].classList.toggle('selected', i === selectedIndex);
    }
    scrollToSelected();
}

function renderResults(selectionOnly = false) {
    const currentIds = items.map((item) => item.id);
    const isSameList = selectionOnly ||
        (currentIds.length === renderedItemIds.length &&
            currentIds.every((id, i) => id === renderedItemIds[i]));

    if (isSameList && resultsList.children.length > 0) {
        updateSelection();
        return;
    }

    renderedItemIds = currentIds;
    resultsList.innerHTML = '';

    if (items.length === 0) {
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');

    items.forEach((item, index) => {
        const el = document.createElement('div');
        el.className = `result-item${index === selectedIndex ? ' selected' : ''}`;

        const color = getMonogramColor(item.name);
        const letter = getMonogramLetter(item.name);

        const monogram = document.createElement('div');
        monogram.className = 'monogram';
        monogram.style.background = color;
        monogram.textContent = letter;

        const textWrap = document.createElement('div');
        textWrap.className = 'result-item-text';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'result-name';
        nameSpan.textContent = item.name;

        const userSpan = document.createElement('span');
        userSpan.className = 'result-username';
        userSpan.textContent = item.username || '\u2014';

        textWrap.appendChild(nameSpan);
        textWrap.appendChild(userSpan);

        const chevron = document.createElement('span');
        chevron.className = 'result-chevron';
        chevron.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>';

        el.appendChild(monogram);
        el.appendChild(textWrap);
        el.appendChild(chevron);

        el.addEventListener('click', () => {
            selectedIndex = index;
            updateSelection();
            openDetail(item);
        });
        resultsList.appendChild(el);
    });

    scrollToSelected();
}

function scrollToSelected() {
    const selected = resultsList.querySelector('.selected');
    if (selected) {
        selected.scrollIntoView({ block: 'nearest' });
    }
}

function openDetail(item) {
    currentItem = item;
    selectedFieldIndex = 0;
    passwordRevealed = false;
    detailTitle.textContent = item.name;
    renderDetailFields(item);
    switchState(State.DETAIL);
}

function renderDetailFields(item) {
    detailFields.innerHTML = '';

    const availableFields = FIELDS.filter((f) => item[f.key]);

    availableFields.forEach((field, index) => {
        const el = document.createElement('div');
        el.className = `detail-field${index === selectedFieldIndex ? ' selected' : ''}`;

        const isMasked = field.masked && !passwordRevealed;
        const displayValue = isMasked ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' : item[field.key];

        const labelDiv = document.createElement('div');
        labelDiv.className = 'field-label';
        labelDiv.textContent = field.label;

        if (field.masked && index === selectedFieldIndex) {
            const hint = document.createElement('span');
            hint.className = 'reveal-hint';
            hint.textContent = passwordRevealed ? '\u2334 hide' : '\u2334 reveal';
            labelDiv.appendChild(hint);
        }

        const valueDiv = document.createElement('div');
        valueDiv.className = `field-value${isMasked ? ' masked' : ''}`;
        valueDiv.textContent = displayValue;

        el.appendChild(labelDiv);
        el.appendChild(valueDiv);

        el.addEventListener('click', () => {
            copyField(item.id, field.key);
        });

        detailFields.appendChild(el);
    });
}

function getAvailableFields() {
    if (!currentItem) return [];
    return FIELDS.filter((f) => currentItem[f.key]);
}

async function copyField(id, fieldKey) {
    const result = await window.bitty.copyField(id, fieldKey);
    if (!result.success) return;

    showToast(`Copied ${fieldKey}`);
}

function showToast(message) {
    const existing = document.querySelector('.copied-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'copied-toast';

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2.5');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('points', '20 6 9 17 4 12');
    svg.appendChild(polyline);

    toast.appendChild(svg);
    toast.appendChild(document.createTextNode(message));
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 1200);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

let searchTimeout = null;

async function performSearch(query) {
    const result = await window.bitty.searchVault(query);

    if (result.success) {
        items = result.items;
        selectedIndex = 0;
        renderResults();
    }
}

searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        performSearch(searchInput.value);
    }, 100);
});

async function handleUnlock() {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!password) return;

    emailInput.disabled = true;
    passwordInput.disabled = true;
    codeInput.disabled = true;
    spinner.classList.add('visible');
    unlockHint.style.display = 'none';
    statusMessage.textContent = 'Unlocking…';

    try {
        const statusResult = await window.bitty.getStatus();

        if (statusResult.success && statusResult.status.status === 'unauthenticated') {
            if (!email) {
                spinner.classList.remove('visible');
                statusMessage.textContent = 'Email address required for login';
                emailInput.disabled = false;
                passwordInput.disabled = false;
                emailInput.focus();
                return;
            }

            const loginResult = await window.bitty.login(email, password);

            if (loginResult.needsCode) {
                spinner.classList.remove('visible');
                pendingEmail = email;
                pendingPassword = password;
                statusMessage.textContent = 'Check your email for the verification code';
                emailInput.disabled = true;
                passwordInput.disabled = true;
                codeInput.style.display = '';
                codeInput.disabled = false;
                codeInput.value = '';
                codeInput.focus();
                return;
            }

            if (!loginResult.success) {
                spinner.classList.remove('visible');
                statusMessage.textContent = loginResult.error || 'Login failed';
                passwordInput.value = '';
                emailInput.disabled = false;
                passwordInput.disabled = false;
                passwordInput.focus();
                return;
            }
        } else {
            const unlockResult = await window.bitty.unlock(password);
            if (!unlockResult.success) {
                spinner.classList.remove('visible');
                statusMessage.textContent = unlockResult.error || 'Wrong password';
                passwordInput.value = '';
                emailInput.disabled = false;
                passwordInput.disabled = false;
                passwordInput.focus();
                return;
            }
        }

        statusMessage.textContent = 'Loading vault…';
        switchState(State.LIST);
        statusIndicator.innerHTML = '<span class="status-dot"></span> Unlocked';
        await performSearch('');
    } catch (err) {
        spinner.classList.remove('visible');
        statusMessage.textContent = err.message || 'Something went wrong';
        passwordInput.value = '';
        emailInput.disabled = false;
        passwordInput.disabled = false;
        codeInput.disabled = false;
        passwordInput.focus();
    }
}

async function handleCodeSubmit() {
    const code = codeInput.value.trim();
    if (!code) return;

    codeInput.disabled = true;
    statusMessage.textContent = 'Verifying…';

    try {
        const result = await window.bitty.submitCode(code);

        if (!result.success) {
            statusMessage.textContent = result.error || 'Invalid code';
            codeInput.value = '';
            codeInput.disabled = false;
            codeInput.focus();
            return;
        }

        pendingEmail = '';
        pendingPassword = '';
        switchState(State.LIST);
        statusIndicator.innerHTML = '<span class="status-dot"></span> Unlocked';
        await performSearch('');
    } catch (err) {
        statusMessage.textContent = err.message || 'Verification failed';
        codeInput.value = '';
        codeInput.disabled = false;
        codeInput.focus();
    }
}

emailInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        passwordInput.focus();
    } else if (e.key === 'Escape') {
        window.bitty.dismiss();
    }
});

passwordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        window.bitty.dismiss();
    } else if (e.key === 'Enter') {
        e.preventDefault();
        handleUnlock();
    }
});

codeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        window.bitty.dismiss();
    } else if (e.key === 'Enter') {
        e.preventDefault();
        handleCodeSubmit();
    }
});

document.addEventListener('keydown', (e) => {
    if (currentState === State.UNLOCK) return;

    if (currentState === State.ADD) {
        handleAddKeyboard(e);
        return;
    }

    if (e.key === 'Escape') {
        if (currentState === State.DETAIL) {
            switchState(State.LIST);
            renderResults();
            return;
        }
        window.bitty.dismiss();
        return;
    }

    if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        switchState(State.ADD);
        return;
    }

    if (currentState === State.LIST) {
        handleListKeyboard(e);
    } else if (currentState === State.DETAIL) {
        handleDetailKeyboard(e);
    }
});

function handleAddKeyboard(e) {
    if (e.key === 'Escape') {
        e.preventDefault();
        switchState(State.LIST);
        performSearch(searchInput.value);
        return;
    }

    if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        handleSaveItem();
        return;
    }

    if (e.ctrlKey && e.key === 'g') {
        e.preventDefault();
        handleGeneratePassword();
        return;
    }
}

async function handleSaveItem() {
    const name = addName.value.trim();

    if (!name) {
        addStatus.textContent = 'Name is required';
        addStatus.className = 'add-status error';
        addName.focus();
        return;
    }

    addFormInputs().forEach((input) => { input.disabled = true; });
    addStatus.textContent = 'Saving…';
    addStatus.className = 'add-status';

    try {
        const result = await window.bitty.createItem({
            name,
            username: addUsername.value.trim(),
            password: addPassword.value,
            uri: addUri.value.trim(),
            notes: addNotes.value.trim(),
        });

        if (!result.success) {
            addStatus.textContent = result.error || 'Failed to save';
            addStatus.className = 'add-status error';
            addFormInputs().forEach((input) => { input.disabled = false; });
            return;
        }

        switchState(State.LIST);
        await performSearch('');
        showToast('Item created');
    } catch (err) {
        addStatus.textContent = err.message || 'Failed to save';
        addStatus.className = 'add-status error';
        addFormInputs().forEach((input) => { input.disabled = false; });
    }
}
let generatingPassword = false;

async function handleGeneratePassword() {
    if (generatingPassword) return;
    generatingPassword = true;

    addStatus.textContent = 'Generating password…';
    addStatus.className = 'add-status';

    try {
        const result = await window.bitty.generatePassword({ length: 20 });

        if (result.success) {
            addPassword.value = result.password;
            addPassword.focus();
            addStatus.textContent = '';
        }
    } catch (_) {
        addStatus.textContent = '';
    } finally {
        generatingPassword = false;
    }
}

function handleListKeyboard(e) {
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (selectedIndex < items.length - 1) {
            selectedIndex++;
            renderResults();
        }
        return;
    }

    if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (selectedIndex > 0) {
            selectedIndex--;
            renderResults();
        }
        return;
    }

    if (e.key === 'ArrowRight' || (e.key === 'Enter' && items.length > 0)) {
        e.preventDefault();
        if (items[selectedIndex]) {
            openDetail(items[selectedIndex]);
        }
        return;
    }

    if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.length === 1) {
        searchInput.focus();
    }
}

function handleDetailKeyboard(e) {
    const fields = getAvailableFields();

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (selectedFieldIndex < fields.length - 1) {
            selectedFieldIndex++;
            renderDetailFields(currentItem);
        }
        return;
    }

    if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (selectedFieldIndex > 0) {
            selectedFieldIndex--;
            renderDetailFields(currentItem);
        }
        return;
    }

    if (e.key === 'ArrowLeft') {
        e.preventDefault();
        switchState(State.LIST);
        renderResults();
        return;
    }

    if (e.key === 'Enter') {
        e.preventDefault();
        const field = fields[selectedFieldIndex];
        if (field && currentItem) {
            copyField(currentItem.id, field.key);
        }
        return;
    }

    if (e.key === ' ') {
        e.preventDefault();
        const field = fields[selectedFieldIndex];
        if (field && field.masked) {
            passwordRevealed = !passwordRevealed;
            renderDetailFields(currentItem);
        }
        return;
    }
}

function focusActiveInput() {
    setTimeout(() => {
        if (currentState === State.UNLOCK) {
            if (codeInput.style.display !== 'none') {
                codeInput.focus();
            } else if (emailInput.style.display !== 'none') {
                emailInput.focus();
            } else if (passwordInput.style.display !== 'none') {
                passwordInput.focus();
            }
        } else if (currentState === State.LIST) {
            searchInput.focus();
        } else if (currentState === State.ADD) {
            addName.focus();
        }
    }, 50);
}

window.bitty.onShow(async () => {
    if (isTransitioning) return;
    isTransitioning = true;

    try {
        if (currentState === State.LIST || currentState === State.DETAIL) {
            focusActiveInput();
            return;
        }

        focusActiveInput();

        const statusResult = await window.bitty.getStatus();

        if (!statusResult.success || !statusResult.unlocked) {
            const needsLogin = statusResult.success && statusResult.status.status === 'unauthenticated';
            switchState(State.UNLOCK, { needsLogin });
            focusActiveInput();
            return;
        }

        searchInput.value = '';
        switchState(State.LIST);
        statusIndicator.innerHTML = '<span class="status-dot"></span> Unlocked';
        await performSearch('');
        searchInput.focus();
    } finally {
        isTransitioning = false;
    }
});

async function init() {
    switchState(State.UNLOCK, { loading: true });

    const statusResult = await window.bitty.getStatus();

    if (!statusResult.success || statusResult.status.status === 'unauthenticated') {
        switchState(State.UNLOCK, { needsLogin: true });
    } else if (!statusResult.unlocked) {
        switchState(State.UNLOCK, { needsLogin: false });
    } else {
        switchState(State.LIST);
        statusIndicator.innerHTML = '<span class="status-dot"></span> Unlocked';
        await performSearch('');
    }
}

init();
