const DEFAULTS = {
  openaiKey: '',
  openaiModel: 'gpt-4.1-mini',
  replySuggestMode: 'hover',
  storeLinkOpenVisible: true,
  storeLinkOpenPrefix: '',
  storeLinkOpenShortcut: 'Alt+Shift+A'
};

// Settings from removed features (provider choice, built-in Rewriter, auto-rewrite timer)
const LEGACY_KEYS = [
  'provider', 'rewriterTone', 'rewriterLength', 'autoRewriteEnabled', 'autoRewriteDelay',
  'replySuggestDelay'
];

const shortcutInput = document.getElementById('store-link-open-shortcut');
const shortcutHint = document.getElementById('store-link-open-shortcut-hint');

// Load saved settings
chrome.storage.sync.get(DEFAULTS, (settings) => {
  document.getElementById('openai-key').value = settings.openaiKey;
  document.getElementById('openai-model').value = settings.openaiModel;
  document.getElementById('reply-suggest-mode').value = settings.replySuggestMode;
  document.getElementById('store-link-open-visible').checked = settings.storeLinkOpenVisible;
  document.getElementById('store-link-open-prefix').value = settings.storeLinkOpenPrefix;
  shortcutInput.value = settings.storeLinkOpenShortcut;
});

// Shortcut field: records the combination pressed while it has focus
const SHORTCUT_HINT = shortcutHint.textContent;

function showShortcutHint(message) {
  shortcutHint.textContent = message || SHORTCUT_HINT;
  shortcutHint.classList.toggle('error', Boolean(message));
}

shortcutInput.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') return;
  e.preventDefault();

  const shortcut = shortcutFromEvent(e);
  if (!shortcut) return; // only modifiers held so far
  if (!e.ctrlKey && !e.altKey && !e.metaKey) {
    showShortcutHint('Include Ctrl, Alt or Meta, otherwise the shortcut would fire while typing.');
  } else if (e.altKey && e.code === 'KeyQ') {
    showShortcutHint('Alt+Q is already used for the grammar fix.');
  } else {
    shortcutInput.value = shortcut;
    showShortcutHint('');
  }
});

document.getElementById('store-link-open-shortcut-clear').addEventListener('click', () => {
  shortcutInput.value = '';
  showShortcutHint('');
});

// Returns the prefix to store (a missing protocol becomes https://), or null if it can't be opened
function normalizePrefix(value) {
  const prefix = value.trim();
  if (!prefix) return '';
  if (/^https?:\/\//i.test(prefix)) return prefix;
  return /^[a-z][a-z0-9+.-]*:/i.test(prefix) ? null : `https://${prefix}`;
}

// Save
document.getElementById('save').addEventListener('click', () => {
  const saveError = document.getElementById('save-error');
  const prefixInput = document.getElementById('store-link-open-prefix');
  const prefix = normalizePrefix(prefixInput.value);
  if (prefix === null) {
    saveError.textContent = 'The URL prefix must start with http:// or https://';
    return;
  }
  saveError.textContent = '';
  prefixInput.value = prefix;

  const settings = {
    openaiKey: document.getElementById('openai-key').value.trim(),
    openaiModel: document.getElementById('openai-model').value.trim() || DEFAULTS.openaiModel,
    replySuggestMode: document.getElementById('reply-suggest-mode').value,
    storeLinkOpenVisible: document.getElementById('store-link-open-visible').checked,
    storeLinkOpenPrefix: prefix,
    storeLinkOpenShortcut: shortcutInput.value
  };

  chrome.storage.sync.remove(LEGACY_KEYS);
  chrome.storage.sync.set(settings, () => {
    const saved = document.getElementById('saved');
    saved.style.display = 'inline';
    setTimeout(() => saved.style.display = 'none', 2000);
  });
});
