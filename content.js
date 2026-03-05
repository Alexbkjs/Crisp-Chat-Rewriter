// Crisp Chat Rewriter — Content Script
(function () {
  'use strict';

  console.log('[Crisp Rewriter] Extension loaded');

  let isProgrammaticInput = false; // guard to ignore our own replaceEditorText input events

  // ── Lexical Editor Helpers ──

  function findLexicalEditor() {
    const active = document.activeElement;
    if (active) {
      const focused = active.closest && active.closest('[data-lexical-editor][contenteditable="true"]');
      if (focused) return focused;
    }
    return (
      Array.from(document.querySelectorAll('[data-lexical-editor][contenteditable="true"]'))
        .find(el => el.offsetParent !== null) || null
    );
  }

  function getEditorText(editor) {
    return (editor && editor.innerText || '').replace(/\u200B/g, '').trim();
  }

  function setCaretAtEnd(node) {
    node.focus();
    const sel = window.getSelection();
    sel.removeAllRanges();
    const range = document.createRange();
    try { range.selectNodeContents(node); } catch { range.selectNode(node); }
    range.collapse(false);
    sel.addRange(range);
  }

  async function replaceEditorText(editor, text) {
    if (!editor) return false;
    isProgrammaticInput = true;

    // Simulate Ctrl+A so Lexical selects everything
    editor.focus();
    editor.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'a', code: 'KeyA', ctrlKey: true, bubbles: true, cancelable: true
    }));
    await new Promise(r => setTimeout(r, 50));

    // Delete selected content
    document.execCommand('delete', false, null);
    await new Promise(r => setTimeout(r, 20));

    // Insert line by line with Shift+Enter for line breaks
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) {
        editor.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter', code: 'Enter', shiftKey: true, bubbles: true, cancelable: true
        }));
        document.execCommand('insertLineBreak', false, null);
      }
      if (lines[i]) {
        document.execCommand('insertText', false, lines[i]);
      }
    }

    editor.dispatchEvent(new Event('input', { bubbles: true }));
    setCaretAtEnd(editor);
    isProgrammaticInput = false;
    return true;
  }

  // ── Shared rewrite function ──

  async function rewriteEditor(editor) {
    if (!editor) return;
    const text = getEditorText(editor);
    if (!text) return;
    const provider = await getProvider();
    const result = await provider.rewrite(text);
    replaceEditorText(editor, result);
  }

  // ── Feature 1: Alt+Q Shortcut ──

  document.addEventListener('keydown', async function (e) {
    const isAltQ = e.altKey && (e.code === 'KeyQ' || (e.key && e.key.toLowerCase() === 'q'));
    if (!isAltQ) return;
    e.preventDefault();
    e.stopImmediatePropagation();

    const editor = findLexicalEditor();
    if (!editor) return;

    try {
      await rewriteEditor(editor);
    } catch (err) {
      console.error('[Crisp Rewriter] Alt+Q error:', err);
    }
  }, true);

  // ── Feature 5: Auto-Rewrite Timer ──

  let autoRewriteRemaining = 0;
  let autoRewriteInterval = null;
  let autoRewriteTimerEl = null;
  let isRewriting = false;
  let needsRewrite = false;       // true when user typed new text that hasn't been rewritten

  function getAutoRewriteSettings() {
    return new Promise(resolve => {
      chrome.storage.sync.get({
        autoRewriteEnabled: false,
        autoRewriteDelay: 5
      }, resolve);
    });
  }

  function stopTimerTick() {
    clearInterval(autoRewriteInterval);
    autoRewriteInterval = null;
  }

  function cancelAutoRewrite() {
    stopTimerTick();
    autoRewriteRemaining = 0;
    needsRewrite = false;
    updateTimerDisplay();
  }

  function updateTimerDisplay() {
    if (!autoRewriteTimerEl) return;
    if (autoRewriteRemaining > 0 && autoRewriteInterval) {
      // Actively counting down
      autoRewriteTimerEl.textContent = `⏱ ${autoRewriteRemaining}s`;
      autoRewriteTimerEl.style.display = 'inline-flex';
      autoRewriteTimerEl.title = 'Click to cancel auto-rewrite';
    } else if (autoRewriteRemaining > 0 && !autoRewriteInterval) {
      // Paused (editor lost focus)
      autoRewriteTimerEl.textContent = `⏸ ${autoRewriteRemaining}s`;
      autoRewriteTimerEl.style.display = 'inline-flex';
      autoRewriteTimerEl.title = 'Paused — focus editor to resume';
    } else if (isRewriting) {
      autoRewriteTimerEl.textContent = '⏳ …';
      autoRewriteTimerEl.style.display = 'inline-flex';
      autoRewriteTimerEl.title = 'Rewriting…';
    } else {
      autoRewriteTimerEl.style.display = 'none';
    }
  }

  function startTicking() {
    if (autoRewriteInterval) return; // already ticking
    autoRewriteInterval = setInterval(() => {
      autoRewriteRemaining--;
      updateTimerDisplay();
      if (autoRewriteRemaining <= 0) {
        stopTimerTick();
        triggerAutoRewrite();
      }
    }, 1000);
  }

  async function resetCountdown() {
    const settings = await getAutoRewriteSettings();
    if (!settings.autoRewriteEnabled) return;

    stopTimerTick();
    autoRewriteRemaining = settings.autoRewriteDelay;
    needsRewrite = true;
    updateTimerDisplay();

    // Only tick if editor is focused
    const editor = findLexicalEditor();
    if (editor && (document.activeElement === editor || editor.contains(document.activeElement))) {
      startTicking();
    }
  }

  async function triggerAutoRewrite() {
    const editor = findLexicalEditor();
    if (!editor || isRewriting) return;

    const text = getEditorText(editor);
    if (!text) { cancelAutoRewrite(); return; }

    isRewriting = true;
    updateTimerDisplay();

    try {
      await rewriteEditor(editor);
      needsRewrite = false;
    } catch (err) {
      console.error('[Crisp Rewriter] Auto-rewrite error:', err);
    } finally {
      isRewriting = false;
      autoRewriteRemaining = 0;
      updateTimerDisplay();
    }
  }

  // Listen for user input on any lexical editor — reset timer on new input
  document.addEventListener('input', async (e) => {
    if (isProgrammaticInput) return; // ignore our own replaceEditorText calls
    if (!e.target || !e.target.closest) return;
    const editor = e.target.closest('[data-lexical-editor][contenteditable="true"]');
    if (!editor) return;

    // Only when editor is focused
    if (document.activeElement !== editor && !editor.contains(document.activeElement)) return;

    const settings = await getAutoRewriteSettings();
    if (!settings.autoRewriteEnabled) return;

    // New user input → reset countdown
    resetCountdown();
  }, true);

  // Pause ticking when editor loses focus (preserve remaining time)
  document.addEventListener('focusout', (e) => {
    if (!e.target || !e.target.closest) return;
    const editor = e.target.closest('[data-lexical-editor][contenteditable="true"]');
    if (editor) {
      stopTimerTick(); // pause, keep autoRewriteRemaining & needsRewrite
      updateTimerDisplay();
    }
  }, true);

  // Resume ticking when editor regains focus (if there's remaining time)
  document.addEventListener('focusin', (e) => {
    if (!e.target || !e.target.closest) return;
    const editor = e.target.closest('[data-lexical-editor][contenteditable="true"]');
    if (editor && needsRewrite && autoRewriteRemaining > 0) {
      startTicking();
    }
  }, true);

  function injectTimerElement() {
    const tabsBars = document.querySelectorAll('.c-base-tabs__items');
    const tabsBar = tabsBars.length >= 2 ? tabsBars[1] : tabsBars[0];
    if (!tabsBar || tabsBar.querySelector('.crx-auto-timer')) return;

    const timer = document.createElement('button');
    timer.className = 'crx-auto-timer';
    timer.style.display = 'none';
    timer.addEventListener('click', () => {
      clearAutoRewrite();
    });
    tabsBar.appendChild(timer);
    autoRewriteTimerEl = timer;
  }

  // ── Feature 2: "Rewrite" Button ──

  function injectRewriteButton() {
    const tabsBars = document.querySelectorAll('.c-base-tabs__items');
    const tabsBar = tabsBars.length >= 2 ? tabsBars[1] : tabsBars[0];
    if (!tabsBar || tabsBar.querySelector('.crx-rewrite-btn')) return;

    const btn = document.createElement('button');
    btn.className = 'crx-rewrite-btn';
    btn.innerHTML = '<span class="crx-rewrite-btn__icon">✨</span> Rewrite';
    btn.title = 'Rewrite text with AI';

    btn.addEventListener('click', async () => {
      if (btn.classList.contains('crx-rewrite-btn--loading')) return;

      const editor = findLexicalEditor();
      if (!editor) return;

      const text = getEditorText(editor);
      if (!text) return;

      btn.classList.add('crx-rewrite-btn--loading');
      const origText = btn.innerHTML;
      btn.innerHTML = '<span class="crx-rewrite-btn__icon">⏳</span> Rewriting…';

      try {
        const provider = await getProvider();
        const result = await provider.rewrite(text);
        replaceEditorText(editor, result);
      } catch (err) {
        console.error('[Crisp Rewriter] Rewrite button error:', err);
      } finally {
        btn.classList.remove('crx-rewrite-btn--loading');
        btn.innerHTML = origText;
      }
    });

    tabsBar.appendChild(btn);
  }

  // ── Feature 3: Reply Suggestions on Hover ──

  let activePopup = null;
  let popupTimeout = null;
  let hoveredBubble = null;

  function removePopup() {
    if (activePopup) {
      activePopup.remove();
      activePopup = null;
    }
    hoveredBubble = null;
  }

  function showReplySuggestions(bubbleEl) {
    if (hoveredBubble === bubbleEl) return;
    hoveredBubble = bubbleEl;
    removePopup();

    const messageText = bubbleEl.textContent.trim();
    if (!messageText) return;

    const popup = document.createElement('div');
    popup.className = 'crx-reply-popup';
    popup.innerHTML = `
      <div class="crx-reply-popup__title">Suggested Replies</div>
      <div class="crx-reply-popup__loading">Generating suggestions…</div>
    `;

    // Position below the bubble
    const rect = bubbleEl.getBoundingClientRect();
    popup.style.position = 'fixed';
    popup.style.top = (rect.bottom + 4) + 'px';
    popup.style.left = rect.left + 'px';

    document.body.appendChild(popup);
    activePopup = popup;

    // Keep popup alive when hovering over it
    popup.addEventListener('mouseenter', () => clearTimeout(popupTimeout));
    popup.addEventListener('mouseleave', () => {
      popupTimeout = setTimeout(removePopup, 200);
    });

    // Fetch suggestions
    (async () => {
      try {
        const openai = await getOpenAIProvider();
        const suggestions = await openai.suggestReplies(messageText);

        if (activePopup !== popup) return; // stale

        popup.innerHTML = `<div class="crx-reply-popup__title">Suggested Replies</div>`;
        suggestions.forEach(suggestion => {
          const item = document.createElement('button');
          item.className = 'crx-reply-popup__item';
          item.textContent = suggestion;
          item.addEventListener('click', () => {
            const editor = findLexicalEditor();
            if (editor) replaceEditorText(editor, suggestion);
            removePopup();
          });
          popup.appendChild(item);
        });
      } catch (err) {
        console.error('[Crisp Rewriter] Reply suggestions error:', err);
        if (activePopup === popup) {
          popup.querySelector('.crx-reply-popup__loading').textContent = 'Failed to load suggestions';
        }
      }
    })();
  }

  document.addEventListener('mouseenter', (e) => {
    if (!e.target || !e.target.closest) return;
    const bubble = e.target.closest(
      '.c-conversation-box-content-message--user .c-conversation-box-content-message-bubble__content'
    );
    if (bubble) {
      clearTimeout(popupTimeout);
      showReplySuggestions(bubble);
    }
  }, true);

  document.addEventListener('mouseleave', (e) => {
    if (!e.target || !e.target.closest) return;
    const bubble = e.target.closest(
      '.c-conversation-box-content-message--user .c-conversation-box-content-message-bubble__content'
    );
    if (bubble) {
      popupTimeout = setTimeout(removePopup, 300);
    }
  }, true);

  // ── Feature 4: Greeting Icons ──

  function getFirstName() {
    const nick = document.querySelector('.c-conversation-profile__nickname');
    if (!nick) return '';
    return (nick.textContent || '').trim().split(/\s+/)[0] || '';
  }

  function injectGreetingIcons() {
    const tabsBars = document.querySelectorAll('.c-base-tabs__items');
    const tabsBar = tabsBars.length >= 2 ? tabsBars[1] : tabsBars[0];
    if (!tabsBar || tabsBar.querySelector('.crx-greeting-icon')) return;

    const greetings = [
      { icon: '👋', template: name => `Hello ${name}! Thank you for reaching out to us!` },
      { icon: '💬', template: name => `Hello ${name}! How can I assist you today?` }
    ];

    greetings.forEach(({ icon, template }) => {
      const btn = document.createElement('button');
      btn.className = 'crx-greeting-icon';
      btn.textContent = icon;
      btn.addEventListener('click', () => {
        const firstName = getFirstName();
        const editor = findLexicalEditor();
        if (editor && firstName) {
          replaceEditorText(editor, template(firstName));
        }
      });
      tabsBar.appendChild(btn);
    });
  }

  // ── Injection Loop ──
  // Crisp is a SPA — re-inject UI elements when DOM changes

  function injectAll() {
    injectRewriteButton();
    injectTimerElement();
    injectGreetingIcons();
  }

  // Run on load and observe for SPA navigation
  const observer = new MutationObserver(() => injectAll());
  observer.observe(document.body, { childList: true, subtree: true });
  injectAll();
})();
