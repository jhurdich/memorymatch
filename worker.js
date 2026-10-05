const DECKS = new Set([
  'Animals', 'Ocean Life', 'Farm Friends', 'Birds', 'Insects & Bugs', 'Fruit',
  'Veggies', 'Sweet Treats', 'Breakfast', 'Around the World', 'Sports', 'Music',
  'School', 'Things That Go', 'At Home', 'Clothing', 'Weather', 'Space', 'Nature',
  'Colors', 'Feelings', 'Community Helpers', 'Tools', 'Under the Sea', 'Celebrations'
]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

async function scores(request, env) {
  if (!env.DB) return json({ error: 'D1 binding DB is not connected.' }, 503);
  if (request.method === 'GET') {
    try {
      const { results = [] } = await env.DB.prepare(
        'SELECT name, deck, moves, seconds, created_at FROM scores ORDER BY moves ASC, seconds ASC, created_at ASC LIMIT 10'
      ).all();
      return json(results);
    } catch {
      return json({ error: 'Leaderboard is not set up yet.' }, 503);
    }
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON.' }, 400); }
  const name = String(body.name || '').trim().replace(/[<>\u0000-\u001f]/g, '').slice(0, 18) || 'Team';
  const deck = String(body.deck || '');
  const moves = Number(body.moves);
  const seconds = Number(body.seconds);
  if (!DECKS.has(deck) || !Number.isInteger(moves) || moves < 8 || moves > 9999 ||
      !Number.isInteger(seconds) || seconds < 0 || seconds > 86400) {
    return json({ error: 'Score details are invalid.' }, 400);
  }

  try {
    await env.DB.prepare(
      'INSERT INTO scores (id, name, deck, moves, seconds, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(crypto.randomUUID(), name, deck, moves, seconds, new Date().toISOString()).run();
    return json({ ok: true }, 201);
  } catch {
    return json({ error: 'Could not save score.' }, 503);
  }
}

async function fetchPhoto(url) {
  const response = await fetch(url, { cf: { cacheTtl: 86400, cacheEverything: true } });
  if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) return null;
  return response;
}

async function photo(request) {
  const { searchParams } = new URL(request.url);
  const term = (searchParams.get('term') || 'nature').trim().slice(0, 60);
  const seed = (searchParams.get('seed') || 'asl-memory-match').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 60) || 'asl-memory-match';
  let image = null;

  try {
    const api = new URL('https://commons.wikimedia.org/w/api.php');
    api.search = new URLSearchParams({
      action: 'query', generator: 'search', gsrsearch: term, gsrnamespace: '6',
      gsrlimit: '8', prop: 'imageinfo', iiprop: 'url', iiurlwidth: '480', format: 'json', origin: '*'
    });
    const result = await fetch(api);
    if (result.ok) {
      const data = await result.json();
      const pages = Object.values(data.query?.pages || {});
      const candidate = pages.find(page => {
        const candidateUrl = page.imageinfo?.[0]?.thumburl;
        return candidateUrl && !/\.svg(?:\?|$)/i.test(candidateUrl) &&
          new URL(candidateUrl).hostname === 'upload.wikimedia.org';
      });
      const imageUrl = candidate?.imageinfo?.[0]?.thumburl;
      if (imageUrl) image = await fetchPhoto(imageUrl);
    }
  } catch { /* Fall back to a seeded photo. */ }

  if (!image) {
    try { image = await fetchPhoto(`https://picsum.photos/seed/asl-${seed}/480/480`); }
    catch { /* Return an image error response below. */ }
  }
  if (!image) return new Response('Photo unavailable', { status: 502, headers: { 'cache-control': 'no-store' } });
  return new Response(image.body, {
    headers: {
      'content-type': image.headers.get('content-type') || 'image/jpeg',
      'cache-control': 'public, max-age=86400, s-maxage=604800',
      'x-content-type-options': 'nosniff'
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/scores') return scores(request, env);
    if (url.pathname === '/api/photo' && request.method === 'GET') return photo(request);
    return env.ASSETS.fetch(request);
  }
};
