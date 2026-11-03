// RouteCam – alert mails to the founder.
//
// POST https://routecam.app/api/notify  {"kind": "route" | "comment", "id": "<report uuid>"}
// is sent by the database (trigger notify_report, supabase/migrations/0004_notify.sql) right
// after a report was saved. The Worker then asks the database for the details via
// claim_report_notification(): that hands out each report exactly once and only for a few
// minutes after it was made – so calling this address yourself can't send any extra mail,
// and no secret has to be shared between the database and the Worker.

const REASONS = {
  inappropriate: 'Unangemessener oder anstößiger Inhalt',
  privacy: 'Datenschutz – z. B. Wohnadresse erkennbar / private Daten',
  copyright: 'Urheberrechtsverletzung',
  dangerous: 'Gefährliches oder illegales Fahren',
  'wrong-data': 'Route oder Video stimmen nicht überein',
  spam: 'Spam oder Werbung',
  insulting: 'Beleidigend, hetzerisch oder bedrohlich',
  other: 'Sonstiges',
};

const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/api/notify') return new Response('Not found', { status: 404 });
    let req;
    try { req = await request.json(); } catch { return new Response('Bad request', { status: 400 }); }
    if (!['route', 'comment'].includes(req?.kind) || !/^[0-9a-f-]{36}$/i.test(req?.id || '')) {
      return new Response('Bad request', { status: 400 });
    }

    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/claim_report_notification`, {
      method: 'POST',
      headers: { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${env.SUPABASE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ report_kind: req.kind, report_id: req.id }),
    });
    const r = res.ok ? await res.json() : null;
    if (!r) return new Response('nothing to send'); // unknown, too old or already mailed

    const isComment = r.kind === 'comment';
    const what = isComment ? 'Kommentar' : 'Fahrt';
    const title = r.routeTitle || r.routeId || 'unbekannte Fahrt';
    const seconds = r.snapshot?.seconds;
    const link = `${env.APP_URL}/?route=${encodeURIComponent(r.routeId || '')}${seconds != null ? `&t=${seconds}` : ''}`;

    const lines = [
      `Neue Meldung: ${what}`,
      '',
      `Grund: ${REASONS[r.reason] || r.reason}`,
      r.note ? `Notiz: „${r.note}“` : null,
      `Gemeldet von: ${r.reporter || 'unbekannt'}`,
      '',
      isComment
        ? `Kommentar von ${r.snapshot?.author || 'unbekannt'}${seconds != null ? ` bei ${mmss(seconds)}` : ''}:\n„${r.snapshot?.text || ''}“\n\nFahrt: ${title}`
        : `Fahrt: ${title}${r.owner ? ` (von ${r.owner})` : ''}`,
      '',
      `Ansehen: ${link}`,
      `Bearbeiten im Admin-Dashboard: ${env.ADMIN_URL}`,
      '',
      r.openCount ? `Offene Meldungen insgesamt: ${r.openCount}` : null,
    ].filter(l => l !== null);

    try {
      await env.MAIL.send({
        to: 'maurice.baradari@gmail.com',
        from: 'alerts@routecam.app',
        subject: `RouteCam: ${what} gemeldet – ${REASONS[r.reason] || r.reason}`,
        text: lines.join('\n'),
      });
    } catch (e) {
      console.error('mail failed', e);
      return new Response('Mail failed', { status: 502 });
    }
    return new Response('ok');
  },
};
