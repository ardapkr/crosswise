// fetch() wrapper for our own /api endpoints. Throws Errors with messages that can be spoken.

export async function getJSON(url, { timeoutMs = 20000, method = 'GET', body } = {}) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('No internet connection.');
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, {
      method,
      signal: ctrl.signal,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'The server took too long to answer.' : 'Could not reach the server. Check your internet connection.');
  } finally {
    clearTimeout(t);
  }
  let data = null;
  try { data = await res.json(); } catch { /* not JSON */ }
  if (!res.ok) {
    if (res.status === 429) throw new Error('Too many requests right now. Please try again in a minute.');
    throw new Error(data?.error || `Server error ${res.status}.`);
  }
  return data;
}
