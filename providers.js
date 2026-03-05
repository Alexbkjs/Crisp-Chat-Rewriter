// LLM Provider Abstraction

class RewriterProvider {
  async rewrite(text) {
    if (!('ai' in self) || !('rewriter' in self.ai)) {
      throw new Error('Built-in Rewriter API is not available in this browser.');
    }

    const settings = await chrome.storage.sync.get({
      rewriterTone: 'more-formal',
      rewriterLength: 'as-is'
    });

    const rewriter = await self.ai.rewriter.create({
      tone: settings.rewriterTone,
      length: settings.rewriterLength
    });

    const result = await rewriter.rewrite(text);
    rewriter.destroy();
    return result;
  }
}

class OpenAIProvider {
  constructor(apiKey, model) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async rewrite(text) {
    return this._chat([
      {
        role: 'system',
        content: 'You are a helpful assistant. Refine the provided text to fix grammar. Preserve the original line breaks and paragraph structure exactly. Do not respond with system messages, only pure refactored text that was provided.'
      },
      { role: 'user', content: text }
    ]);
  }

  async suggestReplies(customerMessage) {
    const response = await this._chat([
      {
        role: 'system',
        content: 'You are a support agent. Suggest 3 short professional replies to this customer message. Return ONLY a JSON array of 3 strings, no other text.'
      },
      { role: 'user', content: customerMessage }
    ]);

    try {
      const parsed = JSON.parse(response);
      if (Array.isArray(parsed) && parsed.length >= 3) {
        return parsed.slice(0, 3);
      }
    } catch {}

    // Fallback: split by newlines and clean up
    const lines = response.split('\n')
      .map(l => l.replace(/^\d+[\.\)]\s*/, '').replace(/^["']|["']$/g, '').trim())
      .filter(l => l.length > 0);
    return lines.slice(0, 3);
  }

  async _chat(messages) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: 0.7
      })
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI API error (${res.status}): ${err}`);
    }

    const data = await res.json();
    return data?.choices?.[0]?.message?.content || '[No response]';
  }
}

async function getProvider() {
  const settings = await chrome.storage.sync.get({
    provider: 'openai',
    openaiKey: CONFIG.OPENAI_API_KEY,
    openaiModel: CONFIG.OPENAI_MODEL
  });

  if (settings.provider === 'rewriter') {
    return new RewriterProvider();
  }

  return new OpenAIProvider(settings.openaiKey, settings.openaiModel);
}

async function getOpenAIProvider() {
  const settings = await chrome.storage.sync.get({
    openaiKey: CONFIG.OPENAI_API_KEY,
    openaiModel: CONFIG.OPENAI_MODEL
  });

  return new OpenAIProvider(settings.openaiKey, settings.openaiModel);
}
