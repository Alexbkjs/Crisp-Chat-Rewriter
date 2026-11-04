# Crisp Chat Rewriter

Small Chrome extension for [Crisp](https://app.crisp.chat) chat: quick grammar fixes, small-talk reply suggestions, greeting shortcuts and store-link copying. Uses the OpenAI API.

## Features

1. **Alt+Q Grammar Fix** — Press Alt+Q in the editor to fix the grammar of what you wrote. Keeps line breaks; if you keep typing while the request runs, the result is discarded instead of overwriting your text.
2. **Reply Suggestions** — Hover over a customer's avatar next to their message to get 3 short replies for that message, based on the recent conversation. Click one to fill the editor (never sends). Mode can be *On hover*, *Only while holding Alt*, or *Disabled*. Suggestions are cached per message, so re-hovering doesn't call the API again.
3. **Greeting Shortcuts** — Two icons (wave/chat) in the composer tabs bar fill the editor with a greeting using the customer's first name.
4. **Copy Store Link** — A copy icon in front of the customer's employment link in the profile panel. Click copies the URL without the protocol (e.g. `shop.example.com`); Alt+click copies the link text.
5. **Open Store Link** — A second icon next to the copy icon opens your URL prefix + that same URL (without the protocol) in a new tab. Also works with a keyboard shortcut (default Alt+Shift+A).

## Installation

1. Clone or download this repository
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select this folder
5. Open the extension options and enter your OpenAI API key

## Configuration

`chrome://extensions` → Crisp Chat Rewriter → Details → **Extension options**.

- **OpenAI**: API key, model (default `gpt-4.1-mini`). Stored in Chrome sync storage, never in the repo.
- **Reply Suggestions**: on avatar hover / Alt + avatar hover / disabled
- **Open Store Link**: show or hide the icon, URL prefix, keyboard shortcut (or none). The icon is greyed out until a prefix is set.
