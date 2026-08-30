const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}

function normalizeUser(raw) {
  const user = (raw || "").trim().toLowerCase();
  if (!user || user.length > 64) return null;
  return user;
}

export async function onRequestOptions() {
  return new Response(null, { headers: CORS_HEADERS });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const user = normalizeUser(url.searchParams.get("user"));
  if (!user) return jsonResponse({ error: "missing or invalid user" }, 400);

  const data = await env.RECORDS_KV.get(`records:${user}`);
  return jsonResponse(data ? JSON.parse(data) : []);
}

export async function onRequestPut({ request, env }) {
  const url = new URL(request.url);
  const user = normalizeUser(url.searchParams.get("user"));
  if (!user) return jsonResponse({ error: "missing or invalid user" }, 400);

  const text = await request.text();
  if (text.length > 2_000_000) return jsonResponse({ error: "payload too large" }, 413);

  let records;
  try {
    records = JSON.parse(text);
  } catch {
    return jsonResponse({ error: "invalid json" }, 400);
  }
  if (!Array.isArray(records)) return jsonResponse({ error: "expected an array" }, 400);

  await env.RECORDS_KV.put(`records:${user}`, JSON.stringify(records));
  return jsonResponse({ ok: true });
}
