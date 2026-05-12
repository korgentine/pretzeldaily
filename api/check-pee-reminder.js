const admin = require('firebase-admin');

const {
  partsInTZ,
  formatDateInTZ,
  startOfWakingWindow,
  wakingMinutesBetween,
  isInWakingWindow,
  findLatestPeeTimestamp,
} = require('../lib/waking-clock');

const FALLBACK_TZ = 'America/Los_Angeles';
const THRESHOLD_MIN = 8 * 60;

let dbInstance = null;
function getDb() {
  if (dbInstance) return dbInstance;
  const svcJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!svcJson) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON not set');
  const credentials = JSON.parse(svcJson);
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(credentials),
      databaseURL: process.env.FIREBASE_DATABASE_URL,
    });
  }
  dbInstance = admin.database();
  return dbInstance;
}

async function sendNtfy(message, title) {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) throw new Error('NTFY_TOPIC not set');
  const url = `https://ntfy.sh/${encodeURIComponent(topic)}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Title': title,
      'Priority': '4',
      'Tags': 'dog,warning',
      'Click': 'https://pretzeldaily.vercel.app/',
    },
    body: message,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`ntfy ${resp.status}: ${text}`);
  }
  return { ok: true, status: resp.status };
}

function yesterdayDate(date) {
  return new Date(date.getTime() - 24 * 60 * 60 * 1000);
}

function formatLocalTime(ms, tz) {
  const p = partsInTZ(new Date(ms), tz);
  const hour12 = ((p.hour + 11) % 12) + 1;
  const ampm = p.hour >= 12 ? 'PM' : 'AM';
  const mm = String(p.minute).padStart(2, '0');
  return `${hour12}:${mm} ${ampm}`;
}

module.exports = async (req, res) => {
  const expectedAuth = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
  if (expectedAuth && req.headers.authorization !== expectedAuth) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  let db;
  try {
    db = getDb();
  } catch (err) {
    return res.status(500).json({ error: 'firebase_init_failed', message: err.message });
  }

  const settingsSnap = await db.ref('settings').once('value');
  const settings = settingsSnap.val() || {};
  const tz = settings.timezone || FALLBACK_TZ;

  const now = new Date();
  if (!isInWakingWindow(now, tz)) {
    return res.status(200).json({ skipped: 'outside_window', tz });
  }
  if (!settings.remindersEnabled) {
    return res.status(200).json({ skipped: 'reminders_disabled', tz });
  }

  const todayKey = formatDateInTZ(now, tz);
  const yKey = formatDateInTZ(yesterdayDate(now), tz);

  const alertedSnap = await db.ref(`reminders/${todayKey}/sent`).once('value');
  if (alertedSnap.val()) {
    return res.status(200).json({ skipped: 'already_alerted', tz });
  }

  const [todaySnap, yestSnap] = await Promise.all([
    db.ref(`logs/${todayKey}`).once('value'),
    db.ref(`logs/${yKey}`).once('value'),
  ]);
  const lastPee = findLatestPeeTimestamp([todaySnap.val(), yestSnap.val()]);

  const anchor = lastPee != null ? lastPee : startOfWakingWindow(now, tz);
  const gap = wakingMinutesBetween(anchor, now.getTime(), tz);

  if (gap < THRESHOLD_MIN) {
    return res.status(200).json({ ok: true, gap, anchor, tz });
  }

  const lastSeenStr = lastPee != null
    ? formatLocalTime(lastPee, tz)
    : 'not at all today';
  const hours = Math.floor(gap / 60);
  const body = `It's been ${hours}h+ since Pretzel peed. Last: ${lastSeenStr}.`;

  let notifyResult;
  try {
    notifyResult = await sendNtfy(body, 'Take Pretzel out!');
  } catch (err) {
    return res.status(500).json({ error: 'notify_failed', message: err.message });
  }

  await db.ref(`reminders/${todayKey}`).set({
    sent: true,
    at: now.toISOString(),
    gapMinutes: gap,
    tz,
    lastPee: lastPee || null,
  });

  return res.status(200).json({ alerted: true, gap, tz, notifyResult });
};
