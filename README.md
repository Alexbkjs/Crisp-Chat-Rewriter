# Crisp Chat Rewriter

Chrome extension for AI-powered text rewriting, reply suggestions, and greeting shortcuts in [Crisp](https://app.crisp.chat) chat.

## Features

1. **Alt+Q Rewrite** — Press Alt+Q to rewrite the editor text using the selected LLM provider. Preserves line breaks.
2. **Rewrite Button** — Click the "Rewrite" button in the editor tabs bar.
3. **Auto-Rewrite Timer** — Automatically rewrites text after a configurable delay (default 5s). Pauses when the editor loses focus, resumes on re-focus. Click the timer badge to cancel. Enable/disable in options.
4. **Reply Suggestions** — Hover over a customer message to see 3 AI-generated reply suggestions. Click one to fill the editor (never sends).
5. **Greeting Shortcuts** — Two icons (wave/chat) in the editor tabs bar fill the editor with greeting templates using the customer's first name.

## LLM Providers

- **OpenAI API** — Configurable API key and model via options page.
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
- **OpenAI**: API key, model name
- **Rewriter API**: tone, length
- **Auto-Rewrite**: enable/disable, delay in seconds
