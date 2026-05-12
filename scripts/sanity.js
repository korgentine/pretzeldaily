// Sanity check for waking-hours math against the worked examples in the plan.
// Run: node scripts/sanity.js

const {
  wakingMinutesBetween,
  utcMsForLocalTime,
  isInWakingWindow,
  partsInTZ,
} = require('../lib/waking-clock');

const TZ = 'America/Los_Angeles';
let failures = 0;

function assertEq(name, actual, expected) {
  const ok = actual === expected;
  console.log(`${ok ? 'ok   ' : 'FAIL '} ${name}: actual=${actual} expected=${expected}`);
  if (!ok) failures++;
}

// All examples anchored to a non-DST-transition week (mid-May 2026 PDT)
const Y = 2026, M = 5, D = 11; // Mon May 11 2026

// Example 1: last pee 6am today, now 2pm today → 8h all in window → 480 min
{
  const start = utcMsForLocalTime(Y, M, D, 6, 0, TZ);
  const end = utcMsForLocalTime(Y, M, D, 14, 0, TZ);
  assertEq('6am→2pm same day', wakingMinutesBetween(start, end, TZ), 480);
}

// Example 2: last pee 8pm yesterday, now 4am today → outside window check
{
  const start = utcMsForLocalTime(Y, M, D - 1, 20, 0, TZ);
  const now = utcMsForLocalTime(Y, M, D, 4, 0, TZ);
  assertEq('8pm yest→4am: outside window', isInWakingWindow(new Date(now), TZ), false);
}

// Example 3: last pee 8pm yesterday, now 5am today → in window, waking gap = 60 min
{
  const start = utcMsForLocalTime(Y, M, D - 1, 20, 0, TZ);
  const end = utcMsForLocalTime(Y, M, D, 5, 0, TZ);
  assertEq('8pm yest→5am: waking gap', wakingMinutesBetween(start, end, TZ), 60);
}

// Example 4: last pee 8pm yesterday, now 1pm today → 1h + 8h = 9h = 540 min
{
  const start = utcMsForLocalTime(Y, M, D - 1, 20, 0, TZ);
  const end = utcMsForLocalTime(Y, M, D, 13, 0, TZ);
  assertEq('8pm yest→1pm: 9h waking', wakingMinutesBetween(start, end, TZ), 540);
}

// Bonus: deep overnight (8pm Sat → 10am Sun) = 1h + 5h = 6h = 360
{
  const start = utcMsForLocalTime(Y, M, D - 1, 20, 0, TZ);
  const end = utcMsForLocalTime(Y, M, D, 10, 0, TZ);
  assertEq('8pm yest→10am: 6h waking', wakingMinutesBetween(start, end, TZ), 360);
}

// Bonus: noon → noon next day = 9h + 7h = 16h = 960
{
  const start = utcMsForLocalTime(Y, M, D - 1, 12, 0, TZ);
  const end = utcMsForLocalTime(Y, M, D, 12, 0, TZ);
  assertEq('noon→noon next day', wakingMinutesBetween(start, end, TZ), 960);
}

// Window boundary checks
{
  assertEq('5:00 in window',  isInWakingWindow(new Date(utcMsForLocalTime(Y, M, D, 5, 0, TZ)), TZ), true);
  assertEq('4:59 not in window', isInWakingWindow(new Date(utcMsForLocalTime(Y, M, D, 4, 59, TZ)), TZ), false);
  assertEq('20:59 in window', isInWakingWindow(new Date(utcMsForLocalTime(Y, M, D, 20, 59, TZ)), TZ), true);
  assertEq('21:00 not in window', isInWakingWindow(new Date(utcMsForLocalTime(Y, M, D, 21, 0, TZ)), TZ), false);
}

// Cross-timezone sanity: Tokyo 5am → 1pm should also be 480 min
{
  const TZ2 = 'Asia/Tokyo';
  const start = utcMsForLocalTime(Y, M, D, 5, 0, TZ2);
  const end = utcMsForLocalTime(Y, M, D, 13, 0, TZ2);
  assertEq('Tokyo 5am→1pm', wakingMinutesBetween(start, end, TZ2), 480);
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll sanity checks passed.');
