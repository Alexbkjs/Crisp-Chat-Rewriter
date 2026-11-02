// OpenAI client: grammar fixes (Alt+Q) and reply suggestions

const DEFAULT_OPENAI_MODEL = 'gpt-4.1-mini';

class OpenAIProvider {
  constructor(apiKey, model) {
    this.apiKey = (apiKey || '').trim();
    this.model = (model || '').trim() || DEFAULT_OPENAI_MODEL;
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

  // context: optional earlier messages, [{ from: 'customer' | 'agent', text }]
  async suggestReplies(customerMessage, context = []) {
    const transcript = context
      .map(m => `${m.from === 'customer' ? 'Customer' : 'Agent'}: ${m.text}`)
      .join('\n');

    const response = await this._chat([
      {
        role: 'system',
        content: [
          'You are a friendly, professional customer support agent writing in a live chat.',
          'Write 3 different replies the agent could send to the customer\'s latest message.',
          'Each reply must be a complete, natural chat message addressed to the customer (1-2 sentences), that moves the conversation forward.',
          'Use the earlier conversation, if provided, to understand short messages like "Yes please" or "ok".',
          'Respond with a JSON object only, in exactly this shape: {"replies": ["...", "...", "..."]}.',
          'No markdown, no code fences, no explanations.'
        ].join(' ')
      },
      {
        role: 'user',
        content: transcript
          ? `Earlier conversation:\n${transcript}\n\nCustomer's latest message:\n${customerMessage}`
          : `Customer's latest message:\n${customerMessage}`
      }
    ], { response_format: { type: 'json_object' } });

    return parseReplies(response);
  }

  async _chat(messages, extra = {}) {
    if (!this.apiKey) throw new Error('OpenAI API key is not set — add it in the extension options');
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: 0.7,
        ...extra
      })
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI API error (${res.status}): ${err}`);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content || !content.trim()) throw new Error('OpenAI API returned an empty response');
    return content;
  }
}

// Pull reply strings out of the model output, tolerating code fences or a bare array,
// and drop anything that is JSON syntax rather than an actual message
function parseReplies(response) {
  const raw = String(response).replace(/```(?:json)?/gi, '').trim();

  const candidates = [raw];
  const objMatch = raw.match(/\{[\s\S]*\}/);
  const arrMatch = raw.match(/\[[\s\S]*\]/);
  if (objMatch) candidates.push(objMatch[0]);
  if (arrMatch) candidates.push(arrMatch[0]);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const list = Array.isArray(parsed) ? parsed : parsed && parsed.replies;
      if (Array.isArray(list)) {
        const replies = list.filter(r => typeof r === 'string' && r.trim()).map(r => r.trim());
        if (replies.length) return replies.slice(0, 3);
      }
    } catch {}
  }

  // Last resort: one reply per line, without list markers, quotes or JSON punctuation
  return raw.split('\n')
    .map(l => l.trim()
      .replace(/^[-*•]\s*|^\d+[.)]\s*/, '')
      .replace(/,$/, '')
      .replace(/^["']|["']$/g, '')
      .trim())
    .filter(l => /[a-z0-9]/i.test(l) && !/^"?replies"?\s*:/i.test(l))
    .slice(0, 3);
}

async function getOpenAIProvider() {
  const settings = await chrome.storage.sync.get({
    openaiKey: '',
    openaiModel: DEFAULT_OPENAI_MODEL
  });

  return new OpenAIProvider(settings.openaiKey, settings.openaiModel);
}
