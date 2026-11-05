// Server-side proxy for AG Studio's AI assistant. The browser adapter (studio/src/studio/openai-adapter.ts)
// POSTs OpenAI Responses API bodies to /api/studio/ai/responses with no key; this adds the key,
// pins the model to an allowed list, caps output tokens and streams the SSE reply straight back.
// The key never leaves the server.
import { Readable } from 'node:stream';

export const studioAiEnabled = (config) => Boolean(!config.studio.ai.disabled && config.studio.ai.apiKey && config.studio.ai.models.length);

export function studioAiHandler(config, { fetchImpl = globalThis.fetch } = {}) {
  const ai = config.studio.ai;
  return async (req, res) => {
    if (!studioAiEnabled(config)) return res.status(503).json({ error: { message: 'The AI assistant is not configured: set AG_STUDIO_OPENAI_API_KEY (or LLM_API_KEY + LLM_MODEL).' } });
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({ error: { message: 'Request body must be a JSON object.' } });
    const model = typeof body.model === 'string' && body.model ? body.model : ai.models[0];
    if (!ai.models.includes(model)) return res.status(400).json({ error: { message: `Model "${model}" is not enabled.` } });

    const controller = new AbortController();
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    let upstream;
    try {
      upstream = await fetchImpl(`${ai.baseUrl}/responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ai.apiKey}` },
        body: JSON.stringify({ ...body, model, max_output_tokens: Math.min(Number(body.max_output_tokens) || ai.maxOutputTokens, ai.maxOutputTokens) }),
        signal: controller.signal,
      });
    } catch (err) {
      if (controller.signal.aborted) return;
      return res.status(502).json({ error: { message: `AI upstream unreachable: ${err.message}` } });
    }
    res.status(upstream.status);
    res.set({ 'Content-Type': upstream.headers.get('content-type') || 'application/json', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
    if (!upstream.body) return res.end();
    Readable.fromWeb(upstream.body).on('error', () => res.end()).pipe(res);
  };
}
