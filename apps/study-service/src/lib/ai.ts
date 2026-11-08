import { AppError } from '@agentic/shared';

/**
 * Minimal client for any OpenAI-compatible chat API (Groq, Gemini's OpenAI endpoint, OpenAI,
 * a local Ollama...). Configured by AI_BASE_URL, AI_MODEL and AI_API_KEY. Prompts and answers
 * are never logged: they are students' study content.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export function aiConfigured(): boolean {
  return Boolean(process.env.AI_BASE_URL && process.env.AI_MODEL && process.env.AI_API_KEY);
}

/** Safe to show (no key): which host and model answer. */
export function aiDescription(): { configured: boolean; provider?: string; model?: string } {
  if (!aiConfigured()) return { configured: false };
  let provider = 'custom';
  try {
    provider = new URL(process.env.AI_BASE_URL!).hostname;
  } catch {
    /* keep "custom" */
  }
  return { configured: true, provider, model: process.env.AI_MODEL };
}

export class AiUnavailableError extends AppError {
  constructor(message: string, code = 'AI_UNAVAILABLE') {
    super(message, 503, true, code);
    this.name = 'AiUnavailableError';
  }
}

type CompletionOptions = { json?: boolean; maxTokens?: number; temperature?: number };

// Only capacity and availability problems are worth retrying on another model.
const RETRY_ON_FALLBACK = ['AI_BUSY', 'AI_MODEL_NOT_FOUND', 'AI_RATE_LIMITED', 'AI_UNAVAILABLE'];

// Time budget. The web proxy in front of this service gives up at 70 s, so a whole question
// (every model tried) must finish well inside that and end in a plain-words error, not a cut
// connection. A healthy model starts answering in a few seconds; 20 s means it is struggling.
const perModelMs = () => Number(process.env.AI_MODEL_TIMEOUT_MS) || 20_000;
const totalBudgetMs = () => Number(process.env.AI_TOTAL_TIMEOUT_MS) || 50_000;
// Once words are flowing, a long answer may take longer than the wait for its first word.
const STREAM_MAX_MS = 90_000;

// A model that just failed for capacity reasons goes to the back of the queue for a while, so
// during an outage each question doesn't wait out the same timeout before reaching one that works.
const COOL_DOWN_MS = 2 * 60_000;
const coolingUntil = new Map<string, number>();
// Models that answered 400 to reasoning_effort (e.g. Gemma); it is left out for them from then on.
const noReasoningEffort = new Set<string>();

/** For tests: forget which models were failing or rejected reasoning_effort. */
export function resetAiHealth(): void {
  coolingUntil.clear();
  noReasoningEffort.clear();
}

/** AI_MODEL, then each model in AI_FALLBACK_MODEL (comma-separated); recently failing ones last. */
function modelsToTry(): string[] {
  if (!aiConfigured()) throw new AiUnavailableError('The AI tutor isn’t set up on this server yet.', 'AI_NOT_CONFIGURED');
  const all = [process.env.AI_MODEL!, ...(process.env.AI_FALLBACK_MODEL ?? '').split(',')].map((m) => m.trim()).filter(Boolean);
  const unique = [...new Set(all)];
  const now = Date.now();
  const cooling = (m: string) => (coolingUntil.get(m) ?? 0) > now;
  return [...unique.filter((m) => !cooling(m)), ...unique.filter(cooling)];
}

/** `commit()` claims the answer for this model; it returns false if a rival already has it. */
type Attempt<T> = (model: string, timeoutMs: number, signal: AbortSignal, commit: () => boolean) => Promise<T>;

/**
 * Asks the models in order, hedging: a model that fails hands over at once, and one that is
 * merely slow gets company after `hedgeMs`, the next model asked in parallel. The first to
 * answer wins and the rest are cancelled, so during an outage a question waits about as long as
 * the fastest working model rather than the sum of every slow one. On a healthy day the main
 * model answers before the hedge fires and is the only one asked.
 *
 * An attempt calls `commit()` once it has shown the student something (the first streamed
 * words): from then on it is the answer, its rivals are cancelled, and it can no longer fall back.
 */
function raceModels<T>(attempt: Attempt<T>, opts: { hedgeMs: number; signal?: AbortSignal }): Promise<T> {
  const models = modelsToTry();
  const deadline = Date.now() + totalBudgetMs();
  const hedgeMs = Number(process.env.AI_HEDGE_MS) || opts.hedgeMs;
  return new Promise<T>((resolve, reject) => {
    const running = new Map<string, { controller: AbortController; hedge?: ReturnType<typeof setTimeout> }>();
    let next = 0;
    let settled = false;
    let committed: string | null = null;
    let lastError: AiUnavailableError | null = null;

    const stopOthers = (keep?: string) => {
      for (const [model, run] of running) {
        clearTimeout(run.hedge);
        if (model !== keep) run.controller.abort();
      }
    };
    const finish = (fn: () => void, keep?: string) => {
      if (settled) return;
      settled = true;
      stopOthers(keep);
      opts.signal?.removeEventListener('abort', onOuterAbort);
      fn();
    };
    // The student left: stop everything; the error is never seen and says nothing about model health.
    const onOuterAbort = () => finish(() => reject(new AiUnavailableError('The question was cancelled.')));
    opts.signal?.addEventListener('abort', onOuterAbort);

    const launch = (): boolean => {
      if (settled || committed || next >= models.length) return false;
      const left = deadline - Date.now();
      if (left < 1_000) return false;
      const model = models[next++];
      const controller = new AbortController();
      const run: { controller: AbortController; hedge?: ReturnType<typeof setTimeout> } = { controller };
      running.set(model, run);
      run.hedge = setTimeout(launch, hedgeMs);
      const commit = () => {
        if (!committed && !settled) {
          committed = model;
          stopOthers(model);
        }
        return committed === model;
      };
      attempt(model, Math.min(perModelMs(), left), controller.signal, commit).then(
        (result) => {
          running.delete(model);
          // A rival finishing just as it was cancelled must not settle an answer it never showed.
          if (committed && committed !== model) return;
          coolingUntil.delete(model);
          finish(() => resolve(result), model);
        },
        (err: unknown) => {
          clearTimeout(run.hedge);
          running.delete(model);
          // Cancelled because a rival won, or after the race was decided: not this model's fault.
          if (settled || (committed && committed !== model)) return;
          if (!(err instanceof AiUnavailableError)) return finish(() => reject(err instanceof Error ? err : new Error(String(err))));
          const retryable = RETRY_ON_FALLBACK.includes(err.code ?? '');
          if (retryable) coolingUntil.set(model, Date.now() + COOL_DOWN_MS);
          // A rejected key fails every model alike; an answer already on screen can't be swapped.
          if (!retryable || committed === model) return finish(() => reject(err));
          lastError = err;
          if (!launch() && running.size === 0) {
            finish(() => reject(lastError ?? new AiUnavailableError('The AI took too long to answer. Please try again.')));
          }
        },
      );
      return true;
    };

    if (!launch()) finish(() => reject(new AiUnavailableError('The AI took too long to answer. Please try again.')));
  });
}

// When to ask the next model alongside a slow one. A streamed answer's first words normally come
// in 1–3 s; a whole quiz written as JSON can take 10 s on a good day, so it waits longer.
const HEDGE_STREAM_MS = 6_000;
const HEDGE_WHOLE_MS = 12_000;

export async function chatCompletion(messages: ChatMessage[], opts: CompletionOptions = {}): Promise<string> {
  return raceModels((model, timeoutMs, signal) => requestCompletion(model, messages, opts, timeoutMs, signal), { hedgeMs: HEDGE_WHOLE_MS });
}

/**
 * Like chatCompletion, but hands each piece of the answer to onDelta as it arrives, so the first
 * words show within a second or two instead of after the whole reply. Falls back to another
 * model only before anything was sent: switching mid-answer would splice two different replies.
 */
export async function streamCompletion(
  messages: ChatMessage[],
  opts: CompletionOptions,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  // A rival cancelled a moment too late may still deliver a piece; only the winner's are shown.
  return raceModels(
    (model, timeoutMs, raceSignal, commit) => streamOne(model, messages, opts, (t) => commit() && onDelta(t), timeoutMs, raceSignal),
    { hedgeMs: HEDGE_STREAM_MS, signal },
  );
}

// ─── Private reasoning ───
// Some models (Gemma, DeepSeek, Qwen) write their private reasoning inline, inside <thought> or
// <think>, before the answer. Students see only the answer.

const THINK_TAGS = ['thought', 'think'];

/** Removes a leading reasoning block. An unfinished one (the model ran out of tokens) leaves nothing. */
export function stripThinking(text: string): string {
  const m = /^\s*<(thought|think)>/i.exec(text);
  if (!m) return text;
  const close = text.toLowerCase().indexOf(`</${m[1].toLowerCase()}>`, m[0].length);
  return close === -1 ? '' : text.slice(close + m[1].length + 3).trimStart();
}

/** The same for a stream: holds back the first pieces until it knows whether they are reasoning. */
function thinkingFilter(emit: (text: string) => void) {
  let state: 'start' | 'thinking' | 'answer' = 'start';
  let pending = '';
  let tag = '';
  const toAnswer = (text: string) => {
    state = 'answer';
    pending = '';
    if (text) emit(text);
  };
  const scanThinking = () => {
    const close = pending.toLowerCase().indexOf(`</${tag}>`);
    if (close === -1) {
      // Keep only enough to recognise a closing tag split across pieces.
      pending = pending.slice(-(tag.length + 3));
      return;
    }
    toAnswer(pending.slice(close + tag.length + 3).trimStart());
  };
  return {
    push(piece: string) {
      if (state === 'answer') return emit(piece);
      pending += piece;
      if (state === 'thinking') return scanThinking();
      const lead = pending.trimStart();
      if (!lead) return;
      const lower = lead.toLowerCase();
      const opened = THINK_TAGS.find((t) => lower.startsWith(`<${t}>`));
      if (opened) {
        state = 'thinking';
        tag = opened;
        pending = lead.slice(opened.length + 2);
        return scanThinking();
      }
      // Could still become an opening tag once more arrives: wait.
      if (THINK_TAGS.some((t) => `<${t}>`.startsWith(lower))) return;
      toAnswer(pending);
    },
    end() {
      if (state === 'start' && pending.trim()) toAnswer(pending);
    },
  };
}

// ─── Requests ───

async function streamOne(
  model: string,
  messages: ChatMessage[],
  opts: CompletionOptions,
  onDelta: (text: string) => void,
  firstWordMs: number,
  outer?: AbortSignal,
): Promise<string> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  outer?.addEventListener('abort', abort);
  // Until the first word: this model's share of the budget. After it: room for a long answer.
  let timer = setTimeout(abort, firstWordMs);
  let text = '';
  const filter = thinkingFilter((t) => {
    if (!text) {
      clearTimeout(timer);
      timer = setTimeout(abort, STREAM_MAX_MS);
    }
    text += t;
    onDelta(t);
  });
  try {
    const res = await postCompletion(model, messages, opts, controller.signal, true);
    if (!res.body) throw new AiUnavailableError('The AI provider had a problem answering. Please try again.');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    // Server-sent events: "data: {json}" lines, ending with "data: [DONE]".
    const consume = (raw: string) => {
      const line = raw.trim();
      if (!line.startsWith('data:')) return;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') return;
      let delta: string | null | undefined;
      try {
        delta = (JSON.parse(data) as { choices?: { delta?: { content?: string | null } }[] }).choices?.[0]?.delta?.content;
      } catch {
        return;
      }
      if (delta) filter.push(delta);
    };
    for (;;) {
      let chunk: Awaited<ReturnType<typeof reader.read>>;
      try {
        chunk = await reader.read();
      } catch {
        throw new AiUnavailableError(controller.signal.aborted ? 'The AI took too long to answer. Please try again.' : 'The answer was cut off. Please try again.');
      }
      if (chunk.done) break;
      buf += decoder.decode(chunk.value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      lines.forEach(consume);
    }
    consume(buf + decoder.decode());
    filter.end();
    if (!text.trim()) throw new AiUnavailableError('The AI returned an empty answer. Please try again.');
    return text;
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener('abort', abort);
  }
}

async function requestCompletion(model: string, messages: ChatMessage[], opts: CompletionOptions, timeoutMs: number, outer: AbortSignal): Promise<string> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  outer.addEventListener('abort', abort);
  const timer = setTimeout(abort, timeoutMs);
  try {
    const res = await postCompletion(model, messages, opts, controller.signal, false);
    let body: { choices?: { message?: { content?: string | null } }[] } | null;
    try {
      body = (await res.json()) as typeof body;
    } catch {
      throw new AiUnavailableError(controller.signal.aborted ? 'The AI took too long to answer. Please try again.' : 'The AI provider had a problem answering. Please try again.');
    }
    const text = stripThinking(body?.choices?.[0]?.message?.content ?? '').trim();
    if (!text) throw new AiUnavailableError('The AI returned an empty answer. Please try again.');
    return text;
  } finally {
    clearTimeout(timer);
    outer.removeEventListener('abort', abort);
  }
}

/** Sends one request and maps a failed status to plain words. The caller reads the body. */
async function postCompletion(model: string, messages: ChatMessage[], opts: CompletionOptions, signal: AbortSignal, stream: boolean): Promise<Response> {
  const base = process.env.AI_BASE_URL!.replace(/\/$/, '');
  // Reasoning models (e.g. Gemini 3.x, OpenAI o-series) think before answering; "low" keeps replies quick.
  const effort = process.env.AI_REASONING_EFFORT && !noReasoningEffort.has(model) ? process.env.AI_REASONING_EFFORT : undefined;
  let res: Response;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.AI_API_KEY}` },
      body: JSON.stringify({
        model,
        messages,
        temperature: opts.temperature ?? 0.4,
        max_tokens: opts.maxTokens ?? 900,
        ...(effort ? { reasoning_effort: effort } : {}),
        ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
        ...(stream ? { stream: true } : {}),
      }),
    });
  } catch (err) {
    const timedOut = (err as Error).name === 'AbortError';
    throw new AiUnavailableError(timedOut ? 'The AI took too long to answer. Please try again.' : 'Couldn’t reach the AI provider. Check the internet connection.');
  }

  if (res.status === 400 && effort) {
    // Some models refuse reasoning_effort outright; ask once more without it, and remember.
    await res.body?.cancel().catch(() => {});
    noReasoningEffort.add(model);
    return postCompletion(model, messages, opts, signal, stream);
  }
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    // Map provider failures to plain words; the provider's body may echo the request, so it isn't logged.
    if (res.status === 401 || res.status === 403) throw new AiUnavailableError('The AI provider rejected the API key. Check AI_API_KEY in .local/ai.env.', 'AI_KEY_REJECTED');
    if (res.status === 404) throw new AiUnavailableError(`The AI provider doesn’t offer the model "${model}". Check AI_MODEL in .local/ai.env.`, 'AI_MODEL_NOT_FOUND');
    if (res.status === 429) throw new AiUnavailableError('The AI provider’s free-tier limit was reached. Wait a minute and try again.', 'AI_RATE_LIMITED');
    if (res.status === 503) throw new AiUnavailableError('The AI provider is busy right now. Please try again in a moment.', 'AI_BUSY');
    throw new AiUnavailableError('The AI provider had a problem answering. Please try again.');
  }
  return res;
}

/** Parses a JSON reply, tolerating code fences some models wrap around it. */
export function parseJsonReply(text: string): unknown {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('no JSON object');
  return JSON.parse(cleaned.slice(start, end + 1));
}
