const CODE = /\b(code|debug|refactor|typescript|javascript|python|function|bug|compile|test|api|stack trace)\b/i;
const BROWSER = /\b(browser|website|click|navigate|login|page|webpage|url)\b/i;

export function classify(prompt) {
  if (CODE.test(prompt)) return 'code';
  if (BROWSER.test(prompt)) return 'browser';
  return 'general';
}

export function validateType(type) {
  return ['general', 'code', 'browser'].includes(type);
}

export function boundaryResult(type) {
  if (type === 'code') return { kind: 'boundary', message: 'Code task accepted. Safe code operations are available only through an explicit workspace tool boundary.' };
  if (type === 'browser') return { kind: 'boundary', message: 'Browser task accepted. Browser automation is intentionally disabled until a sandboxed browser provider is configured.' };
  return null;
}
