// Google-Maps-Kurzlink auflösen (Cloudflare Pages Function: GET /api/maps-link?url=…)
//
// „Teilen“ in Google Maps liefert Kurzlinks (maps.app.goo.gl/…). Erst die Weiterleitung führt zur
// langen Adresse mit den Wegpunkten – und der Browser darf ihr wegen CORS nicht selbst folgen.
// Hier wird der Weiterleitung gefolgt, ausschließlich über Google-Adressen (kein offener Proxy),
// und nur die lange Adresse zurückgegeben. Das Auslesen der Route macht die App selbst.

const GOOGLE = /^(maps\.app\.goo\.gl|goo\.gl|g\.co|consent\.google\.[a-z.]+|((www|maps)\.)?google\.[a-z]{2,3}(\.[a-z]{2})?)$/i;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': status === 200 ? 'public, max-age=86400' : 'no-store' },
});

/** lange Maps-Adresse (enthält die Route) – dann nicht weiter folgen */
const isLong = u => /(^|\.)google\.[a-z.]+$/i.test(u.hostname) && !/^consent\./i.test(u.hostname) && (u.pathname.startsWith('/maps') || u.searchParams.has('saddr') || u.searchParams.has('daddr'));

export async function onRequestGet({ request }) {
  const raw = new URL(request.url).searchParams.get('url') || '';
  let target;
  try { target = new URL(raw.trim()); } catch { return json({ error: 'invalid' }, 400); }

  const hops = []; // zur Fehlersuche: wohin Google weitergeleitet hat
  for (let hop = 0; hop < 8; hop++) {
    if (target.protocol !== 'https:' && target.protocol !== 'http:') return json({ error: 'invalid' }, 400);
    if (!GOOGLE.test(target.hostname)) return json({ error: 'not-google', hops }, 400);
    // Cookie-Hinweis (EU): das eigentliche Ziel steht in „continue“
    if (/^consent\./i.test(target.hostname)) {
      const next = target.searchParams.get('continue');
      if (!next) break;
      target = new URL(next);
      continue;
    }
    if (isLong(target)) return json({ url: target.toString() });
    // Als Browser bekommt man eine Zwischenseite (Deeplink-Ansicht) ohne Ziel; einfache Programme
    // bekommen die Weiterleitung direkt. Darum zuerst so anfragen, dann als Browser.
    let res;
    for (const ua of ['curl/8.7.1', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36']) {
      try {
        res = await fetch(target.toString(), { redirect: 'manual', headers: { 'user-agent': ua, 'accept': '*/*', 'accept-language': 'en-US,en;q=0.9' } });
      } catch {
        return json({ error: 'fetch', hops }, 502);
      }
      if (res.headers.get('location')) break;
    }
    hops.push(`${res.status} ${target.hostname}${target.pathname.slice(0, 40)}`);
    const loc = res.headers.get('location');
    if (loc) { target = new URL(loc, target); continue; }
    // keine Weiterleitung im Kopf: manchmal steht das Ziel nur in der Seite (Meta-Refresh, Skript, Link)
    const raw = await res.text().catch(() => '');
    // in Skripten ist die Adresse oft maskiert (\/, \u003d, \x26, &amp;)
    const html = raw.replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\x([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\\//g, '/').replace(/&amp;/g, '&');
    const found = html.match(/https:\/\/(?:www\.)?google\.[a-z.]+\/maps\/[^"'\s<>\\]+/i);
    if (found) { target = new URL(found[0]); continue; }
    break;
  }
  return isLong(target) ? json({ url: target.toString() }) : json({ error: 'no-route', hops, last: `${target.hostname}${target.pathname.slice(0, 40)}` }, 422);
}
