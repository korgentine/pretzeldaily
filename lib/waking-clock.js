const WAKE_START_HOUR = 5;
const WAKE_END_HOUR = 21;

function partsInTZ(date, tz) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date)
       .filter(p => p.type !== 'literal')
       .map(p => [p.type, p.value])
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second)
  };
}

// Returns the UTC ms timestamp of the given local wall-clock time in tz.
// hour can exceed 23 (rolls over to next day).
function utcMsForLocalTime(year, month, day, hour, minute, tz) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute);
  const guessParts = partsInTZ(new Date(utcGuess), tz);
  const guessAsUtc = Date.UTC(
    guessParts.year, guessParts.month - 1, guessParts.day,
    guessParts.hour, guessParts.minute
  );
  const offsetMs = utcGuess - guessAsUtc;
  return utcGuess + offsetMs;
}

function formatDateInTZ(date, tz) {
  const p = partsInTZ(date, tz);
  const mm = String(p.month).padStart(2, '0');
  const dd = String(p.day).padStart(2, '0');
  return `${p.year}-${mm}-${dd}`;
}

function startOfWakingWindow(now, tz) {
  const p = partsInTZ(now, tz);
  return utcMsForLocalTime(p.year, p.month, p.day, WAKE_START_HOUR, 0, tz);
}

// Counts how many minutes between [startMs, endMs] fall inside the local
// 5am-9pm window of each calendar day in tz.
function wakingMinutesBetween(startMs, endMs, tz) {
  if (endMs <= startMs) return 0;
  let totalMs = 0;
  let cursor = startMs;
  let guard = 0;
  while (cursor < endMs) {
    if (++guard > 400) break;
    const p = partsInTZ(new Date(cursor), tz);
    const wakeStart = utcMsForLocalTime(p.year, p.month, p.day, WAKE_START_HOUR, 0, tz);
    const wakeEnd   = utcMsForLocalTime(p.year, p.month, p.day, WAKE_END_HOUR,   0, tz);
    const segStart = Math.max(cursor, wakeStart);
    const segEnd = Math.min(endMs, wakeEnd);
    if (segEnd > segStart) totalMs += segEnd - segStart;
    // Advance to next local midnight in tz
    const nextDay = utcMsForLocalTime(p.year, p.month, p.day + 1, 0, 0, tz);
    if (nextDay <= cursor) break;
    cursor = nextDay;
  }
  return Math.floor(totalMs / 60000);
}

function isInWakingWindow(now, tz) {
  const { hour } = partsInTZ(now, tz);
  return hour >= WAKE_START_HOUR && hour < WAKE_END_HOUR;
}

function findLatestPeeTimestamp(bucketSnapshots) {
  let latest = null;
  for (const bucket of bucketSnapshots) {
    if (!bucket) continue;
    for (const key of Object.keys(bucket)) {
      const entry = bucket[key];
      if (!entry || !Array.isArray(entry.activities)) continue;
      if (!entry.activities.includes('peed')) continue;
      const ts = Number(entry.timestamp);
      if (!Number.isFinite(ts)) continue;
      if (latest === null || ts > latest) latest = ts;
    }
  }
  return latest;
}

module.exports = {
  WAKE_START_HOUR,
  WAKE_END_HOUR,
  partsInTZ,
  utcMsForLocalTime,
  formatDateInTZ,
  startOfWakingWindow,
  wakingMinutesBetween,
  isInWakingWindow,
  findLatestPeeTimestamp,
};
