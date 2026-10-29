// Server-side proxy to Gemini. The API key lives only in the Vercel env var GEMINI_API_KEY.
const MODELS = [process.env.GEMINI_MODEL, "gemini-3.8-flash", "gemini-3.6-flash", "gemini-2.5-flash"]
  .filter((m, i, a) => m && a.indexOf(m) === i);
const LIMIT = Number(process.env.RATE_LIMIT_PER_HOUR || 30); // AI calls per IP per hour (per running instance)
const MAX_PROMPT = 60000;
const hits = new Map();

function tooMany(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 3600e3);
  if (list.length >= LIMIT) { hits.set(ip, list); return true; }
  list.push(now); hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return false;
}

function parseJSON(t) {
  try { return JSON.parse(t); } catch (e) {}
  const f = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (f) { try { return JSON.parse(f[1]); } catch (e) {} }
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) {} }
  return undefined;
}

module.exports = async function handler(req, res) {
  const key = process.env.GEMINI_API_KEY;
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET") return key ? res.status(200).json({ ok: true }) : res.status(503).json({ error: "no_key" });
  if (req.method !== "POST") return res.status(405).json({ error: "invalid_request" });
  if (!key) return res.status(503).json({ error: "no_key" });

  const origin = req.headers.origin, host = req.headers.host;
  if (origin && host) { try { if (new URL(origin).host !== host) return res.status(403).json({ error: "forbidden" }); } catch (e) { return res.status(403).json({ error: "forbidden" }); } }

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (tooMany(ip)) return res.status(429).json({ error: "rate_limited" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const prompt = body && typeof body.prompt === "string" ? body.prompt : "";
  if (!prompt) return res.status(400).json({ error: "invalid_request" });
  if (prompt.length > MAX_PROMPT) return res.status(413).json({ error: "prompt_too_large" });

  for (const model of MODELS) {
    let r;
    try {
      r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.4, maxOutputTokens: 32768 }
        })
      });
    } catch (e) {
      return res.status(502).json({ error: "upstream_error" });
    }
    if (r.status === 404) continue; // model not available for this key: try the next one
    if (r.status === 429) return res.status(429).json({ error: "rate_limited" });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j) {
      console.error("gemini error", model, r.status, j && j.error && j.error.message);
      return res.status(502).json({ error: "upstream_error" });
    }
    const c = j.candidates && j.candidates[0];
    if (!c) return res.status(422).json({ error: j.promptFeedback && j.promptFeedback.blockReason ? "refused" : "empty_completion" });
    const text = ((c.content && c.content.parts) || []).filter((p) => !p.thought).map((p) => p.text || "").join("");
    if (!text) return res.status(422).json({ error: c.finishReason === "SAFETY" ? "refused" : "empty_completion" });
    const data = parseJSON(text);
    if (data === undefined) return res.status(422).json({ error: "invalid_json" });
    return res.status(200).json({ data: data, model: model });
  }
  return res.status(502).json({ error: "upstream_error" });
};
