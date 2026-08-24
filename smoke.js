// Router false-positive harness for RIRI.
//
//   node smoke.js NEW.html
//
// Lifts a natural-language router branch straight out of index.html, stubs the
// network, and fires real sentences at it. What matters is the END STATE: did
// Reni get an answer from this branch, or did the question reach her brain?
// A branch that matches and then punts to callAI is a CORRECT outcome.
//
// This is the check that earns its keep. When the keyless drop-ins went in it
// caught three hijacks — "how do i make her laugh", "how do i make a budget"
// and "what can i make with my life" were all being sent to a recipe API.
//
// TO EXTEND: add the new branch's entry point to BRANCHES, then add every
// phrasing that must NOT be captured to WANT_BRAIN. Never delete from
// WANT_BRAIN — it is the regression net.

const fs = require('fs');
const path = process.argv[2];
if (!path) { console.log('usage: node smoke.js NEW.html'); process.exit(2); }
const H = fs.readFileSync(path, 'utf8');

// ── lift the branch source out of the file ───────────────────────────────
const START = 'var _kdMS = 9000;';                 // first line of the block
const END   = 'function tryKeylessDrops(query){';  // first line after it
const a = H.indexOf(START), b = H.indexOf(END, a);
if (a < 0 || b < 0) { console.log('EXTRACT FAILED — markers moved; update START/END'); process.exit(1); }
const src = H.slice(a, b);

// ── stubs ────────────────────────────────────────────────────────────────
let outcome = null, detail = '';
const setResponse = () => {};
const respond = (q, r) => { outcome = 'ANSWERED'; detail = String(r).split('\n')[0]; };
const callAI  = ()     => { outcome = 'brain'; detail = ''; };
// USAspending is POST, so _kdPost needs its own stub — fetch is the real
// call there, not _kdGet.
const fetch = (url, opts) => {
  if (!/usaspending/.test(String(url))) return Promise.reject(new Error('no net'));
  const term = (JSON.parse(opts.body).filters.keywords[0] || '').toLowerCase();
  return Promise.resolve({ ok: true, json: () => Promise.resolve({
    results: SPEND.includes(term) ? [{ name:'Dept of Health', amount: 1.2e9 }] : [] }) });
};
// Router branches read saved settings (city, keys). Stub the accessors or the
// branch throws inside tryKeylessDrops' catch and silently tests nothing.
const _store  = { aria_city: 'Framingham, MA' };
const SG = (k) => _store[k] || '';
const SS = (k, v) => { _store[k] = v; };
const jparse = (s, d) => { try { const r = JSON.parse(s); return r == null ? d : r; } catch (e) { return d; } }
const _riImgViewerOpen = () => {};
const _showOpenButton  = () => {};

// Honest network stub: only things the real API would plausibly have come back
// populated. Everything else returns the API's real miss shape.
const MEALS = ['jerk chicken', 'lasagne', 'beef wellington', 'salmon', 'bread', 'oxtail'];
const INGRS = ['chicken', 'salmon', 'rice', 'beef', 'pork', 'egg'];
const FOODS = ['greek yogurt', 'snickers', 'oat milk', 'peanut butter'];
const MOVES = ['romanian deadlift', 'plank', 'bench press', 'squat'];
const BOOKS = ['dune', 'octavia butler', 'grief'];
const DOCS  = ['cardiolog', 'dermatolog'];
const NAMES = ['smith'];
const SITES = ['bbc.com', 'example.com'];
const FEDS  = ['student loans', 'tariffs'];
const ZIPS  = ['01702', '02134'];
const PLACES= ['denver', 'framingham, ma', 'framingham'];
const SPEND = ['cancer research', 'housing'];
const DRUGS = ['ibuprofen', 'tylenol', 'lisinopril', 'amoxicillin', 'metformin'];
const RECALLS = ['metformin'];
function _kdGetStub(url, ok, bad) {
  const m = /[?&](?:s|i)=([^&]*)/.exec(url);
  const term = m ? decodeURIComponent(m[1]).toLowerCase() : '';
  if (/frankfurter/.test(url)) {
    const base = /base=([A-Z]+)/.exec(url)[1];
    const want = decodeURIComponent((/symbols=([^&]*)/.exec(url) || [, 'EUR,GBP,JPY'])[1]).split(',');
    const TBL = { USD: 1, EUR: 0.8571, GBP: 0.7402, JPY: 148.31, CAD: 1.3702, CNY: 7.12, MXN: 18.44, INR: 87.02 };
    if (!TBL[base]) return ok({ base, date: '2026-08-15', rates: {} });
    const rates = {};
    for (const w of want) if (TBL[w] && w !== base) rates[w] = TBL[w] / TBL[base];
    return ok({ amount: 1, base, date: '2026-08-15', rates });
  }
  if (/api\.fda\.gov\/drug\/label/.test(url)) {
    const t = decodeURIComponent(url).toLowerCase();
    const hit = DRUGS.some(d => t.indexOf('"' + d + '"') >= 0);
    return ok({ results: hit ? [{ openfda:{brand_name:['Tylenol'],generic_name:['acetaminophen']},
      purpose:['Pain reliever'], warnings:['Liver warning.'],
      dosage_and_administration:['Two tablets.'], adverse_reactions:['Rash.'],
      drug_interactions:['Ask a doctor.'] }] : [] });
  }
  if (/api\.fda\.gov\/drug\/enforcement/.test(url)) {
    const t = decodeURIComponent(url).toLowerCase();
    const hit = RECALLS.some(d => t.indexOf('"' + d + '"') >= 0);
    return ok({ results: hit ? [{ recall_initiation_date:'20260101', classification:'Class II',
      product_description:'A batch.', reason_for_recall:'Contamination.', status:'Ongoing' }] : [] });
  }
  if (/zippopotam/.test(url)) {
    const z = (/\/us\/(\d+)/.exec(url) || [,''])[1];
    return ok(ZIPS.includes(z)
      ? { country:'United States', places:[{ 'place name':'Framingham', state:'Massachusetts',
          latitude:'42.27', longitude:'-71.41' }] } : { places: [] });
  }
  if (/geocoding-api/.test(url)) {
    const n = decodeURIComponent((/name=([^&]*)/.exec(url) || [,''])[1]).toLowerCase();
    return ok(PLACES.includes(n) ? { results:[{ name:n, admin1:'MA', latitude:42.3, longitude:-71.4 }] } : {});
  }
  if (/opentopodata/.test(url)) return ok({ results:[{ elevation: 43.5 }] });
  if (/openlibrary/.test(url)) {
    const t = decodeURIComponent((/(?:q|author|subject)=([^&]*)/.exec(url) || [,''])[1]).toLowerCase();
    return ok({ docs: BOOKS.includes(t)
      ? [{ title: t, author_name: ['A. Writer'], first_publish_year: 1965, cover_i: 1 }] : [] });
  }
  if (/npiregistry/.test(url)) {
    const t = decodeURIComponent((/taxonomy_description=([^&]*)/.exec(url) || [,''])[1]).toLowerCase();
    const n = decodeURIComponent((/last_name=([^&]*)/.exec(url) || [,''])[1]).toLowerCase();
    const hit = DOCS.some(d => t.indexOf(d) >= 0) || NAMES.includes(n);
    return ok({ results: hit ? [{ basic:{first_name:'Jane',last_name:'Smith',credential:'MD'},
      taxonomies:[{desc:'Cardiology',primary:true}],
      addresses:[{address_purpose:'LOCATION',city:'Boston',state:'MA',telephone_number:'555-0100'}] }] : [] });
  }
  if (/wayback/.test(url)) {
    const u = decodeURIComponent((/url=([^&]*)/.exec(url) || [,''])[1]).toLowerCase();
    return ok({ archived_snapshots: SITES.includes(u)
      ? { closest: { available:true, url:'http://web.archive.org/x', timestamp:'20150615000000' } } : {} });
  }
  if (/federalregister/.test(url)) {
    const t = decodeURIComponent((/conditions\[term\]=([^&]*)/.exec(url) || [,''])[1]).toLowerCase();
    return ok({ results: FEDS.includes(t)
      ? [{ title:'A Rule', publication_date:'2026-08-01', type:'Rule',
           agencies:[{name:'Dept of Things'}], abstract:'It does a thing.' }] : [] });
  }
  if (/openfoodfacts/.test(url)) {
    const t = decodeURIComponent((/search_terms=([^&]*)/.exec(url) || [,''])[1]).toLowerCase();
    return ok({ products: FOODS.includes(t)
      ? [{ product_name: t, brands: 'Acme', nutriscore_grade: 'c',
           nutriments: { 'energy-kcal_100g': 250, proteins_100g: 8 } }] : [] });
  }
  if (/wger\.de/.test(url)) {
    const t = decodeURIComponent((/term=([^&]*)/.exec(url) || [,''])[1]).toLowerCase();
    return ok({ suggestions: MOVES.includes(t)
      ? [{ value: t, data: { name: t, category: 'Legs' } }] : [] });
  }
  if (/filter\.php/.test(url)) return ok({ meals: INGRS.includes(term) ? [{ strMeal: 'Kung Pao' }] : null });
  if (/search\.php/.test(url)) return ok({ meals: MEALS.includes(term) ? [{
    strMeal: term, strArea: 'Jamaican', strCategory: 'Chicken',
    strInstructions: 'Blend. Rub. Rest. Grill.', strIngredient1: 'Chicken', strMeasure1: '2 lb' }] : null });
  /* BUILD CE — World Bank + countries.dev. Without these the branches DO
     fire but their network handler punts to callAI, and the harness scores
     that as MISS. Same trap as the missing SG stub in BV: a branch that is
     never really exercised looks like a passing test. */
  if (/api\.worldbank\.org/.test(url)){
    const m = url.match(/\/country\/([A-Z]{2})\/indicator\/([^?]+)/);
    if (!m) return bad();
    return ok([{ page: 1 }, [{ indicator: { id: m[2] }, country: { id: m[1] },
                               date: '2025', value: 1234567 }]]);
  }
  if (/countries\.dev/.test(url)){
    const m = url.match(/\/alpha\/([A-Z]{2})/);
    if (!m) return bad();
    return ok({ name: 'Testland', alpha2Code: m[1], capital: 'Testville',
                flag: '\u{1F3F3}', region: 'Testia', area: 1000,
                currencies: [{ code: 'TST', name: 'Test dollar', symbol: 'T$' }],
                languages: [{ name: 'Testish' }], callingCodes: ['999'],
                timezones: ['UTC+00:00'], borders: ['XXX'] });
  }
  /* BUILD CH — Nager.Holidays v4. Note the field names: nationalHoliday, not
     v3's `global`. If this stub ever goes back to v3 shapes it stops testing
     what actually ships. Dates are a real 2026 US federal calendar. */
  if (/nagerholidays\.com/.test(url)){
    const m = url.match(/\/Holidays\/([A-Z]{2})\/(\d{4})/);
    if (!m) return bad();
    const cc = m[1], yr = m[2];
    const row = (d, n, nat) => ({ date: yr + d, name: n, countryCode: cc,
                                  subdivisionCodes: [], nationalHoliday: nat !== false,
                                  holidayTypes: ['Public'] });
    return ok([
      row('-01-01', "New Year's Day"), row('-01-19', 'Martin Luther King, Jr. Day'),
      row('-02-16', "Washington's Birthday"), row('-05-25', 'Memorial Day'),
      row('-06-19', 'Juneteenth'), row('-07-04', 'Independence Day'),
      row('-09-07', 'Labor Day'), row('-10-12', 'Columbus Day', false),
      row('-11-11', 'Veterans Day'), row('-11-26', 'Thanksgiving Day'),
      row('-12-25', 'Christmas Day'),
    ]);
  }
  /* BUILD CH — USGS FDSN. time is epoch MILLISECONDS; a stub that returns
     seconds would make _qkAgo read "56 years ago" and nobody would notice. */
  if (/earthquake\.usgs\.gov/.test(url)){
    const t = Date.now();
    const f = (mag, place, hrsAgo, tsunami) => ({
      properties: { mag, place, time: t - hrsAgo * 3600e3, tsunami: tsunami ? 1 : 0,
                    url: 'https://earthquake.usgs.gov/x' },
      geometry: { coordinates: [139.7, 35.6, 30] }, id: 'x' + mag });
    return ok({ type: 'FeatureCollection', metadata: { count: 4 }, features: [
      f(6.1, '54 km E of Hachinohe, Japan', 3, true),
      f(4.8, '12 km NW of Ridgecrest, CA', 9),
      f(5.4, '80 km W of Valparaiso, Chile', 20),
      f(3.2, '5 km SSE of Concord, NH', 30),
    ]});
  }
  return bad();
}

// _kdGetCors delegates to _kdGet, so stubbing _kdGet covers both paths.
eval(src.replace('function _kdGet(url, ok, bad){',
                 'function _kdGet(url, ok, bad){ return _kdGetStub(url, ok, bad); //'));

// Every natural-language entry point this harness covers.
const BRANCHES = [q => _kdCurrency(q), q => _kdRecipe(q), q => _kdFood(q), q => _kdExercise(q),
                  q => _kdBooks(q), q => _kdDoctor(q), q => _kdWayback(q), q => _kdFedReg(q),
                  q => _kdZip(q), q => _kdElevation(q), q => _kdDrug(q),
                  q => _kdWorldBank(q), q => _kdCountry(q),    // BUILD CE
                  q => _kdHoliday(q), q => _kdQuake(q)];       // BUILD CH
// _kdSpending is POST-based and resolves on a promise tick, so it is checked
// separately below rather than through the synchronous run() helper.

function run(q) {
  outcome = null; detail = '';
  let fired = false;
  try { for (const f of BRANCHES) { if (f(q)) { fired = true; break; } } }
  catch (e) { return ['ERR ' + e.message, '']; }
  if (!fired) return ['brain', ''];
  return [outcome || 'ANSWERED', detail];
}

const WANT_ANSWER = [
  'how much is 200 dollars in euros', 'convert 50 usd to yen', 'usd to gbp',
  '100 pounds in dollars', "what's the exchange rate", 'exchange rate for the yen',
  'what is 25.50 euros in pounds', 'convert 1,500 dollars to pesos',
  'recipe for jerk chicken', 'how do i make oxtail', 'how to cook salmon',
  'what can i make with chicken', 'show me a recipe for lasagne',
  'give me a recipe for beef wellington', 'how do you bake bread',
  // BUILD BU
  "what's in greek yogurt", 'nutrition for snickers', 'calories in oat milk',
  'how many calories are in peanut butter',
  'how do i do a romanian deadlift', 'what muscles does a plank work',
  'how do you perform a bench press',
  // BUILD BV + BW
  'who wrote dune', 'books by octavia butler', 'find me a book about grief',
  'find me a cardiologist in MA', 'look up dr jane smith',
  'what did bbc.com look like in 2015', 'archived version of example.com',
  'any new rules about student loans', 'federal register on tariffs',
  // BUILD CH — holidays
  'is monday a holiday', 'is today a holiday', 'is tomorrow a public holiday',
  "what's the next public holiday", 'when is thanksgiving', 'when is labor day',
  'what holidays are coming up', 'how many holidays are left this year',
  'holidays in france', 'upcoming bank holidays', 'holidays in december',
  'is christmas a federal holiday',
  // BUILD CH — earthquakes
  'any earthquakes today', 'recent earthquakes in japan', 'latest earthquakes',
  'was there an earthquake near me', 'biggest earthquake this month',
  'any quakes in chile', 'has there been an earthquake today',
  'show me recent seismic activity',
  // BUILD BX
  'what is 01702', 'where is zip code 02134', 'zip code for 01702',
  'elevation of denver', 'how high above sea level is denver',
  // BUILD BZ
  'what is ibuprofen for', 'side effects of lisinopril', 'dosage for amoxicillin',
  'can i take tylenol', 'is metformin recalled', 'any recalls on metformin',
  'look up the drug ibuprofen',
  // BUILD CE — World Bank numbers
  'population of nigeria', 'what is the population of japan', 'gdp of germany',
  'gdp per capita of norway', 'life expectancy in japan', 'unemployment in spain',
  'inflation in argentina', 'literacy in india', 'internet users in kenya',
  'military spending of france', 'population of the usa', 'gdp of the uk',
  'population of south korea', 'population of south sudan',
  // BUILD CE — country facts
  'capital of peru', 'what currency does thailand use', 'calling code for brazil',
  'what language do they speak in morocco', 'tell me about iceland',
  'what countries border france', 'time zones in russia', 'flag of nepal',
];

// THE REGRESSION NET. Never delete an entry. Add to it with every new branch.
const WANT_BRAIN = [
  // BUILD CE — a country name with nothing to measure, or a topic word with
  // no country. Both must reach her brain, never the network.
  'call jordan', 'text jordan about dinner', 'remind me to call chad',
  'how do i cook a turkey', 'turkey sandwich recipe', 'my jersey is dirty',
  'book a flight to japan', 'i want to visit peru', 'best food in italy',
  'capital gains tax', 'capital one credit card', 'is capital punishment legal',
  'venture capital firms', 'working capital formula', 'capital letters in a title',
  'capital of texas', 'what is the capital of my state',
  'life expectancy of a labrador', 'population of my contacts',
  'what currency should i use', 'what language should i learn',
  'how big is my inbox', 'red flag warning', 'flag this email',
  'how much is my car worth', 'unemployment benefits near me',
  'translate hello to spanish', 'convert this photo to a word doc',
  'what should i wear to the gym', 'how do i make her laugh',
  'add milk to my shopping list', 'set an alarm for 7 to 8',
  'switch to oracle', 'go to youtube', 'what can i make with my life',
  'move vacation.jpg to pictures', 'change the skin to iron man',
  'what is the weather', 'tell me a joke', 'who is nikola tesla',
  'remind me to call mom', 'open my wardrobe', 'text mom im running late',
  'clean my downloads', 'play something to help me sleep', 'deep mode on',
  'how do i make a budget', 'how do i make more money', 'how do i make it stop',
  'how can i make friends', 'what can i make with my old laptop',
  'meditate', 'listen to me sing', 'style me', 'brief me', 'open my gallery',
  // BUILD BU regressions — food and exercise phrasings that are neither
  "what's in my calendar", "what's in the news", "what's in it for me",
  'how do i do my taxes', 'how do i do a backup', 'how do i do this',
  'what muscles does it work', 'nutrition for my dog',
  'how do you perform under pressure', 'calories in a day',
  // BUILD BV + BW regressions
  'who wrote that song', 'who wrote to me', 'books i should read',
  'find me a ride', 'find me a good pizza place', 'look up the weather',
  'what did i look like in 2015', 'what did she say',
  'archived my email', 'any new rules about the house',
  "what's the government doing", 'federal register',
  // BUILD BX regressions
  'what is 42', 'where is my phone', 'zip it', 'elevation',
  'how high is the ceiling', 'what is 123456',
  // BUILD BZ regressions — these must never hit a drug database
  'what is riri for', 'what is that for', 'what is this app for',
  'side effects of skipping breakfast', 'can i take the car',
  'can i take a nap', 'is my order recalled', 'what is love',
  'what does she do for work', 'dosage of sarcasm',
  // BUILD CH regressions — "holiday" is a vacation far more often than it is a
  // day off the calendar. None of these may ever touch the network.
  'i need a holiday', 'i need a holiday so bad', 'book me a holiday',
  'planning a holiday to italy', 'im on holiday next week', 'holiday party ideas',
  'happy holidays', 'the holidays are stressful', 'holiday shopping list',
  'holiday pay rules', 'holiday movie recommendations', 'holidays in cancun',
  'what should i wear to the holiday party', 'holiday weight gain',
  'i deserve a holiday', 'holiday season playlist',
  // These reach an ALLOW pattern and are stopped only by _holNot. Without it
  // they hijack — which is the whole reason that list exists.
  'holiday party next month', 'planning a holiday next year',
  'what holidays should i take', 'how many holidays do i have left at work',
  'how many holidays do i have left', 'what holidays are left at work',
  // BUILD CH regressions — explaining, preparing for or insuring against a
  // quake is her brain's job, and so is anything historical.
  'what causes earthquakes', 'what is an earthquake', 'how do earthquakes happen',
  'is my house earthquake safe', 'earthquake insurance quote',
  'earthquake preparedness kit', 'explain the richter scale',
  'biggest earthquake ever recorded', 'the 2010 earthquake in haiti',
  'earthquake proof building', 'why do earthquakes cause tsunamis',
  'earthquake drill at school', 'fault line map',
];

let fails = 0;
console.log('--- MUST ANSWER --------------------------------------------------');
for (const q of WANT_ANSWER) {
  const [s, o] = run(q); const ok = s === 'ANSWERED'; if (!ok) fails++;
  console.log(`${ok ? ' ok ' : 'MISS'}  ${q.padEnd(38)} ${o.slice(0, 58)}`);
}
console.log('\n--- MUST REACH HER BRAIN (no hijack) -----------------------------');
for (const q of WANT_BRAIN) {
  const [s, o] = run(q); const ok = s === 'brain'; if (!ok) fails++;
  console.log(`${ok ? ' ok ' : 'HIJACK'}  ${q.padEnd(38)} ${ok ? '' : o.slice(0, 58)}`);
}
console.log(`\n${fails === 0 ? 'ALL PASS' : fails + ' FAILURES'}`);
process.exit(fails ? 1 : 0);
