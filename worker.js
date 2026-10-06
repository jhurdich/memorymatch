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

function constantTimeEqual(left, right) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let mismatch = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) mismatch |= (a[i] || 0) ^ (b[i] || 0);
  return mismatch === 0;
}

async function resetScores(request, env) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  if (!env.LEADERBOARD_RESET_PASSWORD) {
    return json({ error: 'Teacher reset is not configured. Ask the site administrator.' }, 503);
  }
  if (!env.DB) return json({ error: 'D1 binding DB is not connected.' }, 503);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON.' }, 400); }
  const password = body && typeof body.password === 'string' ? body.password : '';
  if (!password || password.length > 256 ||
      !constantTimeEqual(password, env.LEADERBOARD_RESET_PASSWORD)) {
    return json({ error: 'Incorrect password.' }, 401);
  }

  try {
    await env.DB.prepare('DELETE FROM scores').run();
    return json({ ok: true });
  } catch {
    return json({ error: 'Could not reset the leaderboard.' }, 503);
  }
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

const PHOTO_USER_AGENT = 'ASL-Memory-Match/1.0 (https://github.com/jhurdich/memorymatch)';
const SIGN_USER_AGENT = 'ASL-Memory-Match/1.0 (https://github.com/jhurdich/memorymatch)';

async function signVideo(request) {
  const { searchParams } = new URL(request.url);
  const slug = (searchParams.get('slug') || '').trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 60) {
    return json({ error: 'Invalid sign word.' }, 400);
  }

  const pageUrl = `https://www.signasl.org/sign/${slug}`;
  try {
    const page = await fetch(pageUrl, {
      headers: { 'User-Agent': SIGN_USER_AGENT, 'Accept': 'text/html' },
      cf: { cacheTtl: 86400, cacheEverything: true }
    });
    if (!page.ok) return json({ error: 'No sign video was found.', pageUrl }, 404);

    const html = await page.text();
    // Sign ASL's own embed dialog uses the first ten-character video reference
    // from the corresponding word page in its supported embed snippet.
    const videoRef = html.match(/href=["']#([a-z0-9]{10})["']/i)?.[1];
    if (!videoRef) return json({ error: 'No embeddable sign video was found.', pageUrl }, 404);
    return json({ videoRef, pageUrl });
  } catch {
    return json({ error: 'Could not load the sign video right now.', pageUrl }, 502);
  }
}

async function fetchPhoto(url) {
  const headers = { 'User-Agent': PHOTO_USER_AGENT };
  const response = await fetch(url, { headers, cf: { cacheTtl: 86400, cacheEverything: true } });
  if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) return null;
  return response;
}

async function photo(request) {
  const { searchParams } = new URL(request.url);
  const term = (searchParams.get('term') || 'nature').trim().slice(0, 60);
  const seed = (searchParams.get('seed') || 'asl-memory-match').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 60) || 'asl-memory-match';
  let image = null;
  let imageSource = 'wikimedia';

  try {
    const api = new URL('https://commons.wikimedia.org/w/api.php');
    api.search = new URLSearchParams({
      action: 'query', generator: 'search', gsrsearch: term, gsrnamespace: '6',
      gsrlimit: '8', prop: 'imageinfo', iiprop: 'url', iiurlwidth: '480', format: 'json', origin: '*'
    });
    const result = await fetch(api, {
      headers: { 'User-Agent': PHOTO_USER_AGENT, 'Accept': 'application/json' }
    });
    if (result.ok) {
      const data = await result.json();
      const pages = Object.values(data.query?.pages || {});
      for (const page of pages) {
        const imageUrl = page.imageinfo?.[0]?.thumburl;
        if (!imageUrl || /\.svg(?:\?|$)/i.test(imageUrl) ||
            new URL(imageUrl).hostname !== 'upload.wikimedia.org') continue;
        image = await fetchPhoto(imageUrl);
        if (image) break;
      }
    }
  } catch { /* Fall back to a seeded photo. */ }

  if (!image) {
    imageSource = 'loremflickr-fallback';
    const lock = [...seed].reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 1);
    try {
      image = await fetchPhoto(`https://loremflickr.com/480/480/${encodeURIComponent(term)}?lock=${lock}`);
    } catch { /* Use the final seeded photo fallback below. */ }
  }

  if (!image) return new Response('Photo unavailable', { status: 502, headers: { 'cache-control': 'no-store' } });
  return new Response(image.body, {
    headers: {
      'content-type': image.headers.get('content-type') || 'image/jpeg',
      'cache-control': 'public, max-age=86400, s-maxage=604800',
      'x-content-type-options': 'nosniff',
      'x-photo-source': imageSource
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/scores/reset') return resetScores(request, env);
    if (url.pathname === '/api/scores') return scores(request, env);
    if (url.pathname === '/api/photo' && request.method === 'GET') return photo(request);
    if (url.pathname === '/api/sign' && request.method === 'GET') return signVideo(request);
    return env.ASSETS.fetch(request);
  }
};
