// Checks the AI settings in .local/ai.env: one tiny request to the main model and to each fallback,
// side by side, so you can see which are answering right now.
//   npm run ai:check
// Prints the provider, models and outcomes. Never prints the key.
import { loadAiEnv } from './local-env.mjs';

const ai = loadAiEnv();
const missing = ['AI_BASE_URL', 'AI_MODEL', 'AI_API_KEY'].filter((k) => !ai[k]);
if (missing.length) {
  console.error(`Missing in .local/ai.env: ${missing.join(', ')}. See scripts/dev/ai.env.example.`);
  process.exit(1);
}

const base = ai.AI_BASE_URL.replace(/\/$/, '');
const models = [...new Set([ai.AI_MODEL, ...(ai.AI_FALLBACK_MODEL ?? '').split(',')].map((m) => m.trim()).filter(Boolean))];
console.log(`Provider: ${new URL(base).hostname}\nKey:      set (${ai.AI_API_KEY.length} characters)\n`);

const HINT = {
  400: 'request refused.',
  401: 'the key was rejected. Re-copy it into AI_API_KEY.',
  403: 'the key is not allowed to use this API.',
  404: "this model isn't available to your key. Pick another (the provider's console lists them).",
  429: 'rate limit or free-tier quota reached. Wait a minute.',
  503: 'overloaded right now (the app moves on to the next model).',
};

async function ask(model, withEffort) {
  return fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ai.AI_API_KEY}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
      // Generous: reasoning models spend tokens thinking before the visible answer.
      max_tokens: 300,
      temperature: 0,
      ...(withEffort ? { reasoning_effort: ai.AI_REASONING_EFFORT } : {}),
    }),
    signal: AbortSignal.timeout(20_000),
  });
}

async function check(model, role) {
  const started = Date.now();
  const label = `${role.padEnd(10)} ${model.padEnd(28)}`;
  try {
    let res = await ask(model, Boolean(ai.AI_REASONING_EFFORT));
    // The app drops reasoning_effort for models that refuse it; check the same way.
    if (res.status === 400 && ai.AI_REASONING_EFFORT) res = await ask(model, false);
    if (!res.ok) return { ok: false, line: `✗ ${label} ${res.status}: ${HINT[res.status] ?? 'unexpected error.'}` };
    await res.json();
    return { ok: true, line: `✓ ${label} answered in ${Date.now() - started} ms` };
  } catch (err) {
    const slow = err.name === 'TimeoutError' || err.name === 'AbortError';
    return { ok: false, line: `✗ ${label} ${slow ? 'no answer within 20 s (the app moves on after 20 s)' : `couldn't reach the provider: ${err.message}`}` };
  }
}

const results = await Promise.all(models.map((m, i) => check(m, i === 0 ? 'main' : `fallback ${i}`)));
results.forEach((r) => console.log(r.line));
const working = results.filter((r) => r.ok).length;
console.log(
  working === 0
    ? '\nNo model is answering right now. If every one says 503 or times out, the provider is overloaded: try again in a few minutes.'
    : `\n${working} of ${models.length} answering. The app uses the first that works. Restart the stack after changing .local/ai.env.`,
);
process.exit(working ? 0 : 1);
