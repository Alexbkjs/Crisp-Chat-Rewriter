# Crisp Chat Rewriter

Chrome extension for AI-powered text rewriting, reply suggestions, and greeting shortcuts in [Crisp](https://app.crisp.chat) chat.

## Features

1. **Alt+Q Rewrite** — Press Alt+Q to rewrite the editor text using the selected LLM provider. Preserves line breaks.
2. **Auto-Rewrite Timer** — Automatically rewrites text after a configurable delay (default 5s). Pauses when the editor loses focus, resumes on re-focus. Click the timer badge to cancel. Enable/disable in options.
3. **Reply Suggestions** — Hover over a customer's avatar next to their message to see 3 AI-generated reply suggestions for that message. Click one to fill the editor (never sends). Mode can be *On hover*, *Only while holding Alt*, or *Disabled*. Suggestions are cached per message, so re-hovering doesn't call the API again.
4. **Greeting Shortcuts** — Two icons (wave/chat) in the composer tabs bar fill the editor with greeting templates using the customer's first name.
5. **Copy Store Link** — A copy icon in front of the customer's employment link in the profile panel. Click copies the URL without the protocol (e.g. `shop.example.com`); Alt+click copies the link text.

## LLM Providers

- **OpenAI API** — API key and model (default `gpt-4.1-mini`) set on the options page. The key is stored in Chrome sync storage, never in the repo.
- **Built-in Rewriter API** — Uses Chrome's local Gemini Nano (when available). Configurable tone and length.

Reply suggestions always use OpenAI. Greetings are template-based (no LLM).

## Installation

1. Clone or download this repository
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select this folder
5. Open extension options to configure your API key and preferences

## Configuration

Right-click the extension icon → **Options**, or go to `chrome://extensions` → Crisp Chat Rewriter → Details → Extension options.

- **Provider**: OpenAI API or Built-in Rewriter API
- **OpenAI**: API key, model name (default `gpt-4.1-mini`)
- **Rewriter API**: tone, length
- **Auto-Rewrite**: enable/disable, delay in seconds
- **Reply Suggestions**: mode (on avatar hover / Alt + avatar hover / disabled)
