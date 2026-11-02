const DEFAULTS = {
  openaiKey: '',
  openaiModel: 'gpt-4.1-mini',
  replySuggestMode: 'hover'
};

// Settings from removed features (provider choice, built-in Rewriter, auto-rewrite timer)
const LEGACY_KEYS = [
  'provider', 'rewriterTone', 'rewriterLength', 'autoRewriteEnabled', 'autoRewriteDelay',
  'replySuggestDelay'
];

// Load saved settings
chrome.storage.sync.get(DEFAULTS, (settings) => {
  document.getElementById('openai-key').value = settings.openaiKey;
  document.getElementById('openai-model').value = settings.openaiModel;
  document.getElementById('reply-suggest-mode').value = settings.replySuggestMode;
});

// Save
document.getElementById('save').addEventListener('click', () => {
  const settings = {
    openaiKey: document.getElementById('openai-key').value.trim(),
    openaiModel: document.getElementById('openai-model').value.trim() || DEFAULTS.openaiModel,
    replySuggestMode: document.getElementById('reply-suggest-mode').value
  };

  chrome.storage.sync.remove(LEGACY_KEYS);
  chrome.storage.sync.set(settings, () => {
    const saved = document.getElementById('saved');
    saved.style.display = 'inline';
    setTimeout(() => saved.style.display = 'none', 2000);
  });
});
