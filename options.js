const DEFAULTS = {
  provider: 'openai',
  openaiKey: '',
  openaiModel: 'gpt-4.1-mini',
  rewriterTone: 'more-formal',
  rewriterLength: 'as-is',
  autoRewriteEnabled: false,
  autoRewriteDelay: 5,
  replySuggestMode: 'hover'
};

const providerSelect = document.getElementById('provider');
const openaiSettings = document.getElementById('openai-settings');
const rewriterSettings = document.getElementById('rewriter-settings');

function toggleSections() {
  const isOpenAI = providerSelect.value === 'openai';
  openaiSettings.classList.toggle('visible', isOpenAI);
  rewriterSettings.classList.toggle('visible', !isOpenAI);
}

providerSelect.addEventListener('change', toggleSections);

// Load saved settings
chrome.storage.sync.get(DEFAULTS, (settings) => {
  providerSelect.value = settings.provider;
  document.getElementById('openai-key').value = settings.openaiKey;
  document.getElementById('openai-model').value = settings.openaiModel;
  document.getElementById('rewriter-tone').value = settings.rewriterTone;
  document.getElementById('rewriter-length').value = settings.rewriterLength;
  document.getElementById('auto-rewrite-enabled').checked = settings.autoRewriteEnabled;
  document.getElementById('auto-rewrite-delay').value = settings.autoRewriteDelay;
  document.getElementById('reply-suggest-mode').value = settings.replySuggestMode;
  toggleSections();
});

// Save
document.getElementById('save').addEventListener('click', () => {
  const settings = {
    provider: providerSelect.value,
    openaiKey: document.getElementById('openai-key').value,
    openaiModel: document.getElementById('openai-model').value,
    rewriterTone: document.getElementById('rewriter-tone').value,
    rewriterLength: document.getElementById('rewriter-length').value,
    autoRewriteEnabled: document.getElementById('auto-rewrite-enabled').checked,
    autoRewriteDelay: parseInt(document.getElementById('auto-rewrite-delay').value, 10) || 5,
    replySuggestMode: document.getElementById('reply-suggest-mode').value
  };

  chrome.storage.sync.set(settings, () => {
    const saved = document.getElementById('saved');
    saved.style.display = 'inline';
    setTimeout(() => saved.style.display = 'none', 2000);
  });
});
