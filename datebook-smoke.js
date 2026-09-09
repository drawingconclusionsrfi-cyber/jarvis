// Router false-positive harness for the DATE BOOK branch (BUILD DC).
// Companion to scripts/smoke.js — drop this in scripts/ as datebook-smoke.js.
//
//   node scripts/datebook-smoke.js NEW.html
//
// Lifts tryDateBook + _dbWhen straight out of index.html, stubs the store and
// the UI, and fires real sentences at it. What matters is the END STATE: did
// the branch take the wheel, or did the question fall through to her brain?
//
// "book" is load-bearing — _kdBooks owns "who wrote dune" and "books by
// octavia butler", and "book a table" is plain English. WANT_BRAIN is the
// regression net for that. NEVER DELETE FROM IT.

const fs = require('fs');
const path = process.argv[2];
if (!path) { console.log('usage: node datebook-smoke.js NEW.html'); process.exit(2); }
const H = fs.readFileSync(path, 'utf8');

// ── lift the branch source out of the file ───────────────────────────────
const START = 'function _dbNice(d){';
const END   = '// Search Everything reads pages from this mirror.';
const a = H.indexOf(START), b = H.indexOf(END, a);
if (a < 0 || b < 0) { console.log('EXTRACT FAILED — markers moved; update START/END'); process.exit(1); }
const src = H.slice(a, b);

// ── stubs ────────────────────────────────────────────────────────────────
let outcome = null, detail = '', wrote = null;
const PAGES = {};                       // date -> text, the fake store
const respond = (q, r) => { outcome = 'ANSWERED'; detail = String(r).split('\n')[0]; };
const callAI  = ()     => { outcome = 'brain'; detail = ''; };
const $ = () => null;
const switchView = () => {};
const _calSetMode = () => {};
const _dbFlush = (cb) => { if (cb) cb(); };
const _dbRender = () => {};
const _dbHint = () => {};
const _dbSave = (d, t) => { PAGES[d] = t; return Promise.resolve(); };
const _dbLoad = (d) => Promise.resolve(PAGES[d] ? { d, text: PAGES[d] } : null);
const _dbAppend = (d, t) => {
  wrote = { d, t };
  PAGES[d] = PAGES[d] ? PAGES[d] + '\n' + t : t;
  return Promise.resolve(true);
};
let _dbCur = null, _dbLoaded = '', _calMode = 'events';
const _calPad  = n => ('0' + n).slice(-2);
const _calDStr = d => d.getFullYear() + '-' + _calPad(d.getMonth() + 1) + '-' + _calPad(d.getDate());
const _dbDate  = s => { const p = String(s || '').split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
const _todayStr = () => _calDStr(new Date());
const _dbYest = () => { const d = _dbDate(_todayStr()); d.setDate(d.getDate() - 1); return _calDStr(d); };

eval(src);

// ── run ──────────────────────────────────────────────────────────────────
function run(q) {
  outcome = null; detail = ''; wrote = null;
  let fired = false;
  try { fired = !!tryDateBook(q); } catch (e) { return ['ERR ' + e.message, '']; }
  if (!fired) return ['brain', ''];
  return [outcome || 'ANSWERED', detail];
}

// Must be taken by the date book branch.
const WANT_ANSWER = [
  'open my date book',
  'open my datebook',
  'open my date-book',
  'show me my date book',
  "what's on my page for friday",
  'what did i write on the 3rd',
  'what did i write yesterday',
  'write in my date book: called the framer back',
  'add to my date book that the kiln is fixed',
  "show me yesterday's page",
  "what's on today's page",
  "read me tomorrow's page",
  'put in my date book that the show is on the 12th',
  'jot in my datebook: order more ink',
];

// Must NOT be taken. Some of these are answered by other branches (books,
// localReply, the view switchers) — what this harness proves is only that the
// date book branch keeps its hands off them.
const WANT_BRAIN = [
  // _kdBooks owns these
  'who wrote dune',
  'books by octavia butler',
  'find me a book about grief',
  'what books did octavia butler write',
  // plain English "book"
  'book a flight to japan',
  'book me a table for two',
  'did i book that',
  'i booked it already',
  'can you book it',
  'booking a hotel',
  // dates that are not date books
  "what's the date",
  "what's today's date",
  'what day is it',
  'date night ideas',
  'how do i get a date',
  'what is the date of the show',
  // other surfaces
  'open my notes',
  'open my journal',
  'open my gallery',
  "what's in my calendar",
  'open my to-do list',
  'what did i write in my journal',
  // "page" that is not a page
  "page me when it's done",
  'what page am i on',
  'the next page',
  'turn the page',
  'page 12',
  // near misses
  'my pages',
  'update my page',
  'open my book',
  'what did i do yesterday',
  'what happened on friday',
];

let bad = 0;
console.log('\n=== DATE BOOK ROUTER ===');
for (const q of WANT_ANSWER) {
  const [o, d] = run(q);
  const ok = o === 'ANSWERED';
  if (!ok) bad++;
  console.log(' ' + (ok ? 'ok  ' : 'FAIL') + '  ' + q.padEnd(48) + (ok ? '' : '-> ' + o));
}
console.log('\n=== MUST REACH HER BRAIN ===');
for (const q of WANT_BRAIN) {
  const [o, d] = run(q);
  const ok = o === 'brain';
  if (!ok) bad++;
  console.log(' ' + (ok ? 'ok  ' : 'FAIL') + '  ' + q.padEnd(48) + (ok ? '' : '-> HIJACKED: ' + d));
}

// ── date resolution ──────────────────────────────────────────────────────
// The read path opens the page inside a promise, so give it a tick to land.
const tick = () => new Promise(r => setTimeout(r, 0));
(async () => {
console.log('\n=== DATE RESOLUTION ===');
const T = new Date();
const shift = n => { const d = new Date(T); d.setDate(d.getDate() + n); return _calDStr(d); };
const DATES = [
  ['open my date book', _todayStr()],
  ["show me yesterday's page", shift(-1)],
  ["what's on tomorrow's page", shift(1)],
  ['what did i write on 2026-03-05', '2026-03-05'],
];
for (const [q, want] of DATES) {
  _dbCur = null;
  run(q);
  await tick();
  // the branch opens the page it resolved
  const got = _dbCur;
  const ok = got === want;
  if (!ok) bad++;
  console.log(' ' + (ok ? 'ok  ' : 'FAIL') + '  ' + q.padEnd(48) + (ok ? want : 'got ' + got + ' want ' + want));
}

// ── writing appends, never replaces ──────────────────────────────────────
console.log('\n=== WRITING ===');
PAGES[_todayStr()] = 'First line already here.';
run('add to my date book that the kiln is fixed');
const appended = PAGES[_todayStr()];
const okA = /First line already here\./.test(appended) && /kiln is fixed/.test(appended);
if (!okA) bad++;
console.log(' ' + (okA ? 'ok  ' : 'FAIL') + '  appends, never replaces'.padEnd(50) + (okA ? '' : JSON.stringify(appended)));

run('write in my date book: called the framer back');
const okB = wrote && wrote.t === 'called the framer back';
if (!okB) bad++;
console.log(' ' + (okB ? 'ok  ' : 'FAIL') + '  text after the colon is the line'.padEnd(50) + (okB ? '' : JSON.stringify(wrote)));

run('put in my date book that the show is on the 12th');
const okC = wrote && /show is on the 12th/.test(wrote.t);
if (!okC) bad++;
console.log(' ' + (okC ? 'ok  ' : 'FAIL') + '  text after "that" is the line'.padEnd(50) + (okC ? '' : JSON.stringify(wrote)));

console.log('\n' + (bad ? 'FAILED ' + bad : 'ALL PASS'));
process.exit(bad ? 1 : 0);
})();
