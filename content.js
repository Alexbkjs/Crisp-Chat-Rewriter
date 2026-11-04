// Crisp Chat Rewriter — Content Script
(function () {
  'use strict';

  console.log('[Crisp Rewriter] Extension loaded');

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
    return true;
  }

  // ── Feature 1: Alt+Q Grammar Fix ──

  let isRewriting = false;

  async function rewriteEditor(editor) {
    if (!editor || isRewriting) return;
    const text = getEditorText(editor);
    if (!text) return;

    isRewriting = true;
    try {
      const openai = await getOpenAIProvider();
      const result = await openai.rewrite(text);
      // Don't clobber text the agent typed (or a different conversation) while we waited
      if (!editor.isConnected || getEditorText(editor) !== text) {
        console.warn('[Crisp Rewriter] Editor changed during rewrite — result discarded');
        return;
      }
      await replaceEditorText(editor, result.trim());
    } finally {
      isRewriting = false;
    }
  }

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

  // Our controls live only in the composer tabs bar, never in the conversation menu header
  function findComposerTabsBar() {
    return document.querySelector('.c-conversation-box__tabs .c-base-tabs__items')
      || document.querySelector('.c-conversation-box__tabs');
  }

  // ── Feature 2: Reply Suggestions on Avatar Hover ──
  // Hovering a customer's avatar shows suggestions for that customer message.
  // Modes: 'hover', 'alt' (only while Alt is held), 'off'

  const BUBBLE_SELECTOR =
    '.c-conversation-box-content-message--user .c-conversation-box-content-message-bubble__content';
  const AVATAR_SELECTOR = '.c-conversation-box-content-message__avatar.c-base-avatar--visitor';

  // Cached settings, kept in sync with the options page
  const replySettings = { replySuggestMode: 'hover' };
  chrome.storage.sync.get(replySettings, s => Object.assign(replySettings, s));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    Object.keys(replySettings).forEach(key => {
      if (changes[key]) replySettings[key] = changes[key].newValue;
    });
    if (replySettings.replySuggestMode === 'off') removePopup();
  });

  let activePopup = null;
  let popupAvatar = null;    // avatar the open popup belongs to
  let pointerAvatar = null;  // avatar currently under the mouse
  let popupTimeout = null;
  // Grace periods before the popup closes, so there's time to move the mouse onto it
  const CLOSE_AFTER_AVATAR_MS = 1200;
  const CLOSE_AFTER_POPUP_MS = 800;
  let altDown = false;
  const suggestionCache = new Map(); // message text → Promise<string[]>

  function removePopup() {
    if (activePopup) {
      activePopup.remove();
      activePopup = null;
    }
    popupAvatar = null;
  }

  // The customer message an avatar belongs to: the last bubble in its message block,
  // or else the closest customer bubble before it
  function findBubbleForAvatar(avatar) {
    const message = avatar.closest('.c-conversation-box-content-message');
    const own = message ? message.querySelectorAll('.c-conversation-box-content-message-bubble__content') : [];
    if (own.length) return own[own.length - 1];

    const preceding = Array.from(document.querySelectorAll(BUBBLE_SELECTOR))
      .filter(b => avatar.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING);
    return preceding[preceding.length - 1] || null;
  }

  function maybeShowSuggestions(avatar) {
    const mode = replySettings.replySuggestMode;
    if (mode === 'off') return;
    if (mode === 'alt' && !altDown) return;
    if (avatar === popupAvatar) return;

    const bubble = findBubbleForAvatar(avatar);
    if (bubble) showReplySuggestions(bubble, avatar);
  }

  // Up to `limit` messages before the hovered one, so short replies like "Yes please" make sense
  function getConversationContext(bubbleEl, limit = 6) {
    const bubbles = Array.from(document.querySelectorAll('.c-conversation-box-content-message-bubble__content'));
    const index = bubbles.indexOf(bubbleEl);
    if (index <= 0) return [];
    return bubbles.slice(Math.max(0, index - limit), index)
      .map(el => ({
        from: el.closest('.c-conversation-box-content-message--user') ? 'customer' : 'agent',
        text: el.textContent.trim()
      }))
      .filter(m => m.text);
  }

  // Re-hovering the same message reuses its suggestions instead of calling the API again
  function getSuggestions(messageText, context) {
    const key = JSON.stringify([context, messageText]);
    if (!suggestionCache.has(key)) {
      const request = getOpenAIProvider().then(openai => openai.suggestReplies(messageText, context));
      request.catch(() => suggestionCache.delete(key));
      suggestionCache.set(key, request);
    }
    return suggestionCache.get(key);
  }

  function showReplySuggestions(bubbleEl, avatar) {
    clearTimeout(popupTimeout); // a pending close belongs to the previous popup
    removePopup();

    const messageText = bubbleEl.textContent.trim();
    if (!messageText) return;
    popupAvatar = avatar;

    const popup = document.createElement('div');
    popup.className = 'crx-reply-popup';
    popup.innerHTML = `
      <div class="crx-reply-popup__title">Suggested Replies</div>
      <div class="crx-reply-popup__loading">Generating suggestions…</div>
    `;

    // Right next to the avatar so the mouse can reach it; grow upwards near the bottom of the screen
    const rect = avatar.getBoundingClientRect();
    popup.style.position = 'fixed';
    popup.style.left = Math.max(8, Math.min(rect.right + 6, window.innerWidth - 368)) + 'px';
    if (window.innerHeight - rect.top < 240 && rect.bottom > window.innerHeight - rect.top) {
      popup.style.bottom = (window.innerHeight - rect.bottom) + 'px';
    } else {
      popup.style.top = rect.top + 'px';
    }

    document.body.appendChild(popup);
    activePopup = popup;

    // Keep popup alive when hovering over it
    popup.addEventListener('mouseenter', () => clearTimeout(popupTimeout));
    popup.addEventListener('mouseleave', () => {
      clearTimeout(popupTimeout);
      popupTimeout = setTimeout(removePopup, CLOSE_AFTER_POPUP_MS);
    });

    // Fetch suggestions
    (async () => {
      try {
        const suggestions = await getSuggestions(messageText, getConversationContext(bubbleEl));

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
    const avatar = e.target.closest(AVATAR_SELECTOR);
    if (!avatar) return;
    pointerAvatar = avatar;
    altDown = e.altKey;
    if (avatar === popupAvatar) clearTimeout(popupTimeout);
    maybeShowSuggestions(avatar);
  }, true);

  document.addEventListener('mouseleave', (e) => {
    if (!e.target || !e.target.closest) return;
    const avatar = e.target.closest(AVATAR_SELECTOR);
    if (!avatar) return;
    // Moving between elements inside the same avatar is not leaving it
    if (e.relatedTarget && avatar.contains(e.relatedTarget)) return;

    if (pointerAvatar === avatar) pointerAvatar = null;
    if (popupAvatar === avatar) {
      clearTimeout(popupTimeout);
      popupTimeout = setTimeout(removePopup, CLOSE_AFTER_AVATAR_MS);
    }
  }, true);

  // Alt mode: pressing Alt while hovering an avatar shows the suggestions
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Alt') return;
    altDown = true;
    if (replySettings.replySuggestMode !== 'alt' || !pointerAvatar) return;
    e.preventDefault(); // keep Chrome from focusing its menu on Alt
    if (!e.repeat) maybeShowSuggestions(pointerAvatar);
  }, true);

  document.addEventListener('keyup', (e) => {
    if (e.key !== 'Alt') return;
    altDown = false;
    if (replySettings.replySuggestMode === 'alt' && pointerAvatar) e.preventDefault();
  }, true);

  window.addEventListener('blur', () => {
    altDown = false;
  });

  // ── Feature 3: Greeting Icons ──

  function getFirstName() {
    const nick = document.querySelector('.c-conversation-profile__nickname');
    if (!nick) return '';
    return (nick.textContent || '').trim().split(/\s+/)[0] || '';
  }

  function injectGreetingIcons() {
    const tabsBar = findComposerTabsBar();
    if (!tabsBar || tabsBar.querySelector('.crx-greeting-icon')) return;

    const greetings = [
      { icon: '👋', template: hello => `${hello}! Thank you for reaching out to us!` },
      { icon: '💬', template: hello => `${hello}! How can I assist you today?` }
    ];

    greetings.forEach(({ icon, template }) => {
      const btn = document.createElement('button');
      btn.className = 'crx-greeting-icon';
      btn.textContent = icon;
      btn.title = template('Hello {name}');
      btn.addEventListener('click', () => {
        const firstName = getFirstName();
        const editor = findLexicalEditor();
        if (editor) {
          replaceEditorText(editor, template(firstName ? `Hello ${firstName}` : 'Hello'));
        }
      });
      tabsBar.appendChild(btn);
    });
  }

  // ── Feature 4: Copy / Open Store Link ──
  // Icons before the profile's employment link. Copy: click copies the URL without the protocol,
  // Alt+click copies the link text. Open: opens the configured prefix + that same URL in a new
  // tab, by click or keyboard shortcut.

  const STORE_LINK_SELECTOR = 'a.c-base-link.c-conversation-profile__employment';

  // Cached settings, kept in sync with the options page
  const storeLinkSettings = {
    storeLinkOpenVisible: true,
    storeLinkOpenPrefix: '',
    storeLinkOpenShortcut: 'Alt+Shift+A'
  };
  chrome.storage.sync.get(storeLinkSettings, s => {
    Object.assign(storeLinkSettings, s);
    syncOpenLinkIcons();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    Object.keys(storeLinkSettings).forEach(key => {
      if (changes[key]) storeLinkSettings[key] = changes[key].newValue;
    });
    syncOpenLinkIcons();
  });

  const COPY_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  const OPEN_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/></svg>';
  const CHECK_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

  function urlWithoutProtocol(link) {
    const href = link.getAttribute('href') || link.href || '';
    return href.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/\/$/, '');
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API can be blocked (e.g. document not focused) — fall back to execCommand
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
  }

  function getOpenLinkPrefix() {
    const prefix = (storeLinkSettings.storeLinkOpenPrefix || '').trim();
    return /^https?:\/\//i.test(prefix) ? prefix : '';
  }

  function openStoreLink(link) {
    const prefix = getOpenLinkPrefix();
    const value = urlWithoutProtocol(link);
    if (!prefix || !value) return;
    window.open(prefix + value, '_blank', 'noopener');
  }

  function syncOpenLinkIcon(btn) {
    const shortcut = storeLinkSettings.storeLinkOpenShortcut;
    const configured = Boolean(getOpenLinkPrefix());
    btn.hidden = !storeLinkSettings.storeLinkOpenVisible;
    btn.classList.toggle('crx-open-link--disabled', !configured);
    btn.title = configured
      ? `Open in new tab${shortcut ? ` (${shortcut})` : ''}`
      : 'Set the URL prefix in the extension options';
  }

  function syncOpenLinkIcons() {
    document.querySelectorAll('.crx-open-link').forEach(syncOpenLinkIcon);
  }

  function createOpenLinkIcon(link) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'crx-copy-link crx-open-link';
    btn.innerHTML = OPEN_ICON;
    syncOpenLinkIcon(btn);
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openStoreLink(link);
    });
    return btn;
  }

  document.addEventListener('keydown', (e) => {
    const shortcut = storeLinkSettings.storeLinkOpenShortcut;
    // isTrusted: replaceEditorText dispatches synthetic key events of its own
    if (!shortcut || e.repeat || !e.isTrusted || shortcutFromEvent(e) !== shortcut) return;
    e.preventDefault();
    e.stopImmediatePropagation();

    const links = Array.from(document.querySelectorAll(STORE_LINK_SELECTOR));
    const link = links.find(el => el.offsetParent !== null) || links[0];
    if (link) openStoreLink(link);
  }, true);

  function injectCopyLinkIcons() {
    document.querySelectorAll(STORE_LINK_SELECTOR).forEach(link => {
      const prev = link.previousElementSibling;
      if (prev && prev.classList.contains('crx-open-link')) return;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'crx-copy-link';
      btn.innerHTML = COPY_ICON;
      btn.title = 'Copy URL (Alt+click: copy text)';

      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Read the link at click time — Crisp reuses the element when switching conversations
        const value = e.altKey ? (link.textContent || '').trim() : urlWithoutProtocol(link);
        if (!value) return;
        await copyText(value);
        btn.innerHTML = CHECK_ICON;
        btn.classList.add('crx-copy-link--done');
        btn.title = `Copied: ${value}`;
        setTimeout(() => {
          btn.innerHTML = COPY_ICON;
          btn.classList.remove('crx-copy-link--done');
          btn.title = 'Copy URL (Alt+click: copy text)';
        }, 1200);
      });

      link.before(btn, createOpenLinkIcon(link));
    });
  }

  // ── Injection Loop ──
  // Crisp is a SPA — re-inject UI elements when DOM changes

  function injectAll() {
    injectGreetingIcons();
    injectCopyLinkIcons();
  }

  // Run on load and observe for SPA navigation
  const observer = new MutationObserver(() => injectAll());
  observer.observe(document.body, { childList: true, subtree: true });
  injectAll();
})();
