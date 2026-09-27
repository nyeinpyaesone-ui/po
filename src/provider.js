export function createProvider(config) {
  if (!config.ollamaUrl) {
    return {
      id: 'deterministic', enabled: true,
      async ready() { return true; },
      async generate(prompt) { return { kind: 'result', message: `Task received: ${prompt}` }; }
    };
  }
  return {
    id: 'ollama', enabled: true,
    async ready() {
      try { const response = await fetch(`${config.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(1500) }); return response.ok; }
      catch { return false; }
    },
    async generate(prompt, signal) {
      const response = await fetch(`${config.ollamaUrl}/api/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: config.ollamaModel, prompt, stream: false }), signal });
      if (!response.ok) throw new Error(`AI provider returned HTTP ${response.status}`);
      const body = await response.json();
      if (typeof body.response !== 'string') throw new Error('AI provider returned an invalid response');
      return { kind: 'ai', provider: 'ollama', model: config.ollamaModel, message: body.response };
    }
  };
}
