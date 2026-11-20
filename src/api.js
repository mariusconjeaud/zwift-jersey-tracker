// Client for the Cloudflare Worker sync API (see /worker).

export class ApiError extends Error {
  constructor(status, body) {
    super((body && body.error) || (status ? `HTTP ${status}` : "Network error"));
    this.status = status; // 0 = network failure
    this.body = body;
  }
  get retryable() {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

export function createApi(baseUrl, fetchImpl = (...a) => fetch(...a)) {
  const base = String(baseUrl).replace(/\/+$/, "");

  async function call(method, path, body, { keepalive = false } = {}) {
    let res;
    try {
      res = await fetchImpl(base + path, {
        method,
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
        keepalive,
      });
    } catch {
      throw new ApiError(0, null);
    }
    let data = null;
    if (res.status !== 204) {
      try { data = await res.json(); } catch { data = null; }
    }
    if (!res.ok) throw new ApiError(res.status, data);
    return data;
  }

  const p = (code) => "/v1/profiles/" + encodeURIComponent(code);
  return {
    create: (payload) => call("POST", "/v1/profiles", payload),
    get: (code) => call("GET", p(code)),
    patch: (code, payload, opts) => call("PATCH", p(code), payload, opts),
    remove: (code) => call("DELETE", p(code)),
  };
}

// Sync codes: 12 Crockford base32 characters (60 random bits), shown as XXXX-XXXX-XXXX.
const CODE_RE = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{12}$/;

export function normalizeCode(raw) {
  const s = String(raw || "")
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  return CODE_RE.test(s) ? s : null;
}

export const formatCode = (code) => String(code || "").replace(/(.{4})(?=.)/g, "$1-");
