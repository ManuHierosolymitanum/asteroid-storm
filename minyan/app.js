'use strict';
/* מוצא המניין
   נתונים משותפים בזמן אמת: Firebase (Firestore): minyanim (מניינים חד-פעמיים), synagogues (בתי כנסת וזמנים קבועים), occ (מי מגיע לתפילה קבועה ביום מסוים).
   מפות: OpenStreetMap / CARTO. מסלולי הליכה: OSRM. כתובות: Nominatim. אזור זמן של מקום: Open-Meteo. */

const APP_VERSION = '2.0.0';
const FB_CONFIG = {"apiKey":"AIzaSyBPgIc5-N6L91oIgSW-gHZvvEJbnb7EXRI","authDomain":"asteroid-storm-d4ed7.firebaseapp.com","projectId":"asteroid-storm-d4ed7","storageBucket":"asteroid-storm-d4ed7.firebasestorage.app","messagingSenderId":"389019859065","appId":"1:389019859065:web:75e2a5f0ac32cc45c17ca8"};
const FB_V = '10.12.2';

const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MIN = 60e3, HOUR = 36e5;
const TYPES = {shacharit:{n:'שחרית', i:'🌅'}, mincha:{n:'מנחה', i:'☀️'}, arvit:{n:'ערבית', i:'🌙'}};
const NUSACH = {none:'נוסח לא צוין', ashk:'אשכנז', sfard:'ספרד', edot:'עדות המזרח', teiman:'תימני', chabad:'חב"ד'};
const nusachName = k => NUSACH[k] || NUSACH.none;
const DAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
const DAYNAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const DEFAULT_POS = {lat:31.7784, lng:35.2066};
const WALK_M_PER_MIN = 80;
const DEV_TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Jerusalem'; } catch(e){ return 'Asia/Jerusalem'; } })();
const RADII = [5, 10, 15, 30, 60, 0];
const ZBASE = {sunrise:'הנץ החמה', chatzot:'חצות היום', minchaG:'מנחה גדולה', minchaK:'מנחה קטנה', plag:'פלג המנחה', sunset:'השקיעה', tzeit:'צאת הכוכבים'};
const CITIES = [
  ['ירושלים', 31.7784, 35.2066, 'Asia/Jerusalem'], ['תל אביב', 32.0853, 34.7818, 'Asia/Jerusalem'], ['חיפה', 32.794, 34.9896, 'Asia/Jerusalem'],
  ['בני ברק', 32.0807, 34.8338, 'Asia/Jerusalem'], ['באר שבע', 31.2518, 34.7913, 'Asia/Jerusalem'], ['אשדוד', 31.8044, 34.6553, 'Asia/Jerusalem'],
  ['פתח תקווה', 32.0871, 34.8875, 'Asia/Jerusalem'], ['נתניה', 32.3215, 34.8532, 'Asia/Jerusalem'], ['מודיעין', 31.8969, 35.0104, 'Asia/Jerusalem'],
  ['בית שמש', 31.7468, 34.9886, 'Asia/Jerusalem'], ['צפת', 32.9646, 35.496, 'Asia/Jerusalem'], ['טבריה', 32.7959, 35.531, 'Asia/Jerusalem'], ['אילת', 29.5577, 34.9519, 'Asia/Jerusalem'],
  ['ניו יורק', 40.7128, -74.006, 'America/New_York'], ['ברוקלין', 40.6782, -73.9442, 'America/New_York'], ['לייקווד', 40.0821, -74.2097, 'America/New_York'],
  ['מיאמי', 25.7617, -80.1918, 'America/New_York'], ['שיקגו', 41.8781, -87.6298, 'America/Chicago'], ['לוס אנג\'לס', 34.0522, -118.2437, 'America/Los_Angeles'],
  ['טורונטו', 43.6532, -79.3832, 'America/Toronto'], ['מונטריאול', 45.5017, -73.5673, 'America/Toronto'], ['מקסיקו סיטי', 19.4326, -99.1332, 'America/Mexico_City'],
  ['בואנוס איירס', -34.6037, -58.3816, 'America/Argentina/Buenos_Aires'], ['סאו פאולו', -23.5505, -46.6333, 'America/Sao_Paulo'],
  ['לונדון', 51.5074, -0.1278, 'Europe/London'], ['מנצ\'סטר', 53.4808, -2.2426, 'Europe/London'], ['פריז', 48.8566, 2.3522, 'Europe/Paris'],
  ['אנטוורפן', 51.2194, 4.4025, 'Europe/Brussels'], ['אמסטרדם', 52.3676, 4.9041, 'Europe/Amsterdam'], ['ברלין', 52.52, 13.405, 'Europe/Berlin'],
  ['רומא', 41.9028, 12.4964, 'Europe/Rome'], ['וינה', 48.2082, 16.3738, 'Europe/Vienna'], ['מוסקבה', 55.7558, 37.6173, 'Europe/Moscow'], ['קייב', 50.4501, 30.5234, 'Europe/Kyiv'],
  ['אומן', 48.7484, 30.2219, 'Europe/Kyiv'], ['איסטנבול', 41.0082, 28.9784, 'Europe/Istanbul'], ['דובאי', 25.2048, 55.2708, 'Asia/Dubai'],
  ['יוהנסבורג', -26.2041, 28.0473, 'Africa/Johannesburg'], ['בנגקוק', 13.7563, 100.5018, 'Asia/Bangkok'], ['מלבורן', -37.8136, 144.9631, 'Australia/Melbourne'], ['סידני', -33.8688, 151.2093, 'Australia/Sydney'],
];

/* ================= STORAGE (נשמר תמיד, גם אחרי עדכון) ================= */
const store = {
  get(k, d){ try { const v = localStorage.getItem('mn_' + k); return v == null ? d : JSON.parse(v); } catch(e){ return d; } },
  set(k, v){ try { localStorage.setItem('mn_' + k, JSON.stringify(v)); } catch(e){} },
};
const S = Object.assign({
  name:'', notif:true, watch:true, sound:true, voice:true, theme:'auto', place:null,
  q:{type:null, radius:20, nusach:'all', sort:'time'},
}, store.get('settings', null) || {});
// מעבר מגרסה 1: לא לאבד מה שכבר נשמר
if (!store.get('settings', null)){
  ['name', 'notif', 'watch', 'sound', 'theme'].forEach(k => { const v = store.get(k, undefined); if (v !== undefined) S[k] = v; });
  const r = store.get('radius', undefined); if (r !== undefined) S.q.radius = r;
}
try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch(e){}
let cloudTimer = null;
function save(){
  store.set('settings', S);
  clearTimeout(cloudTimer);
  cloudTimer = setTimeout(cloudSave, 1500);
}
let reminders = store.get('reminders', []); // [{id, at, title, body, key}]
const saveReminders = () => { store.set('reminders', reminders); cloudSave(); };

/* ================= TIME / TIMEZONES ================= */
const TZ = () => (S.place && S.place.tz) || DEV_TZ;
const fmts = {};
const fmt = (tz, opts, loc = 'he-IL') => { const k = loc + tz + JSON.stringify(opts); return fmts[k] || (fmts[k] = new Intl.DateTimeFormat(loc, {timeZone:tz, ...opts})); };
function parts(ms, tz){
  const o = {};
  for (const p of fmt(tz, {hourCycle:'h23', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit'}, 'en-US').formatToParts(ms)) o[p.type] = p.value;
  return {y:+o.year, mo:+o.month, d:+o.day, h:+o.hour % 24, mi:+o.minute, s:+o.second};
}
const tzOff = (tz, ms) => { const p = parts(ms, tz); return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000; };
function zoned(dk, hm, tz){
  const [y, mo, d] = dk.split('-').map(Number), [h, mi] = hm.split(':').map(Number);
  const g = Date.UTC(y, mo - 1, d, h, mi);
  let t = g - tzOff(tz, g);
  return g - tzOff(tz, t);
}
const pad = n => String(n).padStart(2, '0');
const dkOf = (ms, tz = TZ()) => { const p = parts(ms, tz); return `${p.y}-${pad(p.mo)}-${pad(p.d)}`; };
const hmOf = (ms, tz = TZ()) => { const p = parts(ms, tz); return `${pad(p.h)}:${pad(p.mi)}`; };
const addDays = (dk, n) => { const [y, m, d] = dk.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const wd = dk => { const [y, m, d] = dk.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const today = () => dkOf(Date.now());
const fmtT = (ms, tz = TZ()) => fmt(tz, {hour:'2-digit', minute:'2-digit', hourCycle:'h23'}).format(ms);
const fmtMin = m => m < 1 ? 'פחות מדקה' : m < 60 ? `${Math.round(m)} דק'` : `${Math.floor(m / 60)}:${pad(Math.round(m % 60))} שע'`;
const dayLabel = dk => {
  const t = today();
  if (dk === t) return 'היום';
  if (dk === addDays(t, 1)) return 'מחר';
  const [, m, d] = dk.split('-').map(Number);
  return `יום ${DAYS[wd(dk)]}' ${d}/${m}`;
};
function hebDate(ms = Date.now(), tz = TZ()){
  try { return fmt(tz, {day:'numeric', month:'long', year:'numeric'}, 'he-u-ca-hebrew').format(ms); } catch(e){ return ''; }
}

/* ================= ZMANIM (NOAA) ================= */
function sunMs(dk, lat, lng, zenith, rising){
  const [y, mo, d] = dk.split('-').map(Number);
  const rad = Math.PI / 180;
  const N = Math.round((Date.UTC(y, mo - 1, d) - Date.UTC(y, 0, 0)) / 864e5);
  const lngHour = lng / 15;
  const t = N + ((rising ? 6 : 18) - lngHour) / 24;
  const M = 0.9856 * t - 3.289;
  let L = M + 1.916 * Math.sin(M * rad) + 0.020 * Math.sin(2 * M * rad) + 282.634;
  L = ((L % 360) + 360) % 360;
  let RA = Math.atan(0.91764 * Math.tan(L * rad)) / rad;
  RA = ((RA % 360) + 360) % 360;
  RA += Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90;
  RA /= 15;
  const sinDec = 0.39782 * Math.sin(L * rad), cosDec = Math.cos(Math.asin(sinDec));
  const cosH = (Math.cos(zenith * rad) - sinDec * Math.sin(lat * rad)) / (cosDec * Math.cos(lat * rad));
  if (cosH > 1 || cosH < -1) return null;
  const H = (rising ? 360 - Math.acos(cosH) / rad : Math.acos(cosH) / rad) / 15;
  let UT = H + RA - 0.06571 * t - 6.622 - lngHour;
  const target = (rising ? 6 : 18) - lngHour;
  UT += 24 * Math.round((target - UT) / 24);
  return Date.UTC(y, mo - 1, d) + UT * HOUR;
}
const zCache = {};
function zmanimFor(dk, pos){
  const k = dk + pos.lat.toFixed(3) + pos.lng.toFixed(3);
  if (zCache[k]) return zCache[k];
  const z = (zen, r) => sunMs(dk, pos.lat, pos.lng, zen, r);
  const sunrise = z(90.833, true), sunset = z(90.833, false);
  if (sunrise == null || sunset == null) return null;
  const sh = (sunset - sunrise) / 12;
  return zCache[k] = {
    alot:z(106.1, true), misheyakir:z(101.5, true), sunrise,
    shma:sunrise + 3 * sh, tfila:sunrise + 4 * sh, chatzot:sunrise + 6 * sh,
    minchaG:sunrise + 6.5 * sh, minchaK:sunrise + 9.5 * sh, plag:sunrise + 10.75 * sh,
    sunset, tzeit:z(98.5, false), sh,
  };
}
function nowZman(){
  const t = Date.now(), z = zmanimFor(today(), here());
  if (!z) return {type:'mincha', z:null};
  if (t < z.alot - 5 * HOUR) return {type:'arvit', z};
  if (t < z.chatzot) return {type:'shacharit', z};
  if (t < z.sunset) return {type:'mincha', z};
  return {type:'arvit', z};
}
function zmanHint(t, z){
  if (!z) return '';
  const now = Date.now();
  if (t === 'shacharit') return now < z.tfila ? `סוף זמן תפילה ${fmtT(z.tfila)} · חצות ${fmtT(z.chatzot)}` : `סוף זמן תפילה (${fmtT(z.tfila)}) עבר. אפשר להתפלל עד חצות (${fmtT(z.chatzot)}).`;
  if (t === 'mincha') return `מנחה גדולה ${fmtT(z.minchaG)} · שקיעה ${fmtT(z.sunset)}`;
  return `צאת הכוכבים ${fmtT(z.tzeit)} · פלג המנחה ${fmtT(z.plag)}`;
}

/* ================= GEO ================= */
let gps = {lat:DEFAULT_POS.lat, lng:DEFAULT_POS.lng, real:false, acc:null};
const lastPos = store.get('lastPos', null);
if (lastPos) gps = {...lastPos, real:false};
const here = () => S.place ? {lat:S.place.lat, lng:S.place.lng, real:true, manual:true} : gps;
function distM(a, b){
  const R = 6371e3, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
const routes = {}; // key lat,lng -> {min, km, geo, steps, at}
const rkey = p => p.lat.toFixed(5) + ',' + p.lng.toFixed(5);
function walkOf(it){
  const h = here(), r = routes[rkey(it)];
  if (r && distM(r.at, h) < 120) return {min:r.min, km:r.km, real:true};
  const d = distM(h, it) * 1.3;
  return {min:d / WALK_M_PER_MIN, km:d / 1000, real:false};
}
async function fetchRoute(to, from = here(), force){
  const k = rkey(to), r = routes[k];
  if (!force && r && distM(r.at, from) < 120) return r;
  if (distM(from, to) > 60000) return null;
  const at = {lat:from.lat, lng:from.lng};
  const url = `https://routing.openstreetmap.de/routed-foot/route/v1/driving/${at.lng},${at.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=true`;
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 10000);
  try {
    const j = await (await fetch(url, {signal:ctl.signal})).json();
    const rt = j.routes && j.routes[0];
    if (!rt) return null;
    const steps = (rt.legs && rt.legs[0] && rt.legs[0].steps || []).map(s => ({
      type:s.maneuver.type, mod:s.maneuver.modifier || '', exit:s.maneuver.exit, name:s.name || '', dist:s.distance,
      loc:{lat:s.maneuver.location[1], lng:s.maneuver.location[0]},
    }));
    return routes[k] = {min:rt.distance / WALK_M_PER_MIN, km:rt.distance / 1000, geo:rt.geometry.coordinates.map(([x, y]) => [y, x]), steps, at};
  } catch(e){ return null; } finally { clearTimeout(tm); }
}
let routeBusy = false;
async function fetchListRoutes(list){
  if (routeBusy || !here().real) return;
  routeBusy = true;
  let changed = false;
  for (const it of list.slice(0, 8)){
    const r = routes[rkey(it)];
    if (r && distM(r.at, here()) < 120) continue;
    if (distM(here(), it) > 15000) continue;
    if (await fetchRoute(it)) changed = true;
    await new Promise(r => setTimeout(r, 250));
  }
  routeBusy = false;
  if (changed){ renderList(); renderMyBar(); }
}
let geoWatch = null;
function startGeo(){
  if (!('geolocation' in navigator)){ geoFail(); return; }
  geoWatch = navigator.geolocation.watchPosition(p => {
    const first = !gps.real;
    gps = {lat:p.coords.latitude, lng:p.coords.longitude, real:true, acc:p.coords.accuracy, heading:p.coords.heading, speed:p.coords.speed};
    store.set('lastPos', {lat:gps.lat, lng:gps.lng});
    hideBanner('geo');
    if (first && !S.place){ renderAll(); if (bigMap) bigMap.setView([gps.lat, gps.lng], 15); }
    else throttle('geoRender', 4000, () => { renderList(); renderMyBar(); updateMeMarkers(); });
    autoArrive(); navTick();
  }, () => geoFail(), {enableHighAccuracy:true, maximumAge:10000, timeout:20000});
}
function geoFail(){
  if (gps.real || S.place) return;
  showBanner('geo', '📍 אין גישה למיקום, אז המרחקים משוערים. אפשר לאשר מיקום בדפדפן, או לבחור מקום ידנית.', 'בחר מקום', openPlacePicker);
  renderAll();
}
const throttles = {};
function throttle(k, ms, fn){ if (throttles[k]) return; throttles[k] = setTimeout(() => { throttles[k] = null; fn(); }, ms); }

/* ================= FIREBASE ================= */
let uid = null, db = null, auth = null, A = null, connState = 'connecting';
const live = new Map(), syns = new Map(), occs = new Map();
let liveReady = false, synReady = false, occUnsub = null, occDay = null;
async function connect(){
  const base = `https://www.gstatic.com/firebasejs/${FB_V}/`;
  let F, app;
  [{initializeApp:app}, A, F] = await Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-firestore.js')]);
  const fapp = app(FB_CONFIG);
  auth = A.getAuth(fapp);
  let fs;
  try { fs = F.initializeFirestore(fapp, {localCache:F.persistentLocalCache({tabManager:F.persistentMultipleTabManager()})}); }
  catch(e){ fs = F.getFirestore(fapp); }
  const emu = window.__FB_EMU;
  if (emu){ A.connectAuthEmulator(auth, 'http://127.0.0.1:9099', {disableWarnings:true}); F.connectFirestoreEmulator(fs, '127.0.0.1', 8085); }
  await auth.authStateReady();
  if (!auth.currentUser) await A.signInAnonymously(auth);
  uid = auth.currentUser.uid;
  db = {F, fs, ref:(...p) => F.doc(fs, ...p), col:(...p) => F.collection(fs, ...p)};
}
function subscribe(){
  const {F} = db;
  F.onSnapshot(F.query(db.col('minyanim'), F.where('expires', '>', Date.now())), snap => {
    const prev = liveReady ? new Map([...live].map(([k, v]) => [k, JSON.parse(JSON.stringify(v))])) : null;
    live.clear(); snap.forEach(d => live.set(d.id, {id:d.id, ...d.data()}));
    liveReady = true; setConn('ok');
    alertsLive(prev);
    onData();
  }, err => netErr(err));
  F.onSnapshot(db.col('synagogues'), snap => {
    const prev = synReady ? new Map([...syns].map(([k, v]) => [k, JSON.parse(JSON.stringify(v))])) : null;
    syns.clear(); snap.forEach(d => syns.set(d.id, {id:d.id, ...d.data()}));
    synReady = true; setConn('ok');
    alertsSyn(prev);
    onData();
  }, err => netErr(err));
  subOcc();
  cloudLoad();
}
function subOcc(){
  const dk = S.q.day || today();
  if (!db || occDay === dk) return;
  occDay = dk;
  if (occUnsub) occUnsub();
  const {F} = db;
  let first = true;
  occUnsub = F.onSnapshot(F.query(db.col('occ'), F.where('date', '==', dk)), snap => {
    const prev = first ? null : new Map([...occs].map(([k, v]) => [k, JSON.parse(JSON.stringify(v))]));
    first = false;
    occs.clear(); snap.forEach(d => occs.set(d.id, {id:d.id, ...d.data()}));
    alertsOcc(prev);
    onData();
  }, err => netErr(err));
}
function netErr(err){
  console.warn(err);
  setConn('error', err && err.code === 'permission-denied' ? 'perm' : 'net');
}
function setConn(s, why){
  connState = s;
  if (s === 'ok') hideBanner('conn');
  else if (s === 'error'){
    showBanner('conn', why === 'perm' ? '🔒 השרת עוד לא מוכן לגרסה הזאת (צריך לעדכן את הכללים ב-Firebase).' : '📡 אין חיבור לשרת. מנסה שוב…', 'טען מחדש', hardReload);
    renderList();
  }
}
// גיבוי ההגדרות בענן (נשמר גם אם הדפדפן נמחק, אם מחוברים עם Google)
async function cloudSave(){
  if (!db || !uid) return;
  try { await db.F.setDoc(db.ref('data', 'users', uid, 'minyanPrefs'), {s:JSON.stringify(S), r:JSON.stringify(reminders), t:Date.now()}); } catch(e){}
}
async function cloudLoad(){
  try {
    const d = await db.F.getDoc(db.ref('data', 'users', uid, 'minyanPrefs'));
    if (!d.exists()) { cloudSave(); return; }
    if (!store.get('settings', null) || store.get('restoredFrom', null) !== uid && !S.name){
      const v = d.data();
      Object.assign(S, JSON.parse(v.s || '{}'));
      reminders = JSON.parse(v.r || '[]');
      store.set('settings', S); store.set('reminders', reminders); store.set('restoredFrom', uid);
      applyTheme(); renderAll(); scheduleReminders();
    }
  } catch(e){}
}

/* ================= LISTINGS ================= */
const slotTime = (s, sl, dk) => {
  if (sl.mode === 'rel'){
    const z = zmanimFor(dk, s);
    if (!z || !z[sl.base]) return null;
    let t = z[sl.base] + (sl.offset || 0) * MIN;
    t = sl.round5 ? Math.floor(t / (5 * MIN)) * 5 * MIN : Math.floor(t / MIN) * MIN;
    return t;
  }
  return zoned(dk, sl.time || '00:00', s.tz || TZ());
};
const exKey = (dk, slId) => 'd' + dk.replace(/-/g, '') + '_' + slId;
function occursOn(sl, dk){
  if (!sl.days || !sl.days.includes(wd(dk))) return false;
  if (sl.from && dk < sl.from) return false;
  if (sl.weeks && sl.from && dk >= addDays(sl.from, sl.weeks * 7)) return false;
  return true;
}
function schedItem(s, sl, dk){
  const ex = (s.ex || {})[exKey(dk, sl.id)] || {};
  const id = `${s.id}_${dk}_${sl.id}`;
  const occ = occs.get(id) || {};
  const startAt = ex.time ? zoned(dk, ex.time, s.tz || TZ()) : slotTime(s, sl, dk);
  return {
    kind:'sched', id, dk, syn:s, slot:sl, type:sl.type, startAt, name:s.name, place:s.place, lat:s.lat, lng:s.lng,
    nusach:s.nusach, note:s.note, dayNote:ex.note || '', cancelled:!!ex.cancel, moved:!!ex.time, owner:s.owner, ownerName:s.ownerName,
    members:occ.members || {}, extra:occ.extra || 0, tz:s.tz,
  };
}
function liveItem(m){
  return {kind:'live', id:m.id, m, type:m.type, startAt:m.startAt, name:m.name || '', place:m.place, lat:m.lat, lng:m.lng, nusach:m.nusach,
    note:m.note, status:m.status, owner:m.owner, ownerName:m.ownerName, members:m.members || {}, extra:m.extra || 0, tz:m.tz};
}
function listingsFor(dk){
  const out = [];
  for (const m of live.values()){
    if ((m.expires || 0) <= Date.now() || !m.startAt) continue;
    if (dkOf(m.startAt, TZ()) !== dk) continue;
    out.push(liveItem(m));
  }
  for (const s of syns.values()) for (const sl of (s.slots || [])){
    if (!occursOn(sl, dk)) continue;
    const it = schedItem(s, sl, dk);
    if (it.startAt != null) out.push(it);
  }
  return out;
}
function findItem(id){
  if (live.has(id)) return liveItem(live.get(id));
  const m = /^(.+)_(\d{4}-\d{2}-\d{2})_([A-Za-z0-9]+)$/.exec(id);
  if (m && syns.has(m[1])){
    const s = syns.get(m[1]), sl = (s.slots || []).find(x => x.id === m[3]);
    if (sl) return schedItem(s, sl, m[2]);
  }
  return null;
}
const I = {
  count: it => Object.keys(it.members || {}).length + (it.extra || 0),
  full: it => I.count(it) >= 10,
  isIn: it => !!(it.members && it.members[uid]),
  isOwner: it => it.owner === uid,
  mine: it => I.isIn(it) || (it.kind === 'live' && I.isOwner(it)),
  title: it => it.name ? it.name : it.place || 'מניין',
};
function statusOf(it){
  const now = Date.now();
  if (it.cancelled) return {t:'❌ בוטל היום', c:'now'};
  if (it.kind === 'live'){
    if (it.status === 'started') return {t:'✅ התחילו', c:'ok'};
    if (it.status === 'now') return {t:'▶️ מתחילים עכשיו', c:'now'};
  }
  const left = (it.startAt - now) / MIN;
  if (left > 0) return {t:`⏱️ ${left > 180 ? 'ב-' + fmtT(it.startAt) : `בעוד ${fmtMin(left)} (${fmtT(it.startAt)})`}`, c:'go'};
  if (left > -40) return {t:it.kind === 'live' ? `⏰ אמורים להתחיל (${fmtT(it.startAt)})` : `▶️ התחילו ב-${fmtT(it.startAt)}`, c:'now'};
  return {t:`🕓 היה ב-${fmtT(it.startAt)}`, c:''};
}
function isPast(it){
  if (it.kind === 'live') return false; // מניין חי נעלם לבד כשהוא נגמר
  return it.startAt < Date.now() - 40 * MIN;
}
function filtered(dk = S.q.day || today(), forMap){
  const q = S.q, text = (q.text || '').trim().toLowerCase();
  const out = [];
  for (const it of listingsFor(dk)){
    const w = walkOf(it), mine = I.mine(it);
    if (it.type !== q.type) continue;
    if (!mine){
      if (q.radius && w.min > q.radius) continue;
      if (q.nusach !== 'all' && (it.nusach || 'none') !== q.nusach) continue;
      if (text && !(`${it.name} ${it.place}`.toLowerCase().includes(text))) continue;
      if (isPast(it) && !q.showPast) continue;
    }
    out.push({it, w, mine});
  }
  out.sort((a, b) => (b.mine - a.mine) || (a.it.cancelled - b.it.cancelled) || (q.sort === 'dist' ? a.w.min - b.w.min : (a.it.startAt - b.it.startAt) || (a.w.min - b.w.min)));
  return out;
}

/* ================= WRITES ================= */
const expiresOf = (x) => {
  const now = Date.now();
  let e = Math.max((x.created || now) + 3 * HOUR, (x.startAt || 0) + 90 * MIN, now + HOUR);
  if (x.status === 'started') e = Math.min(e, now + 75 * MIN);
  return e;
};
async function createLive(d){
  const {F} = db;
  const ref = F.doc(db.col('minyanim'));
  const now = Date.now();
  const doc = {
    type:d.type, name:(d.name || '').slice(0, 60), lat:d.lat, lng:d.lng, place:(d.place || '').slice(0, 120), note:(d.note || '').slice(0, 300),
    nusach:d.nusach || 'none', owner:uid, ownerName:S.name || 'אורח', tz:TZ(),
    status:d.startAt > now + MIN ? 'wait' : 'now', startAt:Math.max(d.startAt, now),
    extra:Math.max(0, (d.count || 1) - 1), members:{[uid]:{n:S.name || 'אורח', s:d.startAt > now + 20 * MIN ? 'coming' : 'here', t:now}},
    created:now, updated:now,
  };
  doc.expires = expiresOf(doc);
  await F.setDoc(ref, doc);
  return ref.id;
}
async function ownerLive(id, patch){
  const m = live.get(id); if (!m) return;
  patch.updated = Date.now();
  patch.expires = expiresOf({...m, ...patch});
  Object.assign(m, patch);
  onData();
  try { await db.F.updateDoc(db.ref('minyanim', id), patch); } catch(e){ toast('⚠️ לא נשמר: ' + (e.code || e.message)); }
}
async function join(it, s){
  if (!S.name) await askName();
  const {F} = db;
  const w = walkOf(it);
  const entry = {n:S.name || 'אורח', s, t:Date.now()};
  if (s === 'coming') entry.eta = Date.now() + Math.round(w.min) * MIN;
  // רק במניין אחד מאותו סוג באותו יום
  for (const o of listingsFor(it.kind === 'live' ? dkOf(it.startAt) : it.dk)){
    if (o.id !== it.id && o.type === it.type && I.isIn(o) && !(o.kind === 'live' && I.isOwner(o))) await leave(o, true);
  }
  try {
    if (it.kind === 'live') await F.updateDoc(db.ref('minyanim', it.id), {[`members.${uid}`]:entry, updated:Date.now()});
    else if (occs.has(it.id)) await F.updateDoc(db.ref('occ', it.id), {[`members.${uid}`]:entry, updated:Date.now()});
    else await F.setDoc(db.ref('occ', it.id), {syn:it.syn.id, date:it.dk, slot:it.slot.id, members:{[uid]:entry}, updated:Date.now(), expires:it.startAt + 6 * HOUR}, {merge:true});
  } catch(e){ toast('⚠️ לא הצלחתי להצטרף: ' + (e.code || e.message)); }
}
async function leave(it, quiet){
  const {F} = db;
  try { await F.updateDoc(db.ref(it.kind === 'live' ? 'minyanim' : 'occ', it.id), {[`members.${uid}`]:F.deleteField(), updated:Date.now()}); }
  catch(e){ if (!quiet) toast('⚠️ ' + (e.code || e.message)); }
}
async function synEx(it, val){ // ביטול / שינוי שעה / הערה ליום אחד
  const {F} = db;
  const key = `ex.${exKey(it.dk, it.slot.id)}`;
  try { await F.updateDoc(db.ref('synagogues', it.syn.id), {[key]:val == null ? F.deleteField() : val, updated:Date.now()}); }
  catch(e){ toast('⚠️ לא נשמר: ' + (e.code || e.message)); }
}
async function occExtra(it, extra){
  try { await db.F.setDoc(db.ref('occ', it.id), {syn:it.syn.id, date:it.dk, slot:it.slot.id, extra, updated:Date.now(), expires:it.startAt + 6 * HOUR}, {merge:true}); }
  catch(e){ toast('⚠️ לא נשמר: ' + (e.code || e.message)); }
}

/* ================= ALERTS ================= */
function alertsLive(prev){
  if (!prev) return;
  for (const m of live.values()){
    const it = liveItem(m), p = prev.get(m.id), t = TYPES[m.type];
    const w = walkOf(it), near = !S.q.radius || w.min <= S.q.radius;
    const mine = I.mine(it);
    if (!p){
      if (!mine && S.watch && m.type === S.q.type && near && dkOf(m.startAt) === today())
        notify(`${t.i} נפתח מניין ${t.n}`, `${I.title(it)} · ${fmtMin(w.min)} הליכה · ${I.count(it)}/10`, m.id);
      continue;
    }
    const pit = liveItem(p);
    if (mine) memberAlerts(pit, it);
    if (mine && p.status !== m.status && m.owner !== uid){
      if (m.status === 'now') notify('▶️ מתחילים עכשיו!', `${t.n} · ${I.title(it)}`, m.id);
      if (m.status === 'started') notify('✅ התחילו להתפלל', `${t.n} · ${I.title(it)}`, m.id);
    }
    if (mine && p.startAt !== m.startAt && m.status === 'wait' && m.owner !== uid)
      notify('⏰ זמן ההתחלה השתנה', `${t.n} · ${I.title(it)}: ${fmtT(m.startAt)}`, m.id);
    if (!I.full(pit) && I.full(it) && (mine || (m.type === S.q.type && near)))
      notify(`🎉 יש מניין! ${t.n}`, `${I.title(it)}: ${I.count(it)} אנשים${mine ? '' : ' · ' + fmtMin(w.min) + ' הליכה'}`, m.id, true);
  }
  for (const p of prev.values()) if (!live.has(p.id) && p.members && p.members[uid] && p.owner !== uid) toast(`המניין "${esc(I.title(liveItem(p)))}" נסגר`);
}
function memberAlerts(p, it){
  const before = new Set(Object.keys(p.members || {}));
  for (const [k, v] of Object.entries(it.members || {})){
    if (k !== uid && !before.has(k)) notify(`👋 ${v.n || 'מישהו'} ${v.s === 'coming' ? 'בדרך' : 'הצטרף'}`, `${TYPES[it.type].n} · ${I.title(it)}: עכשיו ${I.count(it)}/10`, it.id);
  }
}
function alertsOcc(prev){
  if (!prev) return;
  for (const o of occs.values()){
    const it = findItem(o.id), p = prev.get(o.id);
    if (!it || !p) continue;
    const pit = {...it, members:p.members || {}, extra:p.extra || 0};
    if (I.isIn(it)) memberAlerts(pit, it);
    if (!I.full(pit) && I.full(it) && (I.isIn(it) || it.type === S.q.type)) notify(`🎉 יש מניין! ${TYPES[it.type].n}`, `${I.title(it)} · ${fmtT(it.startAt)}`, it.id, true);
  }
}
function alertsSyn(prev){
  if (!prev) return;
  for (const o of occs.values()){
    if (!o.members || !o.members[uid] || !prev.has(o.syn)) continue;
    const now = findItem(o.id); if (!now) continue;
    const ps = prev.get(o.syn), psl = (ps.slots || []).find(x => x.id === o.slot);
    if (!psl) continue;
    const before = schedItem(ps, psl, o.date);
    if (!before.cancelled && now.cancelled) notify('❌ התפילה בוטלה', `${TYPES[now.type].n} · ${I.title(now)} · ${dayLabel(now.dk)}`, now.id);
    else if (before.startAt !== now.startAt) notify('⏰ השעה השתנתה', `${TYPES[now.type].n} · ${I.title(now)}: ${fmtT(now.startAt)}`, now.id);
  }
}
let audioCtx = null;
function beep(kind){
  if (!S.sound) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const notes = kind === 'happy' ? [523, 659, 784, 1047] : kind === 'alarm' ? [880, 660, 880, 660, 880, 660] : [660, 880];
    notes.forEach((f, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      const t0 = audioCtx.currentTime + i * 0.15;
      o.frequency.value = f; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.27);
      o.connect(g).connect(audioCtx.destination);
      o.start(t0); o.stop(t0 + 0.3);
    });
  } catch(e){}
}
async function sysNotify(title, body, id){
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    const opts = {body, icon:'icon-192.png', badge:'icon-192.png', tag:id || 'mf', data:{id}, renotify:true};
    if (reg) reg.showNotification(title, opts); else new Notification(title, opts);
  } catch(e){}
}
function notify(title, body, id, happy){
  toast(`<b>${esc(title)}</b><br>${esc(body)}`, id, happy);
  if (!S.notif) return;
  beep(happy ? 'happy' : 'ping');
  try { navigator.vibrate && navigator.vibrate(happy ? [120, 80, 120, 80, 240] : [150]); } catch(e){}
  if (document.hidden) sysNotify(title, body, id);
}
function toast(html, id, ok){
  const el = document.createElement('div');
  el.className = 'toast' + (ok ? ' ok' : '');
  el.innerHTML = html;
  el.onclick = () => { if (id) openRoom(id); el.remove(); };
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), ok ? 8000 : 5000);
  while ($('#toasts').children.length > 3) $('#toasts').firstChild.remove();
}
function askNotif(){
  if (!('Notification' in window) || Notification.permission !== 'default') return;
  try { Notification.requestPermission(); } catch(e){}
}

/* ================= REMINDERS (שעון מעורר) ================= */
const remTimers = {};
function scheduleReminders(){
  Object.values(remTimers).forEach(clearTimeout);
  const now = Date.now();
  reminders = reminders.filter(r => r.at > now - 10 * MIN);
  for (const r of reminders){
    const ms = r.at - now;
    if (ms < 2 ** 31 - 1) remTimers[r.key] = setTimeout(() => fireReminder(r), Math.max(0, ms));
  }
  store.set('reminders', reminders);
}
function fireReminder(r){
  reminders = reminders.filter(x => x.key !== r.key); saveReminders();
  toast(`<b>⏰ ${esc(r.title)}</b><br>${esc(r.body)}`, r.id, true);
  beep('alarm'); setTimeout(() => beep('alarm'), 1300);
  try { navigator.vibrate && navigator.vibrate([400, 200, 400, 200, 400]); } catch(e){}
  sysNotify('⏰ ' + r.title, r.body, r.id);
  renderMine();
}
function addReminder(it, mode){
  const w = walkOf(it);
  const at = mode === 'leave' ? it.startAt - (Math.ceil(w.min) + 3) * MIN : it.startAt - mode * MIN;
  if (at < Date.now()){ toast('⏰ הזמן הזה כבר עבר'); return; }
  const key = it.id + '|' + mode;
  reminders = reminders.filter(r => r.key !== key);
  reminders.push({key, id:it.id, at, title:mode === 'leave' ? 'הגיע הזמן לצאת למניין!' : `עוד ${mode} דק' ${TYPES[it.type].n}`,
    body:`${TYPES[it.type].n} · ${I.title(it)} · ${fmtT(it.startAt)} · ${fmtMin(w.min)} הליכה`});
  saveReminders(); scheduleReminders(); askNotif();
  toast(`⏰ תזכורת נקבעה ל-${fmtT(at)}`, null, true);
}

/* ================= RENDER: SEARCH ================= */
function renderSearchPanel(){
  const q = S.q, t = today();
  const days = Array.from({length:7}, (_, i) => addDays(t, i));
  const cur = q.day || t;
  $('#searchPanel').innerHTML = `
    <div class="prow"><div class="seg" id="qType">${Object.entries(TYPES).map(([k, v]) => `<button data-t="${k}" class="${q.type === k ? 'on' : ''}">${v.i} ${v.n}</button>`).join('')}</div></div>
    <div class="prow"><div class="plabel">📅 יום</div><div class="chips" id="qDay">${days.map(d => `<button data-d="${d}" class="${cur === d ? 'on' : ''}">${dayLabel(d)}</button>`).join('')}<input type="date" id="qDate" value="${days.includes(cur) ? '' : cur}" min="${t}"></div></div>
    <div class="prow"><div class="plabel">🚶 עד כמה רחוק</div><div class="chips" id="qRad">${RADII.map(r => `<button data-r="${r}" class="${q.radius === r ? 'on' : ''}">${r ? (r < 60 ? r + " דק' הליכה" : 'שעה הליכה') : '🌍 כל המניינים'}</button>`).join('')}</div></div>
    <div class="prow"><div class="plabel">📖 נוסח</div><div class="chips" id="qNus"><button data-n="all" class="${q.nusach === 'all' ? 'on' : ''}">הכל</button>${Object.entries(NUSACH).filter(([k]) => k !== 'none').map(([k, v]) => `<button data-n="${k}" class="${q.nusach === k ? 'on' : ''}">${v}</button>`).join('')}<button data-n="none" class="${q.nusach === 'none' ? 'on' : ''}">לא צוין</button></div></div>
    <div class="prow searchin"><input type="search" id="qText" placeholder="🔎 חיפוש לפי שם המניין או בית הכנסת" value="${esc(q.text || '')}" enterkeyhint="search"></div>`;
  $$('#qType button').forEach(b => b.onclick = () => { q.type = b.dataset.t; save(); renderSearchPanel(); renderList(); renderBigMap(); });
  $$('#qDay button').forEach(b => b.onclick = () => setDay(b.dataset.d));
  $('#qDate').onchange = e => { if (e.target.value) setDay(e.target.value); };
  $$('#qRad button').forEach(b => b.onclick = () => { q.radius = +b.dataset.r; save(); renderSearchPanel(); renderList(); renderBigMap(); });
  $$('#qNus button').forEach(b => b.onclick = () => { q.nusach = b.dataset.n; save(); renderSearchPanel(); renderList(); renderBigMap(); });
  $('#qText').oninput = e => { q.text = e.target.value; throttle('qtext', 250, () => { save(); renderList(); renderBigMap(); }); };
  renderMapPanel();
}
function setDay(d){
  S.q.day = d === today() ? null : d; save();
  subOcc(); renderSearchPanel(); renderList(); renderBigMap();
}
function renderMapPanel(){
  const q = S.q;
  $('#mapPanel').innerHTML = `<div class="seg">${Object.entries(TYPES).map(([k, v]) => `<button data-t="${k}" class="${q.type === k ? 'on' : ''}">${v.i} ${v.n}</button>`).join('')}</div>
    <div class="small" style="margin-top:6px;text-align:center">${dayLabel(q.day || today())} · ${q.radius ? `עד ${q.radius} דק' הליכה` : 'כל המניינים'}${q.nusach !== 'all' ? ' · ' + nusachName(q.nusach) : ''}. אפשר לשנות בלשונית החיפוש.</div>`;
  $$('#mapPanel .seg button').forEach(b => b.onclick = () => { q.type = b.dataset.t; save(); renderSearchPanel(); renderList(); renderBigMap(); });
}
function bar(it, big){
  const c = I.count(it), full = c >= 10;
  return `<div class="count${big ? ' big' : ''}"><div class="bar${full ? ' full' : ''}">${Array.from({length:10}, (_, i) => `<i class="${i < c ? 'on' : ''}"></i>`).join('')}</div><b>${full ? '✅ ' : ''}${c}/10</b></div>`;
}
function arriveHint(it){
  if (I.isIn(it) || it.cancelled || (it.kind === 'live' && it.status === 'started')) return '';
  const w = walkOf(it), left = (it.startAt - Date.now()) / MIN;
  if (it.kind === 'live' && it.status === 'now') return w.min > 3 ? `<span class="badge warn">🏃 תגיע אחרי שהתחילו</span>` : '';
  if (left <= 0 || left > 240) return '';
  if (w.min > left + 1) return `<span class="badge warn">🏃 תגיע ${Math.round(w.min - left)} דק' אחרי ההתחלה</span>`;
  return `<span class="badge">👍 צא עד ${fmtT(it.startAt - w.min * MIN)}</span>`;
}
function renderList(){
  const el = $('#list'); if (!el) return;
  if (connState === 'connecting' && !liveReady){ el.innerHTML = `<div class="empty"><div class="big spin">🔄</div><b>מתחבר…</b></div>`; $('#resHead').innerHTML = ''; return; }
  const dk = S.q.day || today();
  const list = filtered(dk);
  const t = TYPES[S.q.type];
  $('#resHead').innerHTML = `<span>${list.length ? `נמצאו ${list.length} ${list.length === 1 ? 'מניין' : 'מניינים'} ל${t.n} · ${dayLabel(dk)}` : ''}</span>
    <button id="sortBtn">${S.q.sort === 'dist' ? '↕️ ממוין לפי מרחק' : '↕️ ממוין לפי שעה'}</button>`;
  $('#sortBtn').onclick = () => { S.q.sort = S.q.sort === 'dist' ? 'time' : 'dist'; save(); renderList(); };
  if (!list.length){
    const nz = nowZman();
    el.innerHTML = `<div class="empty"><div class="big">${t.i}</div>
      <b>אין מניין ${t.n} ${['היום', 'מחר'].includes(dayLabel(dk)) ? dayLabel(dk) : 'ב' + dayLabel(dk)}${S.q.radius ? ` עד ${S.q.radius} דק' הליכה` : ''}${S.q.text ? ` בשם "${esc(S.q.text)}"` : ''}</b>
      ${connState === 'error' ? 'אין חיבור לשרת כרגע.' : 'אפשר לפתוח מניין, ואנשים בסביבה יראו אותו ויצטרפו.'}
      <div style="margin-top:14px;display:flex;flex-direction:column;gap:8px;align-items:center">
        <button class="btn pri" data-act="create">➕ לפתוח מניין ${t.n}</button>
        ${S.q.radius ? `<button class="btn" data-act="wider">🌍 להראות את כל המניינים</button>` : ''}
        ${S.watch ? `<span class="small">🔔 נודיע לך כשנפתח מניין ${t.n} בסביבה</span>` : `<button class="btn" data-act="watch">🔔 תודיע לי כשנפתח מניין</button>`}
      </div>
      <p class="small" style="margin-top:16px">${dk === today() ? zmanHint(S.q.type, nz.z) : ''}</p></div>`;
    $('[data-act=create]', el).onclick = () => openCreate();
    const wb = $('[data-act=wider]', el); if (wb) wb.onclick = () => { S.q.radius = 0; save(); renderSearchPanel(); renderList(); };
    const nb = $('[data-act=watch]', el); if (nb) nb.onclick = () => { S.watch = true; save(); askNotif(); renderList(); };
    return;
  }
  el.innerHTML = list.map(({it, w, mine}) => {
    const st = statusOf(it), past = isPast(it);
    return `<button class="card mcard${I.full(it) ? ' full' : ''}${mine ? ' mine' : ''}${it.cancelled || past ? ' off' : ''}" data-id="${esc(it.id)}">
      <div class="mrow">
        <div class="timebox"><b>${fmtT(it.startAt)}</b><small>${it.kind === 'live' && it.status !== 'wait' ? 'עכשיו' : 'שעה'}</small></div>
        <div style="flex:1;min-width:0">
          <div class="mtitle">${TYPES[it.type].i} ${esc(I.title(it))}</div>
          <div class="msub">${it.name && it.place ? esc(it.place) + ' · ' : ''}${nusachName(it.nusach)}</div>
        </div>
        <div class="walk${w.real ? '' : ' est'}"><b>${Math.max(1, Math.round(w.min)) > 999 ? '∞' : Math.max(1, Math.round(w.min))}</b><small>דק' הליכה${w.real ? '' : '~'}</small></div>
      </div>
      ${it.cancelled ? '' : bar(it)}
      <div>${it.kind === 'sched' ? '<span class="badge syn">🕍 קבוע</span>' : '<span class="badge">⚡ נפתח עכשיו</span>'}<span class="badge ${st.c}">${st.t}</span>${it.moved && !it.cancelled ? '<span class="badge warn">⚠️ שעה שונה מהרגיל</span>' : ''}${I.full(it) && !it.cancelled ? '<span class="badge ok">✅ יש מניין</span>' : ''}${mine ? '<span class="badge ok">🙋 אתה רשום</span>' : ''}${arriveHint(it)}</div>
      ${it.dayNote ? `<div class="note imp" style="margin-top:8px">📌 ${esc(it.dayNote)}</div>` : it.note ? `<div class="msub" style="margin-top:6px">📌 ${esc(it.note)}</div>` : ''}
    </button>`;
  }).join('');
  $$('.mcard', el).forEach(b => b.onclick = () => openRoom(b.dataset.id));
  fetchListRoutes(list.filter(x => !x.it.cancelled).map(x => x.it));
}
function myItems(){
  const out = [];
  for (const d of [today(), S.q.day].filter(Boolean)) for (const it of listingsFor(d)) if (I.mine(it) && !isPast(it) && !it.cancelled && !out.some(o => o.id === it.id)) out.push(it);
  return out.sort((a, b) => a.startAt - b.startAt);
}
function renderMyBar(){
  const bar = $('#mybar');
  const it = myItems()[0];
  if (!it || !$('#room').hidden || !$('#editor').hidden || !$('#nav').hidden){ bar.hidden = true; return; }
  const st = statusOf(it);
  bar.hidden = false;
  bar.className = I.full(it) ? '' : 'notfull';
  bar.innerHTML = `<span>🙋 ${TYPES[it.type].n} · ${esc(I.title(it))} · ${I.count(it)}/10 ${I.full(it) ? '✅' : ''}<br><small>${st.t}</small></span><span>‹</span>`;
  bar.onclick = () => openRoom(it.id);
}

/* ================= MAPS ================= */
const TILE = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const tiles = () => L.tileLayer(TILE, {maxZoom:20, subdomains:'abcd', attribution:'© OpenStreetMap © CARTO'});
const meIcon = () => L.divIcon({className:'', html:'<div class="medot"></div>', iconSize:[18, 18], iconAnchor:[9, 9]});
const pinIcon = it => L.divIcon({className:'', html:`<div class="pin${it.cancelled ? ' off' : I.full(it) ? ' full' : it.kind === 'sched' && !I.count(it) ? ' syn' : ''}"><span>${it.kind === 'sched' && !I.count(it) ? '🕍' : I.count(it)}</span></div>`, iconSize:[38, 38], iconAnchor:[19, 40]});
let bigMap = null, bigLayer = null, bigMe = null, view = 'search';
function renderBigMap(){
  if (view !== 'map') return;
  const h = here();
  if (!bigMap){
    bigMap = L.map('bigmap').setView([h.lat, h.lng], 15);
    tiles().addTo(bigMap);
    bigLayer = L.layerGroup().addTo(bigMap);
    bigMe = L.marker([h.lat, h.lng], {icon:meIcon(), interactive:false}).addTo(bigMap);
  }
  setTimeout(() => bigMap.invalidateSize(), 50);
  bigLayer.clearLayers();
  for (const {it, w} of filtered()){
    L.marker([it.lat, it.lng], {icon:pinIcon(it)}).addTo(bigLayer)
      .bindTooltip(`${fmtT(it.startAt)} · ${esc(I.title(it))} · ${Math.round(w.min)} דק'`, {direction:'top', offset:[0, -36]})
      .on('click', () => openRoom(it.id));
  }
}
function updateMeMarkers(){
  const h = here();
  if (bigMe) bigMe.setLatLng([h.lat, h.lng]);
  if (roomMap && roomMe) roomMe.setLatLng([h.lat, h.lng]);
}

/* ================= ROOM ================= */
let openId = null, roomMap = null, roomMe = null, roomRoute = null, chatUnsub = null, ownerBuilt = null, lastChat = [];
function openRoom(id, noPush){
  const it = findItem(id); if (!it){ toast('המניין הזה כבר לא פעיל'); return; }
  if (openId !== id) closeRoom(true);
  openId = id;
  if (!noPush) history.pushState({room:id}, '', (it.kind === 'live' ? '?m=' : '?o=') + encodeURIComponent(id));
  const el = $('#room');
  el.hidden = false; $('#mybar').hidden = true;
  el.innerHTML = `<div class="inner">
    <div class="phead"><button class="back" id="rBack">→</button><h2 id="rTitle"></h2><button class="iconbtn" id="rShare" title="שיתוף">📤</button></div>
    <div id="rmap" class="rmap" dir="ltr"></div>
    <div class="routeinfo" id="rRoute"></div>
    <div class="row" style="margin-bottom:8px"><button class="btn pri" id="rNav">🧭 ניווט בהליכה</button></div>
    <div class="row" style="margin-bottom:10px">
      <a class="btn sm" id="rGmaps" target="_blank" rel="noopener">🗺️ Google Maps</a>
      <a class="btn sm" id="rWaze" target="_blank" rel="noopener">🚙 Waze</a>
      <button class="btn sm" id="rRemind">⏰ תזכורת</button>
    </div>
    <div class="card" id="rInfo"></div>
    <div id="rActions"></div>
    <div id="rOwner"></div>
    <div id="rWeekly"></div>
    <div class="sect">👥 מי מגיע</div><div class="members" id="rMembers"></div>
    <div class="sect">💬 צ'אט</div>
    <div class="card"><div class="chat" id="rChat"><div class="small">אין הודעות עדיין</div></div>
      <form class="chatin" id="rChatForm"><input type="text" id="rChatIn" maxlength="200" placeholder="כתוב הודעה… (למשל: אני מביא עוד 2)" autocomplete="off"><button class="btn pri">שלח</button></form>
    </div>
  </div>`;
  $('#rBack').onclick = () => history.back();
  $('#rShare').onclick = () => share(findItem(openId));
  $('#rNav').onclick = () => startNav(findItem(openId));
  $('#rRemind').onclick = () => remindMenu(findItem(openId));
  $('#rChatForm').onsubmit = e => { e.preventDefault(); sendChat(); };
  ownerBuilt = null;
  const h = here();
  roomMap = L.map('rmap', {zoomControl:false, zoomAnimation:false, fadeAnimation:false, markerZoomAnimation:false});
  tiles().addTo(roomMap);
  L.marker([it.lat, it.lng], {icon:pinIcon(it)}).addTo(roomMap);
  roomMe = L.marker([h.lat, h.lng], {icon:meIcon(), interactive:false}).addTo(roomMap);
  if (distM(h, it) < 30000) roomMap.fitBounds(L.latLngBounds([[it.lat, it.lng], [h.lat, h.lng]]).pad(0.25), {maxZoom:17});
  else roomMap.setView([it.lat, it.lng], 16);
  $('#rGmaps').href = `https://www.google.com/maps/dir/?api=1&destination=${it.lat},${it.lng}&travelmode=walking`;
  $('#rWaze').href = `https://waze.com/ul?ll=${it.lat},${it.lng}&navigate=yes`;
  fetchRoute(it).then(r => {
    if (!r || openId !== id || !roomMap) return;
    if (roomRoute) roomRoute.remove();
    roomRoute = L.polyline(r.geo, {color:'#2f80ff', weight:6, opacity:.85}).addTo(roomMap);
    roomMap.fitBounds(roomRoute.getBounds().pad(0.2), {maxZoom:17});
    renderRoom(); renderList();
  });
  const {F} = db;
  const chatCol = it.kind === 'live' ? db.col('minyanim', id, 'chat') : db.col('occ', id, 'chat');
  chatUnsub = F.onSnapshot(F.query(chatCol, F.orderBy('t'), F.limitToLast(60)), s => {
    const msgs = s.docs.map(d => d.data());
    if (lastChat.length && msgs.some(x => x.uid !== uid && !lastChat.some(y => y.t === x.t && y.uid === x.uid))) beep('ping');
    lastChat = msgs; renderChat();
  }, () => {});
  renderRoom();
}
function closeRoom(silent){
  if (chatUnsub){ chatUnsub(); chatUnsub = null; }
  if (roomMap){ try { roomMap.stop(); } catch(e){} roomMap.remove(); roomMap = null; roomRoute = null; roomMe = null; }
  lastChat = []; openId = null;
  $('#room').hidden = true; $('#room').innerHTML = '';
  if (!silent){ renderMyBar(); renderList(); }
}
function renderRoom(){
  if (!openId) return;
  const it = findItem(openId);
  if (!it){ toast('המניין נסגר'); history.replaceState(null, '', location.pathname); closeRoom(); return; }
  const t = TYPES[it.type], st = statusOf(it), w = walkOf(it);
  $('#rTitle').textContent = `${t.i} ${t.n} · ${I.title(it)}`;
  const far = w.min > 600;
  $('#rRoute').innerHTML = far ? `<div class="walk"><b>${Math.round(w.km)}</b><small>ק"מ ממך</small></div>` :
    `<div class="walk${w.real ? '' : ' est'}"><b>${Math.max(1, Math.round(w.min))}</b><small>דק' הליכה${w.real ? ' לפי הדרך' : ' (הערכה)'}</small></div>
    <div class="walk"><b>${w.km < 1 ? Math.round(w.km * 1000) : w.km.toFixed(1)}</b><small>${w.km < 1 ? 'מטר' : 'ק"מ'}</small></div>
    <div class="walk"><b>${fmtT(Date.now() + w.min * MIN)}</b><small>תגיע בערך</small></div>`;
  $('#rInfo').innerHTML = `<div class="status">${st.t}</div>
    <div class="small">${dayLabel(it.kind === 'sched' ? it.dk : dkOf(it.startAt))} · ${fmtT(it.startAt)}${it.moved ? ' (שעה שונה מהרגיל)' : ''}${it.tz && it.tz !== TZ() ? ` · שעון ${esc(it.tz)}` : ''}</div>
    ${it.cancelled ? '' : I.full(it) ? `<div class="badge ok" style="font-size:16px">🎉 יש מניין! ${I.count(it)} אנשים</div>` : `<div class="small" style="margin-top:6px">חסרים עוד ${10 - I.count(it)} למניין</div>`}
    ${it.cancelled ? '' : bar(it, true)}
    <div class="small" style="margin-top:6px">${whoLine(it)}</div>
    <div class="small" style="margin-top:6px">📍 ${esc(it.place || '')}<br>📖 ${nusachName(it.nusach)} · ${it.kind === 'sched' ? '🕍 מניין קבוע' : '⚡ מניין שנפתח עכשיו'}${it.ownerName ? ' · ' + esc(it.ownerName) : ''}</div>
    ${arriveHint(it)}
    ${it.dayNote ? `<div class="note imp">📌 היום: ${esc(it.dayNote)}</div>` : ''}
    ${it.note ? `<div class="note imp">📌 ${esc(it.note)}</div>` : ''}`;
  const my = it.members && it.members[uid];
  const act = $('#rActions');
  if (it.cancelled || isPast(it)) act.innerHTML = '';
  else if (it.kind === 'live' && I.isOwner(it)) act.innerHTML = '';
  else if (!my) act.innerHTML = `<div class="row" style="margin-bottom:10px"><button class="btn pri" data-j="coming">🚶 אני מגיע!</button><button class="btn ok" data-j="here">🙋 אני כבר כאן</button></div>`;
  else act.innerHTML = `<div class="card" style="text-align:center"><b>${my.s === 'here' ? '🙋 סימנת שאתה במניין' : `🚶 סימנת שאתה מגיע${my.eta ? ` (~${fmtT(my.eta)})` : ''}`}</b>
      <div class="row" style="margin-top:10px">${my.s !== 'here' ? '<button class="btn ok" data-j="here">🙋 הגעתי</button>' : ''}<button class="btn bad" data-j="leave">ביטול ההגעה</button></div></div>`;
  $$('[data-j]', act).forEach(b => b.onclick = async () => { b.disabled = true; if (b.dataset.j === 'leave') await leave(it); else await join(it, b.dataset.j); });
  if (I.isOwner(it)) buildOwner(it); else { $('#rOwner').innerHTML = ''; ownerBuilt = null; }
  $('#rWeekly').innerHTML = it.kind === 'sched' ? `<div class="sect">🗓️ הזמנים הקבועים ב${esc(I.title(it))}</div><div class="card">${weeklySummary(it.syn)}</div>` : '';
  const mem = Object.entries(it.members || {}).sort((a, b) => (a[1].s === 'here' ? 0 : 1) - (b[1].s === 'here' ? 0 : 1) || a[1].t - b[1].t);
  $('#rMembers').innerHTML = (mem.map(([k, v]) => `<div class="member"><span>${v.s === 'here' ? '🙋' : '🚶'} ${esc(v.n || 'אורח')}${k === it.owner ? ' ⭐' : ''}${k === uid ? ' (אתה)' : ''}</span><small>${v.s === 'here' ? 'כאן' : v.eta ? `מגיע ~${fmtT(v.eta)}` : 'מגיע'}</small></div>`).join('')
    + (it.extra ? `<div class="member"><span>👤 עוד ${it.extra} בלי האפליקציה</span><small>לפי המארגן</small></div>` : '')) || '<div class="small">עוד אף אחד לא סימן שהוא מגיע. תהיה הראשון!</div>';
}
function whoLine(it){
  const mem = Object.values(it.members || {});
  const h = mem.filter(x => x.s === 'here').length, c = mem.length - h;
  return [h && `${h} כאן`, c && `${c} בדרך`, it.extra && `${it.extra} בלי אפליקציה`].filter(Boolean).join(' · ');
}
function weeklySummary(s){
  const lines = (s.slots || []).slice().sort((a, b) => Object.keys(TYPES).indexOf(a.type) - Object.keys(TYPES).indexOf(b.type)).map(sl => {
    const days = sl.days.length === 7 ? 'כל יום' : sl.days.slice().sort().map(d => DAYS[d] + "'").join(' ');
    const tm = sl.mode === 'rel' ? `${Math.abs(sl.offset || 0)} דק' ${(sl.offset || 0) < 0 ? 'לפני' : 'אחרי'} ${ZBASE[sl.base]}` : sl.time;
    const until = sl.weeks ? ` · עד ${addDays(sl.from, sl.weeks * 7 - 1).split('-').reverse().join('/')}` : '';
    return `<div class="zrow"><span>${TYPES[sl.type].i} ${TYPES[sl.type].n} · ${days}</span><b>${tm}${until}</b></div>`;
  });
  return lines.join('') || '<div class="small">אין זמנים קבועים</div>';
}
function buildOwner(it){
  const box = $('#rOwner');
  const key = it.id;
  if (ownerBuilt !== key){
    ownerBuilt = key;
    if (it.kind === 'live'){
      box.innerHTML = `<div class="card owner"><h3>⭐ ניהול המניין</h3><div class="small">רק אתה רואה את זה, כי פתחת את המניין.</div>
        <label class="lbl">כמה אנשים יש בפועל?</label>
        <div class="stepper"><button data-d="1">+</button><b id="oCount"></b><button data-d="-1">−</button></div>
        <div class="hint" id="oCountHint"></div>
        <label class="lbl">מתי מתחילים?</label>
        <div class="chips wrap">${[5, 10, 15, 20, 30].map(x => `<button data-in="${x}">בעוד ${x} דק'</button>`).join('')}<input type="time" id="oTime" style="width:auto;padding:6px 10px"></div>
        <div class="row" style="margin-top:8px"><button class="btn" data-st="now">▶️ מתחילים עכשיו</button><button class="btn ok" data-st="started">✅ התחילו</button></div>
        <label class="lbl">📌 הערה חשובה</label>
        <textarea id="oNote" maxlength="300" placeholder="למשל: קומה 2, הדלת השמאלית. צריך עוד 2 לקדיש."></textarea>
        <button class="btn sm" id="oSaveNote" style="margin-top:6px">💾 שמור הערה</button>
        <div class="row" style="margin-top:14px"><button class="btn bad" id="oClose">🗑️ סגור את המניין</button></div></div>`;
      $('#oNote').value = it.note || '';
      $$('[data-in]', box).forEach(b => b.onclick = () => ownerLive(openId, {status:'wait', startAt:Date.now() + b.dataset.in * MIN}));
      $('#oTime').onchange = e => { if (!e.target.value) return; let t = zoned(today(), e.target.value, TZ()); if (t < Date.now() - 30 * MIN) t += 24 * HOUR; ownerLive(openId, {status:'wait', startAt:t}); };
      $$('[data-st]', box).forEach(b => b.onclick = () => ownerLive(openId, {status:b.dataset.st, startAt:Date.now()}));
      $('#oSaveNote').onclick = () => { ownerLive(openId, {note:$('#oNote').value.trim().slice(0, 300)}); toast('✔️ נשמר'); };
      $('#oClose').onclick = () => confirmBox('לסגור את המניין?', 'המניין יימחק ואנשים לא יראו אותו יותר.', 'סגור', async () => { try { await db.F.deleteDoc(db.ref('minyanim', openId)); } catch(e){ toast('⚠️ ' + e.code); } });
    } else {
      box.innerHTML = `<div class="card owner"><h3>⭐ ניהול: ${TYPES[it.type].n} ${dayLabel(it.dk)}</h3><div class="small">השינויים כאן הם רק ליום הזה. בשביל כל השבוע: "עריכת בית הכנסת".</div>
        <label class="lbl">כמה אנשים יש בפועל?</label>
        <div class="stepper"><button data-d="1">+</button><b id="oCount"></b><button data-d="-1">−</button></div>
        <div class="hint" id="oCountHint"></div>
        <label class="lbl">שינוי שעה ליום הזה</label>
        <div class="row"><input type="time" id="oTime"><button class="btn" id="oTimeSave">שמור שעה</button></div>
        <label class="lbl">📌 הערה ליום הזה</label>
        <textarea id="oNote" maxlength="200" placeholder="למשל: היום בעזרת נשים בגלל שיפוץ"></textarea>
        <button class="btn sm" id="oSaveNote" style="margin-top:6px">💾 שמור הערה</button>
        <div class="row" style="margin-top:14px"><button class="btn bad" id="oCancel"></button><button class="btn" id="oEdit">✏️ עריכת בית הכנסת</button></div></div>`;
      $('#oTime').value = hmOf(it.startAt, it.tz || TZ());
      $('#oNote').value = it.dayNote || '';
      const exNow = () => { const c = findItem(openId); return {...((c.syn.ex || {})[exKey(c.dk, c.slot.id)] || {})}; };
      const put = ex => { Object.keys(ex).forEach(k => ex[k] === '' || ex[k] == null || ex[k] === false ? delete ex[k] : 0); return synEx(findItem(openId), Object.keys(ex).length ? ex : null); };
      $('#oTimeSave').onclick = () => { const ex = exNow(); ex.time = $('#oTime').value; put(ex); toast('✔️ השעה של היום עודכנה'); };
      $('#oSaveNote').onclick = () => { const ex = exNow(); ex.note = $('#oNote').value.trim().slice(0, 200); put(ex); toast('✔️ נשמר'); };
      $('#oCancel').onclick = () => { const c = findItem(openId), ex = exNow(); if (c.cancelled){ delete ex.cancel; put(ex); } else confirmBox(`לבטל את ${TYPES[c.type].n} ב${dayLabel(c.dk)}?`, 'מי שנרשם יקבל הודעה. אפשר להחזיר אחר כך.', 'בטל', () => { ex.cancel = true; put(ex); }); };
      $('#oEdit').onclick = () => openSynEditor(findItem(openId).syn.id);
    }
    let pending = null, timer = null;
    $$('[data-d]', box).forEach(b => b.onclick = () => {
      const c = findItem(openId); if (!c) return;
      const minN = Object.keys(c.members || {}).length;
      const n = Math.max(minN, (pending ?? I.count(c)) + +b.dataset.d);
      pending = n; $('#oCount').textContent = n;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const c2 = findItem(openId); pending = null; if (!c2) return;
        const extra = Math.max(0, n - Object.keys(c2.members || {}).length);
        if (c2.kind === 'live') ownerLive(openId, {extra}); else occExtra(c2, extra);
      }, 700);
    });
    box._pending = () => pending;
  }
  if (box._pending && box._pending() == null) $('#oCount').textContent = I.count(it);
  $('#oCountHint').textContent = `באפליקציה: ${Object.keys(it.members || {}).length}${it.extra ? ` · עוד ${it.extra} בלי אפליקציה` : ''}. אם מישהו שספרת נרשם אחר כך באפליקציה, תוריד אחד.`;
  const cb = $('#oCancel'); if (cb) cb.textContent = it.cancelled ? '↩️ להחזיר את התפילה' : '❌ לבטל ביום הזה';
}
function renderChat(){
  const el = $('#rChat'); if (!el) return;
  if (!lastChat.length){ el.innerHTML = '<div class="small">אין הודעות עדיין</div>'; return; }
  el.innerHTML = lastChat.map(x => `<div class="msg${x.uid === uid ? ' mine' : ''}"><small>${esc(x.n)} · ${fmtT(x.t)}</small>${esc(x.text)}</div>`).join('');
  el.scrollTop = el.scrollHeight;
}
async function sendChat(){
  const inp = $('#rChatIn'), text = inp.value.trim();
  if (!text || !openId) return;
  if (!S.name) await askName();
  inp.value = '';
  const it = findItem(openId); if (!it) return;
  const col = it.kind === 'live' ? db.col('minyanim', it.id, 'chat') : db.col('occ', it.id, 'chat');
  try { await db.F.addDoc(col, {uid, n:S.name || 'אורח', text:text.slice(0, 200), t:Date.now()}); }
  catch(e){ toast('⚠️ ההודעה לא נשלחה'); inp.value = text; }
}
async function share(it){
  if (!it) return;
  const url = location.origin + location.pathname + (it.kind === 'live' ? '?m=' : '?o=') + encodeURIComponent(it.id);
  const st = statusOf(it);
  const text = `${TYPES[it.type].i} ${TYPES[it.type].n} · ${I.title(it)}\n${dayLabel(it.kind === 'sched' ? it.dk : dkOf(it.startAt))} ${fmtT(it.startAt)} · ${I.count(it)}/10 ${I.full(it) ? '✅ יש מניין' : `· חסרים ${10 - I.count(it)}`}\n${st.t}\nמוצא המניין: ${url}`;
  if (navigator.share){ try { await navigator.share({title:'מוצא המניין', text}); return; } catch(e){ if (e.name === 'AbortError') return; } }
  window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
}
function remindMenu(it){
  if (!it) return;
  const w = walkOf(it), leaveAt = it.startAt - (Math.ceil(w.min) + 3) * MIN;
  $('#modalBox').innerHTML = `<h3>⏰ תזכורת</h3><p class="small">נצלצל ונשלח הודעה בזמן שתבחר. (זה עובד כשהאפליקציה פתוחה או ברקע.)</p>
    <div style="display:flex;flex-direction:column;gap:8px">
      <button class="btn pri" data-r="leave">🚶 כשצריך לצאת (${fmtT(leaveAt)})</button>
      ${[5, 10, 15, 30].map(m => `<button class="btn" data-r="${m}">${m} דק' לפני (${fmtT(it.startAt - m * MIN)})</button>`).join('')}
      <button class="btn" id="mNo">ביטול</button></div>`;
  $('#modal').hidden = false;
  $('#mNo').onclick = () => $('#modal').hidden = true;
  $$('[data-r]', $('#modalBox')).forEach(b => b.onclick = () => { $('#modal').hidden = true; addReminder(it, b.dataset.r === 'leave' ? 'leave' : +b.dataset.r); });
}
function autoArrive(){
  if (S.place || !gps.real) return;
  for (const it of myItems()){
    const my = it.members[uid];
    if (my && my.s === 'coming' && distM(gps, it) < 40 + Math.min(gps.acc || 0, 60) && Math.abs(it.startAt - Date.now()) < 90 * MIN){
      join(it, 'here'); toast(`🙋 הגעת! סימנתי שאתה ב${esc(I.title(it))}`);
    }
  }
}

/* ================= IN-APP NAVIGATION (כמו Waze / גוגל מפות) ================= */
let nav = null;
function stepText(s){
  const name = s.name ? ` ל${s.name}` : '';
  const side = {left:'שמאלה', right:'ימינה', 'slight left':'קלות שמאלה', 'slight right':'קלות ימינה', 'sharp left':'חדות שמאלה', 'sharp right':'חדות ימינה', uturn:'אחורה', straight:'ישר'}[s.mod] || '';
  const arrow = {left:'⬅️', right:'➡️', 'slight left':'↖️', 'slight right':'↗️', 'sharp left':'⬅️', 'sharp right':'➡️', uturn:'↩️', straight:'⬆️'}[s.mod] || '⬆️';
  if (s.type === 'depart') return {a:'⬆️', t:`צא${name}`};
  if (s.type === 'arrive') return {a:'🏁', t:'הגעת למניין!'};
  if (s.type === 'roundabout' || s.type === 'rotary') return {a:'🔄', t:`בכיכר צא ביציאה ה-${s.exit || 1}${name}`};
  if (s.mod === 'straight' || s.type === 'new name' || s.type === 'continue') return {a:'⬆️', t:`המשך ישר${name}`};
  if (s.mod === 'uturn') return {a:'↩️', t:'הסתובב'};
  return {a:arrow, t:`פנה ${side}${name}`};
}
function say(text){
  if (!S.voice || !('speechSynthesis' in window)) return;
  try { const u = new SpeechSynthesisUtterance(text); u.lang = 'he-IL'; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch(e){}
}
async function startNav(it){
  if (!it) return;
  if (S.place){ toast('📍 בחרת מקום ידני. כדי לנווט, חזור ל"המיקום שלי".'); return; }
  if (!gps.real){ toast('📍 צריך גישה למיקום כדי לנווט'); return; }
  const el = $('#nav');
  el.hidden = false; $('#mybar').hidden = true;
  history.pushState({nav:1}, '', location.href);
  el.innerHTML = `<div id="navmap" dir="ltr"></div>
    <div class="navtop"><div class="arrow" id="nArrow">⬆️</div><div><div class="dist" id="nDist">…</div><div class="txt" id="nTxt">מחשב מסלול…</div></div></div>
    <div class="navside"><button id="nCenter" title="מרכז">◎</button><button id="nVoice" title="קול">${S.voice ? '🔊' : '🔇'}</button></div>
    <div class="navbot"><div class="big"><div><b id="nMin">-</b><small>דקות</small></div><div><b id="nKm">-</b><small>מרחק</small></div><div><b id="nEta">-</b><small>הגעה</small></div></div>
      <div class="small" id="nVs" style="text-align:center;margin-top:6px"></div>
      <div class="row" style="margin-top:10px"><button class="btn bad" id="nStop">✖ סיום ניווט</button></div></div>`;
  const map = L.map('navmap', {zoomControl:false, fadeAnimation:false}).setView([gps.lat, gps.lng], 18);
  tiles().addTo(map);
  L.marker([it.lat, it.lng], {icon:pinIcon(it)}).addTo(map);
  const me = L.marker([gps.lat, gps.lng], {icon:L.divIcon({className:'', html:'<div class="navarrow"></div>', iconSize:[26, 26], iconAnchor:[13, 13]})}).addTo(map);
  nav = {it, map, me, line:null, route:null, stepIdx:1, follow:true, spoken:{}, lastReroute:0, wake:null};
  map.on('dragstart', () => nav && (nav.follow = false));
  $('#nCenter').onclick = () => { nav.follow = true; navTick(); };
  $('#nVoice').onclick = e => { S.voice = !S.voice; save(); e.target.textContent = S.voice ? '🔊' : '🔇'; };
  $('#nStop').onclick = () => history.back();
  try { if (navigator.wakeLock) nav.wake = await navigator.wakeLock.request('screen'); } catch(e){}
  await navRoute(true);
  if (nav && nav.route) say(`מתחילים ניווט. ${Math.max(1, Math.round(nav.route.min))} דקות הליכה.`);
}
async function navRoute(force){
  if (!nav) return;
  const r = await fetchRoute(nav.it, gps, force);
  if (!nav || !r) { if (nav) $('#nTxt').textContent = 'לא הצלחתי לחשב מסלול. אפשר לנווט עם Google Maps או Waze.'; return; }
  nav.route = r; nav.stepIdx = 1; nav.spoken = {};
  if (nav.line) nav.line.remove();
  nav.line = L.polyline(r.geo, {color:'#2f80ff', weight:8, opacity:.9}).addTo(nav.map);
  navTick();
}
function distToLine(p, geo){
  let best = Infinity;
  for (let i = 0; i < geo.length; i += 1) best = Math.min(best, distM(p, {lat:geo[i][0], lng:geo[i][1]}));
  return best;
}
function navTick(){
  if (!nav || !nav.route) return;
  const r = nav.route, p = {lat:gps.lat, lng:gps.lng};
  nav.me.setLatLng([p.lat, p.lng]);
  if (nav.follow) nav.map.setView([p.lat, p.lng], Math.max(nav.map.getZoom(), 17), {animate:true});
  const toDest = distM(p, nav.it);
  if (toDest < 30){
    $('#nArrow').textContent = '🏁'; $('#nDist').textContent = 'הגעת!'; $('#nTxt').textContent = I.title(nav.it);
    if (!nav.spoken.arrive){ nav.spoken.arrive = 1; say('הגעת למניין'); beep('happy'); if (I.isIn(nav.it)) join(nav.it, 'here'); }
    return;
  }
  // יציאה מהמסלול: מחשבים מחדש
  if (distToLine(p, r.geo) > 45 && Date.now() - nav.lastReroute > 15000){ nav.lastReroute = Date.now(); $('#nTxt').textContent = 'מחשב מסלול מחדש…'; say('מחשב מסלול מחדש'); navRoute(true); return; }
  // השלב הבא: הקרוב ביותר שעוד לא עברנו
  while (nav.stepIdx < r.steps.length - 1 && distM(p, r.steps[nav.stepIdx].loc) < 15) nav.stepIdx++;
  const s = r.steps[nav.stepIdx] || r.steps[r.steps.length - 1];
  const d = distM(p, s.loc), st = stepText(s);
  $('#nArrow').textContent = st.a;
  $('#nDist').textContent = d < 1000 ? `${Math.round(d / 5) * 5} מ'` : `${(d / 1000).toFixed(1)} ק"מ`;
  $('#nTxt').textContent = st.t;
  if (d < 40 && !nav.spoken[nav.stepIdx]){ nav.spoken[nav.stepIdx] = 1; say(st.t); }
  const remain = Math.min(r.km * 1000, toDest * 1.3), min = remain / WALK_M_PER_MIN;
  $('#nMin').textContent = Math.max(1, Math.round(min));
  $('#nKm').textContent = remain < 1000 ? Math.round(remain) + " מ'" : (remain / 1000).toFixed(1) + ' ק"מ';
  const eta = Date.now() + min * MIN;
  $('#nEta').textContent = fmtT(eta);
  const diff = Math.round((nav.it.startAt - eta) / MIN);
  $('#nVs').innerHTML = nav.it.cancelled ? '❌ התפילה בוטלה היום' : diff > 180 ? `התפילה: ${dayLabel(nav.it.kind === 'sched' ? nav.it.dk : dkOf(nav.it.startAt))} ${fmtT(nav.it.startAt)}` : diff >= 0 ? `✅ תגיע ${diff} דק' לפני ${fmtT(nav.it.startAt)}` : `🏃 תגיע ${-diff} דק' אחרי ההתחלה (${fmtT(nav.it.startAt)})`;
}
function stopNav(){
  if (!nav) return;
  try { nav.wake && nav.wake.release(); } catch(e){}
  try { speechSynthesis.cancel(); } catch(e){}
  try { nav.map.stop(); } catch(e){}
  nav.map.remove(); nav = null;
  $('#nav').hidden = true; $('#nav').innerHTML = '';
  renderMyBar();
}

/* ================= CREATE (מניין חד-פעמי) ================= */
let pickMap = null;
function mapPicker(elId, start, onMove){
  const m = L.map(elId, {zoomControl:true, zoomAnimation:false, fadeAnimation:false, markerZoomAnimation:false}).setView([start.lat, start.lng], 17);
  tiles().addTo(m);
  const h = here();
  L.marker([h.lat, h.lng], {icon:meIcon(), interactive:false}).addTo(m);
  setTimeout(() => { try { m.invalidateSize(); } catch(e){} }, 80);
  let revTimer = null, gone = false;
  m.on('unload', () => { gone = true; clearTimeout(revTimer); });
  m.on('moveend', () => {
    clearTimeout(revTimer);
    revTimer = setTimeout(async () => {
      if (gone) return;
      const c = m.getCenter();
      try {
        const j = await (await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${c.lat}&lon=${c.lng}&zoom=18&accept-language=he`)).json();
        const a = j.address || {};
        const street = [a.road, a.house_number].filter(Boolean).join(' ');
        const city = a.city || a.town || a.village || '';
        const txt = [j.name, street, city].filter(Boolean).filter((x, i, arr) => arr.indexOf(x) === i).join(', ');
        onMove(c, txt);
      } catch(e){ onMove(c, ''); }
    }, 600);
  });
  m.fire('moveend');
  return m;
}
function openCreate(){
  $('#modalBox').innerHTML = `<h3>➕ מה רוצים לפתוח?</h3>
    <div style="display:flex;flex-direction:column;gap:10px;margin-top:10px">
      <button class="btn pri" id="cLive" style="justify-content:flex-start;text-align:right;padding:14px">⚡ מניין עכשיו או בקרוב<br><small style="font-weight:400">מחפשים עשרה לתפילה אחת: אנשים בסביבה יקבלו הודעה</small></button>
      <button class="btn" id="cSyn" style="justify-content:flex-start;text-align:right;padding:14px">🕍 בית כנסת / מניין קבוע<br><small style="font-weight:400">זמנים קבועים לפי ימים בשבוע, לכמה שבועות או לתמיד</small></button>
      <button class="btn" id="mNo">ביטול</button></div>`;
  $('#modal').hidden = false;
  $('#mNo').onclick = () => $('#modal').hidden = true;
  $('#cLive').onclick = () => { $('#modal').hidden = true; openLiveEditor(); };
  $('#cSyn').onclick = () => { $('#modal').hidden = true; openSynEditor(null); };
}
function editorShell(title){
  const el = $('#editor');
  el.hidden = false; $('#mybar').hidden = true;
  history.pushState({editor:1}, '', location.pathname + location.search);
  el.innerHTML = `<div class="inner"><div class="phead"><button class="back" id="eBack">→</button><h2>${title}</h2></div><div id="eBody"></div></div>`;
  $('#eBack').onclick = () => history.back();
  return $('#eBody');
}
function closeEditor(){
  if (pickMap){ try { pickMap.stop(); } catch(e){} pickMap.remove(); pickMap = null; }
  $('#editor').hidden = true; $('#editor').innerHTML = '';
  renderMyBar();
}
const nusachSelect = id => `<select id="${id}">${Object.entries(NUSACH).map(([k, v]) => `<option value="${k}">${k === 'none' ? 'לא לציין' : v}</option>`).join('')}</select>`;
function openLiveEditor(){
  const b = editorShell('⚡ פתיחת מניין');
  let ctype = S.q.type, startIn = 0, startAt = null, count = 1, dayK = today();
  b.innerHTML = `
    <nav class="seg" id="cType">${Object.entries(TYPES).map(([k, v]) => `<button data-t="${k}">${v.i} ${v.n}</button>`).join('')}</nav>
    <label class="lbl">🏷️ שם למניין <small>(לא חובה, אבל כדאי: ככה יהיה קל למצוא אותו)</small></label>
    <input type="text" id="cName" maxlength="60" placeholder="למשל: מנחה בלובי בניין 5 / בית הכנסת אוהל משה">
    <label class="lbl">📍 איפה? <small>הזז את המפה כך שהסיכה תהיה בדיוק על המקום</small></label>
    <div class="pickmap"><div id="pmap" style="height:100%" dir="ltr"></div><div class="center">📍</div><button class="mylocbtn" id="cMyLoc">◎ המיקום שלי</button></div>
    <input type="text" id="cPlace" maxlength="120" placeholder="כתובת / תיאור המקום" style="margin-top:8px">
    <label class="lbl">📅 מתי?</label>
    <div class="chips" id="cDay"><button data-d="0" class="on">היום</button><button data-d="1">מחר</button><input type="date" id="cDate" min="${today()}"></div>
    <div class="chips wrap" id="cStart" style="margin-top:6px"><button data-s="0" class="on">עכשיו</button>${[5, 10, 15, 20, 30, 45, 60].map(x => `<button data-s="${x}">בעוד ${x} דק'</button>`).join('')}<input type="time" id="cTime" style="width:auto;padding:6px 10px"></div>
    <label class="lbl">👥 כמה אנשים כבר יש? (כולל אותך)</label>
    <div class="stepper"><button data-cd="1">+</button><b id="cCount">1</b><button data-cd="-1">−</button></div>
    <label class="lbl">📖 נוסח <small>(לא חובה)</small></label>${nusachSelect('cNusach')}
    <label class="lbl">📌 הערה חשובה <small>(לא חובה)</small></label>
    <textarea id="cNote" maxlength="300" placeholder="למשל: בחניה מאחורי הבניין. יש ספר תורה."></textarea>
    <label class="lbl">🙂 השם שלך</label><input type="text" id="cOwner" maxlength="30" placeholder="איך יראו אותך ברשימה">
    <div class="hint" id="cZman"></div>
    <button class="btn pri block" id="cGo" style="margin-top:16px;font-size:18px;padding:16px">🕍 פתח את המניין</button>`;
  $('#cOwner').value = S.name;
  const setType = t => { ctype = t; $$('#cType button').forEach(x => x.classList.toggle('on', x.dataset.t === t)); $('#cZman').textContent = '🕰️ ' + zmanHint(t, zmanimFor(dayK, here())); };
  setType(ctype);
  $$('#cType button').forEach(x => x.onclick = () => setType(x.dataset.t));
  const setDayC = d => { dayK = d; $$('#cDay button').forEach(x => x.classList.toggle('on', addDays(today(), +x.dataset.d) === d)); if (d !== today() && startIn != null){ startIn = null; $$('#cStart button').forEach(x => x.classList.remove('on')); } setType(ctype); };
  $$('#cDay button').forEach(x => x.onclick = () => { $('#cDate').value = ''; setDayC(addDays(today(), +x.dataset.d)); });
  $('#cDate').onchange = e => { if (e.target.value) setDayC(e.target.value); };
  $$('#cStart [data-s]').forEach(x => x.onclick = () => { startIn = +x.dataset.s; $('#cTime').value = ''; setDayC(today()); $$('#cStart button').forEach(y => y.classList.toggle('on', y === x)); });
  $('#cTime').onchange = e => { if (!e.target.value) return; startAt = e.target.value; startIn = null; $$('#cStart button').forEach(y => y.classList.remove('on')); };
  $$('[data-cd]').forEach(x => x.onclick = () => { count = Math.min(30, Math.max(1, count + +x.dataset.cd)); $('#cCount').textContent = count; });
  let auto = '';
  const h = here();
  pickMap = mapPicker('pmap', h, (c, txt) => { auto = txt; if (txt) $('#cPlace').placeholder = txt; });
  $('#cMyLoc').onclick = () => { const p = here(); pickMap.setView([p.lat, p.lng], 18); };
  $('#cGo').onclick = async () => {
    const owner = $('#cOwner').value.trim();
    if (!owner){ $('#cOwner').focus(); toast('כתוב את השם שלך, כדי שאנשים יידעו מי פתח'); return; }
    if (startIn == null && !startAt){ toast('בחר שעה'); $('#cTime').focus(); return; }
    S.name = owner; save();
    const c = pickMap.getCenter();
    const sa = startIn != null ? Date.now() + startIn * MIN : zoned(dayK, startAt, TZ());
    if (sa < Date.now() - 15 * MIN){ toast('השעה הזאת כבר עברה'); return; }
    const btn = $('#cGo'); btn.disabled = true; btn.innerHTML = '<span class="spin">🔄</span> פותח…';
    try {
      if (!db) throw new Error('אין חיבור לשרת');
      const id = await createLive({type:ctype, name:$('#cName').value.trim(), lat:c.lat, lng:c.lng, place:$('#cPlace').value.trim() || auto || 'מניין',
        note:$('#cNote').value.trim(), nusach:$('#cNusach').value, startAt:sa, count});
      S.q.type = ctype; S.q.day = dkOf(sa) === today() ? null : dkOf(sa); save(); subOcc(); renderSearchPanel();
      closeEditor(); history.replaceState(null, '', location.pathname);
      const t0 = Date.now();
      const tryOpen = () => { if (live.has(id)) openRoom(id); else if (Date.now() - t0 < 8000) setTimeout(tryOpen, 150); };
      tryOpen();
      toast('🕍 המניין נפתח! כדאי לשתף גם בווטסאפ 📤', null, true);
      askNotif();
    } catch(e){
      btn.disabled = false; btn.textContent = '🕍 פתח את המניין';
      toast('⚠️ לא הצלחתי לפתוח: ' + (e.code === 'permission-denied' ? 'השרת עוד לא מוכן (כללי Firebase)' : (e.code || e.message)));
    }
  };
}

/* ================= SYNAGOGUE EDITOR (זמנים קבועים) ================= */
const rid = () => Math.random().toString(36).slice(2, 8);
async function tzFor(lat, lng){
  try {
    const j = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}&timezone=auto&forecast_days=1`)).json();
    if (j.timezone) return j.timezone;
  } catch(e){}
  return S.place && distM(S.place, {lat, lng}) < 300000 ? S.place.tz : DEV_TZ;
}
function openSynEditor(id){
  const s0 = id ? syns.get(id) : null;
  if (id && (!s0 || s0.owner !== uid)){ toast('רק מי שהוסיף את בית הכנסת יכול לערוך אותו'); return; }
  if (openId) { closeRoom(true); }
  const b = editorShell(s0 ? '✏️ עריכת בית הכנסת' : '🕍 בית כנסת / מניין קבוע');
  const s = s0 ? JSON.parse(JSON.stringify(s0)) : {name:'', place:'', nusach:'none', note:'', slots:[], ex:{}};
  b.innerHTML = `
    <label class="lbl" style="margin-top:0">🏷️ שם <small>(לא חובה, אבל מאוד כדאי: ככה מחפשים אתכם)</small></label>
    <input type="text" id="sName" maxlength="60" placeholder="למשל: בית הכנסת אוהל יצחק">
    <label class="lbl">📍 איפה? <small>הזז את המפה כך שהסיכה תהיה בדיוק על בית הכנסת</small></label>
    <div class="pickmap"><div id="pmap" style="height:100%" dir="ltr"></div><div class="center">📍</div><button class="mylocbtn" id="sMyLoc">◎ המיקום שלי</button></div>
    <input type="text" id="sPlace" maxlength="120" placeholder="כתובת" style="margin-top:8px">
    <label class="lbl">📖 נוסח <small>(לא חובה)</small></label>${nusachSelect('sNus')}
    <label class="lbl">📌 הערה חשובה <small>(לא חובה)</small></label>
    <textarea id="sNote" maxlength="300" placeholder="למשל: הכניסה מהחצר. יש עזרת נשים."></textarea>
    <label class="lbl">🗓️ זמני התפילות</label>
    <div id="slots"></div>
    <button class="btn block" id="addSlot">➕ הוספת תפילה קבועה</button>
    <div id="upcoming"></div>
    <label class="lbl">🙂 השם שלך (המארגן)</label><input type="text" id="sOwner" maxlength="30">
    <button class="btn pri block" id="sSave" style="margin-top:16px;font-size:18px;padding:16px">💾 שמור</button>
    ${s0 ? '<button class="btn bad block" id="sDel" style="margin-top:10px">🗑️ מחיקת בית הכנסת</button>' : ''}
    <p class="hint">💡 כדי שלא תאבד את הניהול אם תחליף טלפון, כדאי להתחבר עם Google בהגדרות.</p>`;
  $('#sName').value = s.name || ''; $('#sPlace').value = s.place || ''; $('#sNus').value = s.nusach || 'none'; $('#sNote').value = s.note || ''; $('#sOwner').value = S.name;
  let auto = '';
  pickMap = mapPicker('pmap', s0 ? s0 : here(), (c, txt) => { auto = txt; if (txt) $('#sPlace').placeholder = txt; });
  $('#sMyLoc').onclick = () => { const p = here(); pickMap.setView([p.lat, p.lng], 18); };
  const drawSlots = () => {
    $('#slots').innerHTML = s.slots.map((sl, i) => `<div class="slot" data-i="${i}">
      <div class="top"><span>${TYPES[sl.type].i} תפילה ${i + 1}</span><button class="btn sm bad" data-del="${i}">הסר</button></div>
      <div class="seg" style="margin-top:8px">${Object.entries(TYPES).map(([k, v]) => `<button data-ty="${k}" class="${sl.type === k ? 'on' : ''}">${v.n}</button>`).join('')}</div>
      <div class="plabel" style="margin-top:8px">ימים</div>
      <div class="days">${DAYS.map((d, j) => `<button data-day="${j}" class="${sl.days.includes(j) ? 'on' : ''}">${d}'</button>`).join('')}</div>
      <div class="chips" style="margin-top:6px"><button data-preset="weekdays">א'-ה'</button><button data-preset="sunfri">א'-ו'</button><button data-preset="all">כל יום</button><button data-preset="shabbat">שבת</button></div>
      <div class="plabel" style="margin-top:8px">שעה</div>
      <div class="chips"><button data-mode="fixed" class="${sl.mode !== 'rel' ? 'on' : ''}">שעה קבועה</button><button data-mode="rel" class="${sl.mode === 'rel' ? 'on' : ''}">לפי זמני היום (למשל לפני השקיעה)</button></div>
      ${sl.mode === 'rel' ? `<div class="row" style="margin-top:6px"><input type="number" data-f="offAbs" min="0" max="240" value="${Math.abs(sl.offset || 0)}"><select data-f="dir"><option value="-1" ${(sl.offset || 0) < 0 ? 'selected' : ''}>דק' לפני</option><option value="1" ${(sl.offset || 0) >= 0 ? 'selected' : ''}>דק' אחרי</option></select><select data-f="base">${Object.entries(ZBASE).map(([k, v]) => `<option value="${k}" ${sl.base === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <label class="toggle"><span>לעגל ל-5 דקות (למשל 16:42 → 16:40)</span><input type="checkbox" data-f="round5" ${sl.round5 ? 'checked' : ''}></label>`
      : `<input type="time" data-f="time" value="${sl.time || ''}" style="margin-top:6px">`}
      <div class="plabel" style="margin-top:8px">לכמה זמן?</div>
      <div class="row"><div><div class="small">מתאריך</div><input type="date" data-f="from" value="${sl.from}"></div>
        <div><div class="small">מספר שבועות</div><input type="number" data-f="weeks" min="1" max="520" value="${sl.weeks || ''}" placeholder="תמיד" ${sl.weeks ? '' : 'disabled'}></div></div>
      <label class="toggle"><span>♾️ תמיד (בלי תאריך סיום)</span><input type="checkbox" data-f="forever" ${sl.weeks ? '' : 'checked'}></label>
    </div>`).join('') || '<div class="small" style="margin-bottom:8px">עוד אין תפילות. לחץ "הוספת תפילה קבועה".</div>';
    $$('#slots .slot').forEach(box => {
      const sl = s.slots[+box.dataset.i];
      $$('[data-ty]', box).forEach(x => x.onclick = () => { sl.type = x.dataset.ty; drawSlots(); });
      $$('[data-day]', box).forEach(x => x.onclick = () => { const d = +x.dataset.day; sl.days = sl.days.includes(d) ? sl.days.filter(y => y !== d) : sl.days.concat(d); drawSlots(); });
      $$('[data-preset]', box).forEach(x => x.onclick = () => { sl.days = {weekdays:[0, 1, 2, 3, 4], sunfri:[0, 1, 2, 3, 4, 5], all:[0, 1, 2, 3, 4, 5, 6], shabbat:[6]}[x.dataset.preset]; drawSlots(); });
      $$('[data-mode]', box).forEach(x => x.onclick = () => { sl.mode = x.dataset.mode; if (sl.mode === 'rel' && !sl.base){ sl.base = sl.type === 'shacharit' ? 'sunrise' : sl.type === 'mincha' ? 'sunset' : 'tzeit'; sl.offset = sl.type === 'mincha' ? -20 : 0; sl.round5 = true; } drawSlots(); });
      $$('[data-f]', box).forEach(x => x.onchange = () => {
        const f = x.dataset.f;
        if (f === 'time') sl.time = x.value;
        if (f === 'from') sl.from = x.value || today();
        if (f === 'weeks') sl.weeks = Math.max(1, +x.value || 1);
        if (f === 'forever'){ sl.weeks = x.checked ? 0 : 4; drawSlots(); }
        if (f === 'base') sl.base = x.value;
        if (f === 'round5') sl.round5 = x.checked;
        if (f === 'offAbs' || f === 'dir'){ const abs = +$('[data-f=offAbs]', box).value || 0, dir = +$('[data-f=dir]', box).value; sl.offset = abs * dir; }
        drawUpcoming();
      });
      $('[data-del]', box).onclick = () => { s.slots.splice(+box.dataset.i, 1); drawSlots(); };
    });
    drawUpcoming();
  };
  const drawUpcoming = () => {
    if (!s0){ $('#upcoming').innerHTML = ''; return; }
    const live0 = syns.get(id) || s0;
    const rows = [];
    for (let i = 0; i < 21 && rows.length < 40; i++){
      const dk = addDays(today(), i);
      for (const sl of (live0.slots || [])) if (occursOn(sl, dk)){
        const it = schedItem(live0, sl, dk);
        if (it.startAt != null) rows.push(it);
      }
    }
    rows.sort((a, b) => a.startAt - b.startAt);
    $('#upcoming').innerHTML = `<label class="lbl">📆 התפילות הקרובות <small>(ביטול או שינוי שעה ליום אחד)</small></label><div class="card" style="padding:6px 10px">${rows.map(it => `
      <div class="occ${it.cancelled ? ' cancel' : ''}"><span>${dayLabel(it.dk)} · ${TYPES[it.type].n} · <b>${fmtT(it.startAt, live0.tz)}</b>${it.moved ? ' ⚠️' : ''}</span>
      <span style="display:flex;gap:4px"><button class="btn sm" data-otime="${esc(it.id)}">🕓</button><button class="btn sm ${it.cancelled ? '' : 'bad'}" data-ocancel="${esc(it.id)}">${it.cancelled ? '↩️ החזר' : '❌ בטל'}</button></span></div>`).join('') || '<div class="small">אין תפילות בשלושת השבועות הקרובים. (שמרת?)</div>'}</div>`;
    $$('[data-ocancel]').forEach(x => x.onclick = async () => {
      const it = findItem(x.dataset.ocancel); const ex = {...((it.syn.ex || {})[exKey(it.dk, it.slot.id)] || {})};
      if (it.cancelled) delete ex.cancel; else ex.cancel = true;
      await synEx(it, Object.keys(ex).length ? ex : null);
    });
    $$('[data-otime]').forEach(x => x.onclick = () => {
      const it = findItem(x.dataset.otime);
      $('#modalBox').innerHTML = `<h3>🕓 שעה אחרת ל${TYPES[it.type].n} ב${dayLabel(it.dk)}</h3><input type="time" id="mT" value="${hmOf(it.startAt, it.tz || TZ())}">
        <div class="row" style="margin-top:10px"><button class="btn" id="mNo">ביטול</button><button class="btn" id="mReset">שעה רגילה</button><button class="btn pri" id="mOk">שמור</button></div>`;
      $('#modal').hidden = false;
      const exNow = () => ({...((it.syn.ex || {})[exKey(it.dk, it.slot.id)] || {})});
      $('#mNo').onclick = () => $('#modal').hidden = true;
      $('#mReset').onclick = async () => { $('#modal').hidden = true; const ex = exNow(); delete ex.time; await synEx(it, Object.keys(ex).length ? ex : null); };
      $('#mOk').onclick = async () => { $('#modal').hidden = true; const ex = exNow(); ex.time = $('#mT').value; await synEx(it, ex); };
    });
  };
  synEditorRefresh = () => { if (s0) drawUpcoming(); };
  $('#addSlot').onclick = () => { s.slots.push({id:rid(), type:S.q.type, days:[0, 1, 2, 3, 4], mode:'fixed', time:'', from:today(), weeks:0}); drawSlots(); };
  drawSlots();
  $('#sSave').onclick = async () => {
    const owner = $('#sOwner').value.trim();
    if (!owner){ toast('כתוב את השם שלך'); $('#sOwner').focus(); return; }
    for (const sl of s.slots){
      if (!sl.days.length){ toast(`ב${TYPES[sl.type].n}: בחר לפחות יום אחד`); return; }
      if (sl.mode !== 'rel' && !sl.time){ toast(`ב${TYPES[sl.type].n}: בחר שעה`); return; }
    }
    if (!s.slots.length && !confirm('לא הוספת אף תפילה. לשמור בכל זאת?')) return;
    S.name = owner; save();
    const c = pickMap.getCenter();
    const btn = $('#sSave'); btn.disabled = true; btn.innerHTML = '<span class="spin">🔄</span> שומר…';
    const moved = !s0 || distM(s0, {lat:c.lat, lng:c.lng}) > 50;
    const doc = {name:$('#sName').value.trim().slice(0, 60), place:$('#sPlace').value.trim() || auto || '', lat:c.lat, lng:c.lng,
      tz:moved ? await tzFor(c.lat, c.lng) : (s0.tz || TZ()), nusach:$('#sNus').value, note:$('#sNote').value.trim().slice(0, 300),
      slots:s.slots.map(x => ({id:x.id, type:x.type, days:x.days.slice().sort(), mode:x.mode || 'fixed', time:x.time || '', base:x.base || '', offset:x.offset || 0, round5:!!x.round5, from:x.from || today(), weeks:x.weeks || 0})),
      owner:uid, ownerName:owner, updated:Date.now()};
    try {
      if (s0) await db.F.updateDoc(db.ref('synagogues', id), doc);
      else { doc.created = Date.now(); doc.ex = {}; await db.F.addDoc(db.col('synagogues'), doc); }
      toast('✔️ נשמר! עכשיו כולם יכולים למצוא את הזמנים', null, true);
      history.back();
    } catch(e){
      btn.disabled = false; btn.textContent = '💾 שמור';
      toast('⚠️ לא נשמר: ' + (e.code === 'permission-denied' ? 'השרת עוד לא מוכן (כללי Firebase)' : (e.code || e.message)));
    }
  };
  const del = $('#sDel');
  if (del) del.onclick = () => confirmBox('למחוק את בית הכנסת?', 'כל הזמנים הקבועים יימחקו.', 'מחק', async () => {
    try { await db.F.deleteDoc(db.ref('synagogues', id)); toast('נמחק'); history.back(); } catch(e){ toast('⚠️ ' + e.code); }
  });
}
let synEditorRefresh = null;

/* ================= MINE ================= */
function renderMine(){
  if (view !== 'mine') return;
  const el = $('#mine');
  const items = myItems();
  const mySyns = [...syns.values()].filter(s => s.owner === uid);
  const rems = reminders.filter(r => r.at > Date.now()).sort((a, b) => a.at - b.at);
  el.innerHTML = `
    <div class="sect" style="margin-top:4px">🙋 המניינים שלי</div>
    ${items.length ? items.map(it => `<button class="card mcard" data-id="${esc(it.id)}"><div class="mtitle">${TYPES[it.type].i} ${esc(I.title(it))}</div><div class="msub">${dayLabel(it.kind === 'sched' ? it.dk : dkOf(it.startAt))} ${fmtT(it.startAt)} · ${I.count(it)}/10 · ${statusOf(it).t}</div></button>`).join('') : '<div class="card small">עוד לא נרשמת לאף מניין.</div>'}
    <div class="sect">🕍 בתי הכנסת שאני מנהל</div>
    ${mySyns.map(s => `<div class="card"><div class="mrow"><div><div class="mtitle">🕍 ${esc(s.name || s.place || 'בית כנסת')}</div><div class="msub">${esc(s.place || '')} · ${nusachName(s.nusach)}</div></div><button class="btn sm pri" data-edit="${s.id}">✏️ ניהול</button></div><div style="margin-top:8px">${weeklySummary(s)}</div></div>`).join('')}
    <button class="btn block" id="addSyn">➕ הוספת בית כנסת / מניין קבוע</button>
    <div class="sect">⏰ תזכורות</div>
    ${rems.length ? `<div class="card">${rems.map(r => `<div class="setrow"><span>${fmtT(r.at)} · ${esc(r.title)}<br><small class="small">${esc(r.body)}</small></span><button class="btn sm" data-rem="${esc(r.key)}">✖</button></div>`).join('')}</div>` : '<div class="card small">אין תזכורות. בכל מניין יש כפתור "⏰ תזכורת".</div>'}`;
  $$('[data-id]', el).forEach(b => b.onclick = () => openRoom(b.dataset.id));
  $$('[data-edit]', el).forEach(b => b.onclick = () => openSynEditor(b.dataset.edit));
  $$('[data-rem]', el).forEach(b => b.onclick = () => { reminders = reminders.filter(r => r.key !== b.dataset.rem); saveReminders(); scheduleReminders(); renderMine(); });
  $('#addSyn').onclick = () => openSynEditor(null);
}

/* ================= ZMANIM VIEW + CLOCK ================= */
let zDay = null;
function renderZmanim(){
  if (view !== 'zmanim') return;
  const el = $('#zmanim');
  const dk = zDay || today(), now = Date.now(), h = here();
  const z = zmanimFor(dk, h);
  const rows = z ? [
    ['עלות השחר', z.alot], ['זמן טלית ותפילין (משיכיר)', z.misheyakir], ['הנץ החמה', z.sunrise],
    ['סוף זמן קריאת שמע (גר"א)', z.shma], ['סוף זמן תפילה (גר"א)', z.tfila], ['חצות היום', z.chatzot],
    ['מנחה גדולה', z.minchaG], ['מנחה קטנה', z.minchaK], ['פלג המנחה', z.plag], ['שקיעה', z.sunset], ['צאת הכוכבים', z.tzeit],
  ] : [];
  const nextIdx = rows.findIndex(r => r[1] > now);
  const nz = nowZman();
  const noon = zoned(dk, '12:00', TZ());
  el.innerHTML = `<div class="card" style="text-align:center"><div class="bigclock" id="bigClock">${fmt(TZ(), {hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23'}).format(now)}</div>
      <div class="msub">${esc(placeLabel())} · ${hebDate(noon)}</div>
      ${dk === today() && z ? `<div class="note" style="margin-top:10px">עכשיו הזמן ל<b>${TYPES[nz.type].n}</b>. ${zmanHint(nz.type, z)}</div>` : ''}</div>
    <div class="chips" style="margin-bottom:8px">${[0, 1, 2].map(i => { const d = addDays(today(), i); return `<button data-zd="${d}" class="${d === dk ? 'on' : ''}">${dayLabel(d)}</button>`; }).join('')}<input type="date" id="zDate" value="${dk}"></div>
    <div class="card">${rows.map((r, i) => `<div class="zrow${dk === today() && r[1] < now ? ' past' : ''}${dk === today() && i === nextIdx ? ' next' : ''}"><span>${r[0]}</span><b>${r[1] ? fmtT(r[1]) : '-'}</b></div>`).join('') || 'אין זריחה או שקיעה במקום הזה ביום הזה.'}</div>
    <button class="btn block" id="zPlace">📍 החלפת מקום (${esc(placeLabel())})</button>
    <p class="small">הזמנים מחושבים לפי המקום שנבחר ובשעון המקומי שלו (שעה זמנית לפי הגר"א; עלות השחר 16.1°, צאת הכוכבים 8.5°). ייתכנו הבדלים של דקה או שתיים מלוחות אחרים.</p>`;
  $$('[data-zd]', el).forEach(b => b.onclick = () => { zDay = b.dataset.zd === today() ? null : b.dataset.zd; renderZmanim(); });
  $('#zDate').onchange = e => { if (e.target.value){ zDay = e.target.value; renderZmanim(); } };
  $('#zPlace').onclick = openPlacePicker;
}
const placeLabel = () => S.place ? S.place.name : (gps.real ? 'המיקום שלי' : 'מיקום משוער');
function tickClock(){
  const now = Date.now(), tz = TZ();
  $('#clock').textContent = fmt(tz, {hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23'}).format(now);
  const bc = $('#bigClock'); if (bc) bc.textContent = $('#clock').textContent;
}
function renderHeader(){
  $('#placeName').textContent = placeLabel();
  const nz = nowZman();
  $('#hdate').textContent = `${hebDate()} · עכשיו ${TYPES[nz.type].n}`;
}

/* ================= PLACE PICKER (מקום בעולם) ================= */
function openPlacePicker(){
  $('#modalBox').innerHTML = `<h3>📍 בחירת מקום</h3><p class="small">הזמנים, השעון והחיפוש יהיו לפי המקום שתבחר.</p>
    <button class="btn block ${S.place ? '' : 'pri'}" id="pGps">◎ המיקום שלי (GPS)</button>
    <div class="searchin" style="margin-top:10px"><input type="search" id="pQ" placeholder="חיפוש עיר או כתובת בכל העולם"><button class="btn" id="pGo">חפש</button></div>
    <div class="citylist" id="pList">${CITIES.map((c, i) => `<button data-c="${i}"><span>${c[0]}</span><small class="small">${c[3].split('/').pop().replace(/_/g, ' ')}</small></button>`).join('')}</div>
    <button class="btn block" id="mNo" style="margin-top:10px">סגור</button>`;
  $('#modal').hidden = false;
  $('#mNo').onclick = () => $('#modal').hidden = true;
  $('#pGps').onclick = () => { S.place = null; save(); $('#modal').hidden = true; placeChanged(); };
  const pick = p => { S.place = p; save(); $('#modal').hidden = true; placeChanged(); };
  const bindCities = () => $$('#pList [data-c]').forEach(b => b.onclick = () => { const c = CITIES[+b.dataset.c]; pick({name:c[0], lat:c[1], lng:c[2], tz:c[3]}); });
  bindCities();
  const search = async () => {
    const q = $('#pQ').value.trim(); if (!q) return;
    $('#pList').innerHTML = '<div class="small"><span class="spin">🔄</span> מחפש…</div>';
    try {
      const j = await (await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&accept-language=he&q=${encodeURIComponent(q)}`)).json();
      if (!j.length){ $('#pList').innerHTML = '<div class="small">לא נמצא. נסה שם אחר.</div>'; return; }
      $('#pList').innerHTML = j.map((r, i) => `<button data-r="${i}"><span>${esc(r.display_name.split(',').slice(0, 3).join(','))}</span></button>`).join('');
      $$('#pList [data-r]').forEach(b => b.onclick = async () => {
        const r = j[+b.dataset.r], lat = +r.lat, lng = +r.lon;
        b.innerHTML = '<span class="spin">🔄</span>';
        pick({name:r.display_name.split(',')[0], lat, lng, tz:await tzFor(lat, lng)});
      });
    } catch(e){ $('#pList').innerHTML = '<div class="small">📡 אין חיבור לאינטרנט</div>'; }
  };
  $('#pGo').onclick = search;
  $('#pQ').onkeydown = e => { if (e.key === 'Enter') search(); };
}
function placeChanged(){
  hideBanner('geo');
  if (!S.place && !gps.real) geoFail();
  occDay = null; subOcc();
  if (bigMap){ const h = here(); bigMap.setView([h.lat, h.lng], 14); }
  toast(`📍 ${esc(placeLabel())}: ${fmt(TZ(), {hour:'2-digit', minute:'2-digit', hourCycle:'h23'}).format(Date.now())} שעון מקומי`);
  renderAll(); renderSearchPanel();
}

/* ================= SETTINGS ================= */
function renderSettings(){
  if (view !== 'settings') return;
  const el = $('#settings');
  const user = auth && auth.currentUser;
  const google = user && !user.isAnonymous;
  el.innerHTML = `<div class="card">
    <label class="lbl" style="margin-top:0">🙂 השם שלך</label><input type="text" id="sName2" maxlength="30" placeholder="איך יראו אותך במניין">
    <div class="setrow" style="margin-top:6px"><span>📍 מקום: <b>${esc(placeLabel())}</b></span><button class="btn sm" id="sPlace2">החלפה</button></div>
  </div>
  <div class="card">
    <div class="toggle"><span>🔔 התראות (מישהו הצטרף, יש מניין, ביטולים)</span><input type="checkbox" id="sNotif"></div>
    <div class="toggle"><span>📣 להודיע כשנפתח מניין חדש בסביבה</span><input type="checkbox" id="sWatch"></div>
    <div class="toggle"><span>🔊 צליל בהתראות</span><input type="checkbox" id="sSound"></div>
    <div class="toggle"><span>🗣️ הוראות קוליות בניווט</span><input type="checkbox" id="sVoice"></div>
  </div>
  <div class="card">
    <div class="plabel">🎨 תצוגה</div>
    <div class="chips">${[['auto', 'אוטומטי'], ['dark', '🌙 כהה'], ['light', '☀️ בהיר']].map(([k, n]) => `<button data-th="${k}" class="${S.theme === k ? 'on' : ''}">${n}</button>`).join('')}</div>
  </div>
  <div class="card">
    <div class="plabel">👤 חשבון</div>
    <div class="small" style="margin-bottom:8px">${google ? `מחובר כ-${esc(user.email || user.displayName || '')}. ההגדרות ובתי הכנסת שלך שמורים גם בטלפון אחר.` : 'כדי לא לאבד את ההגדרות ואת הניהול של בתי הכנסת (למשל כשמחליפים טלפון), כדאי להתחבר עם Google.'}</div>
    ${google ? '<button class="btn block" id="sOut">התנתקות</button>' : '<button class="btn block pri" id="sIn">התחברות עם Google</button>'}
  </div>
  <div class="card">
    <div class="setrow"><span>📲 התקנה כאפליקציה</span><button class="btn sm" id="sInstall">${isStandalone() ? '✔️ מותקנת' : 'התקנה'}</button></div>
    <div class="setrow"><span>🆕 גרסה ${APP_VERSION}${newVersion ? ` · <b>יש גרסה ${esc(newVersion)}</b>` : ''}</span><button class="btn sm ${newVersion ? 'pri' : ''}" id="sUpd">${newVersion ? 'עדכן עכשיו' : 'בדוק עדכונים'}</button></div>
    <div class="setrow"><span>🛟 האפליקציה לא עובדת טוב?</span><button class="btn sm" id="sReload">טען מחדש</button></div>
    <div class="setrow"><span>❓ איך משתמשים באפליקציה</span><button class="btn sm" id="sHelp">הסבר</button></div>
  </div>
  <p class="small" style="text-align:center">מוצא המניין · גרסה ${APP_VERSION}<br>מפות © OpenStreetMap · מסלולים OSRM · אזורי זמן Open-Meteo<br>כל ההגדרות נשמרות במכשיר ולא נמחקות בעדכון.</p>`;
  $('#sName2').value = S.name;
  $('#sName2').onchange = e => { S.name = e.target.value.trim(); save(); toast('✔️ נשמר'); };
  $('#sPlace2').onclick = openPlacePicker;
  [['sNotif', 'notif'], ['sWatch', 'watch'], ['sSound', 'sound'], ['sVoice', 'voice']].forEach(([id, k]) => {
    $('#' + id).checked = !!S[k];
    $('#' + id).onchange = e => { S[k] = e.target.checked; save(); if (S[k] && (k === 'notif' || k === 'watch')) askNotif(); if (k === 'sound' && S[k]) beep('happy'); if (k === 'voice' && S[k]) say('הוראות קוליות פועלות'); };
  });
  $$('[data-th]', el).forEach(b => b.onclick = () => { S.theme = b.dataset.th; save(); applyTheme(); renderSettings(); });
  const si = $('#sIn'); if (si) si.onclick = googleSignIn;
  const so = $('#sOut'); if (so) so.onclick = () => confirmBox('להתנתק?', 'במכשיר הזה תתחיל חשבון חדש. הנתונים בחשבון ה-Google נשארים.', 'התנתק', async () => { await A.signOut(auth); location.reload(); });
  $('#sInstall').onclick = installApp;
  $('#sUpd').onclick = () => newVersion ? doUpdate() : checkUpdate(true);
  $('#sReload').onclick = hardReload;
  $('#sHelp').onclick = () => showTutorial(0);
}
async function googleSignIn(){
  try {
    const prov = new A.GoogleAuthProvider();
    try { await A.linkWithPopup(auth.currentUser, prov); }
    catch(e){
      const cred = A.GoogleAuthProvider.credentialFromError(e);
      if (!cred) throw e;
      await A.signInWithCredential(auth, cred);
    }
    store.set('restoredFrom', null);
    location.reload();
  } catch(e){ toast('⚠️ ההתחברות לא הצליחה: ' + (e.code || e.message)); }
}
function applyTheme(){
  const dark = S.theme === 'dark' || (S.theme === 'auto' && !matchMedia('(prefers-color-scheme: light)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

/* ================= INSTALL / UPDATE / RELOAD ================= */
let installEvt = null, newVersion = null, swReg = null;
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; maybeInstallBanner(); });
window.addEventListener('appinstalled', () => { hideBanner('install'); toast('✔️ האפליקציה הותקנה!', null, true); });
function maybeInstallBanner(){
  if (isStandalone() || store.get('installDismissed', 0) > Date.now()) return;
  showBanner('install', '📲 אפשר להתקין את מוצא המניין כמו אפליקציה רגילה', 'התקנה', installApp, true, () => store.set('installDismissed', Date.now() + 14 * 864e5));
}
async function installApp(){
  if (isStandalone()){ toast('✔️ האפליקציה כבר מותקנת'); return; }
  if (installEvt){ installEvt.prompt(); const r = await installEvt.userChoice; installEvt = null; if (r.outcome === 'accepted') hideBanner('install'); return; }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  $('#modalBox').innerHTML = `<h3>📲 התקנת האפליקציה</h3>${ios
    ? '<p>באייפון (בספארי):<br>1. לוחצים על כפתור השיתוף <b>⬆️</b> למטה.<br>2. בוחרים <b>"הוסף למסך הבית"</b>.<br>3. לוחצים <b>"הוסף"</b>.</p>'
    : '<p>באנדרואיד (בכרום):<br>1. לוחצים על <b>⋮</b> למעלה.<br>2. בוחרים <b>"התקנת אפליקציה"</b> או <b>"הוספה למסך הבית"</b>.</p><p>במחשב (כרום או Edge): לוחצים על סמל ההתקנה בצד שורת הכתובת.</p>'}
    <button class="btn block pri" id="mNo">הבנתי</button>`;
  $('#modal').hidden = false; $('#mNo').onclick = () => $('#modal').hidden = true;
}
async function checkUpdate(manual){
  try {
    const j = await (await fetch('version.json?t=' + Date.now(), {cache:'no-store'})).json();
    if (cmpVer(j.v, APP_VERSION) > 0){
      const first = newVersion !== j.v;
      newVersion = j.v;
      showBanner('update', `🆕 יש גרסה חדשה (${j.v})${j.notes ? ': ' + j.notes : ''}. כדאי לעדכן.`, 'עדכן עכשיו', doUpdate, true);
      if (first && !manual && store.get('notifiedVer', '') !== j.v){ store.set('notifiedVer', j.v); sysNotify('🆕 יש עדכון למוצא המניין', 'כדאי לעדכן את האפליקציה'); }
      if (manual) doUpdate();
    } else if (manual) toast('✔️ יש לך את הגרסה הכי חדשה');
    renderSettings();
  } catch(e){ if (manual) toast('📡 אין חיבור לאינטרנט, נסה שוב אחר כך'); }
}
const cmpVer = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++){ if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); } return 0; };
async function doUpdate(){
  toast('<span class="spin">🔄</span> מעדכן… ההגדרות שלך נשמרות');
  await cloudSave();
  try { if (swReg) await swReg.update(); } catch(e){}
  try { const ks = await caches.keys(); await Promise.all(ks.filter(k => k.startsWith('minyan-')).map(k => caches.delete(k))); } catch(e){}
  location.reload();
}
async function hardReload(){
  // טוען מחדש את קבצי האפליקציה בלבד; ההגדרות, התזכורות והחשבון נשארים
  try { const ks = await caches.keys(); await Promise.all(ks.filter(k => k.startsWith('minyan-')).map(k => caches.delete(k))); } catch(e){}
  try { const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.filter(r => r.scope.endsWith('/minyan/') || r.scope === new URL('./', location.href).href).map(r => r.unregister())); } catch(e){}
  location.reload();
}

/* ================= TUTORIAL ================= */
const TUT = [
  ['🕍', 'ברוכים הבאים למוצא המניין!', 'האפליקציה עוזרת למצוא מניין קרוב לשחרית, מנחה וערבית, ולארגן מניין כשאין.'],
  ['🔍', 'מחפשים מניין', 'בלשונית "חיפוש" בוחרים תפילה, יום, עד כמה רחוק ונוסח. אפשר גם לחפש לפי שם של בית כנסת. "🌍 כל המניינים" מראה הכל.'],
  ['🚶', 'רואים ומצטרפים', 'בכל מניין רואים כמה אנשים יש (מתוך 10), בכמה דקות הליכה הוא ומתי מתחילים. לוחצים עליו כדי לראות את הדרך במפה ולוחצים "אני מגיע!".'],
  ['➕', 'אין מניין? פותחים!', 'הכפתור הצהוב "פתח מניין" פותח מניין, ומי שבסביבה מקבל הודעה. מי שפתח יכול לעדכן כמה אנשים יש, מתי מתחילים ולכתוב הערה.'],
  ['🗓️', 'בתי כנסת ומניינים קבועים', 'גבאי יכול להוסיף בית כנסת עם זמנים קבועים לפי ימים בשבוע (גם "20 דק\' לפני השקיעה"), לכמה שבועות או לתמיד, ולבטל או להזיז יום מסוים.'],
  ['🎉', 'יש מניין!', 'כשמגיעים ל-10 כולם מקבלים הודעה. יש גם ניווט בהליכה, תזכורת "לצאת עכשיו", זמני היום ושעון לכל מקום בעולם. ההסבר הזה נמצא גם בהגדרות.'],
];
function showTutorial(i){
  const [ic, h, p] = TUT[i];
  $('#modalBox').innerHTML = `<div class="tut"><div class="ic">${ic}</div><h3>${h}</h3><p>${p}</p></div>
    <div class="dots">${TUT.map((_, j) => `<i class="${j === i ? 'on' : ''}"></i>`).join('')}</div>
    <div class="row">${i > 0 ? '<button class="btn" id="tPrev">→ הקודם</button>' : '<button class="btn" id="tSkip">דלג</button>'}<button class="btn pri" id="tNext">${i < TUT.length - 1 ? 'הבא ←' : 'יאללה, מתחילים!'}</button></div>`;
  $('#modal').hidden = false;
  const done = () => { $('#modal').hidden = true; store.set('tutorialSeen', 2); if (!S.name) askName(); };
  const pv = $('#tPrev'); if (pv) pv.onclick = () => showTutorial(i - 1);
  const sk = $('#tSkip'); if (sk) sk.onclick = done;
  $('#tNext').onclick = () => i < TUT.length - 1 ? showTutorial(i + 1) : done();
}

/* ================= MODALS + BANNERS ================= */
function confirmBox(title, text, okText, fn){
  $('#modalBox').innerHTML = `<h3>${esc(title)}</h3><p>${esc(text)}</p><div class="row"><button class="btn" id="mNo">ביטול</button><button class="btn bad" id="mYes">${esc(okText)}</button></div>`;
  $('#modal').hidden = false;
  $('#mNo').onclick = () => $('#modal').hidden = true;
  $('#mYes').onclick = () => { $('#modal').hidden = true; fn(); };
}
function askName(){
  return new Promise(res => {
    $('#modalBox').innerHTML = `<h3>🙂 איך קוראים לך?</h3><p class="small">כך יראו אותך ברשימת המניין.</p><input type="text" id="mName" maxlength="30" placeholder="השם שלך"><div class="row" style="margin-top:10px"><button class="btn pri" id="mOk">אישור</button></div>`;
    $('#modal').hidden = false;
    setTimeout(() => $('#mName').focus(), 50);
    const done = () => { S.name = $('#mName').value.trim() || 'אורח'; save(); $('#modal').hidden = true; res(); };
    $('#mOk').onclick = done;
    $('#mName').onkeydown = e => { if (e.key === 'Enter') done(); };
  });
}
$('#modal').onclick = e => { if (e.target.id === 'modal' && !$('#mName') && !$('.tut')) $('#modal').hidden = true; };
const banners = {};
function showBanner(k, text, btn, fn, info, onClose){ banners[k] = {text, btn, fn, info, onClose}; drawBanners(); }
function hideBanner(k){ delete banners[k]; drawBanners(); }
function drawBanners(){
  const order = ['offline', 'conn', 'update', 'geo', 'install'];
  const el = $('#banners');
  el.innerHTML = order.filter(k => banners[k]).map(k => { const b = banners[k]; return `<div class="banner${b.info ? ' info' : ''}" data-k="${k}"><span>${esc(b.text)}</span><span style="display:flex;gap:6px">${b.btn ? `<button data-b="go">${esc(b.btn)}</button>` : ''}${b.onClose ? '<button data-b="x">✕</button>' : ''}</span></div>`; }).join('');
  $$('.banner', el).forEach(d => {
    const b = banners[d.dataset.k];
    const go = $('[data-b=go]', d); if (go) go.onclick = b.fn;
    const x = $('[data-b=x]', d); if (x) x.onclick = () => { b.onClose(); hideBanner(d.dataset.k); };
  });
}
function netStatus(){
  if (navigator.onLine) hideBanner('offline');
  else showBanner('offline', '📡 אין חיבור לאינטרנט. מה שמוצג אולי לא מעודכן.', 'טען מחדש', hardReload);
}
window.addEventListener('online', () => { netStatus(); toast('✔️ החיבור חזר'); });
window.addEventListener('offline', netStatus);

/* ================= NAV / VIEWS ================= */
function setView(v){
  view = v;
  $$('.view').forEach(s => s.classList.toggle('active', s.id === 'v-' + v));
  $$('#bottom button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  $('#fabCreate').style.display = (v === 'search' || v === 'map' || v === 'mine') ? '' : 'none';
  if (v === 'map') renderBigMap();
  if (v === 'mine') renderMine();
  if (v === 'zmanim') renderZmanim();
  if (v === 'settings') renderSettings();
  window.scrollTo(0, 0);
}
function onData(){
  renderList(); renderMyBar(); renderBigMap(); renderRoom(); renderMine();
  if (synEditorRefresh && !$('#editor').hidden) synEditorRefresh();
  if (pendingOpen && (liveReady && synReady)){
    const id = pendingOpen; pendingOpen = null;
    const it = findItem(id);
    if (it){ if (it.kind === 'sched' && it.dk !== (S.q.day || today())){ S.q.day = it.dk === today() ? null : it.dk; S.q.type = it.type; subOcc(); renderSearchPanel(); } openRoom(id, true); }
    else toast('המניין הזה כבר לא פעיל');
  }
}
function renderAll(){
  renderHeader(); renderList(); renderMyBar(); renderBigMap(); renderMine(); renderZmanim(); renderSettings();
  if (openId) renderRoom();
}
$$('#bottom button').forEach(b => b.onclick = () => setView(b.dataset.v));
$('#fabCreate').onclick = () => openCreate();
$('#placeChip').onclick = openPlacePicker;
window.addEventListener('popstate', () => {
  if (!$('#nav').hidden){ stopNav(); return; }
  if (!$('#editor').hidden){ closeEditor(); synEditorRefresh = null; return; }
  if (!$('#room').hidden) closeRoom();
  const p = new URLSearchParams(location.search), id = p.get('m') || p.get('o');
  if (id && findItem(id)) openRoom(id, true);
});
const params = new URLSearchParams(location.search);
let pendingOpen = params.get('m') || params.get('o');
if (pendingOpen){ const mm = /_(\d{4}-\d{2}-\d{2})_/.exec(pendingOpen); if (mm && mm[1] >= today()) S.q.day = mm[1] === today() ? null : mm[1]; }
if ('serviceWorker' in navigator && location.protocol === 'https:'){
  navigator.serviceWorker.register('sw.js').then(r => { swReg = r; }).catch(() => {});
  navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.open){ if (findItem(e.data.open)) openRoom(e.data.open); else pendingOpen = e.data.open; } });
}
matchMedia('(prefers-color-scheme: light)').addEventListener('change', applyTheme);
document.addEventListener('visibilitychange', () => { if (!document.hidden){ checkUpdate(); tickClock(); renderList(); } });

/* ================= START ================= */
(async function start(){
  if (!S.q.type) S.q.type = nowZman().type;
  if (S.q.day && S.q.day < today()) S.q.day = null;
  applyTheme(); renderHeader(); tickClock(); renderSearchPanel();
  setView('search'); renderList(); netStatus();
  if (!S.place) startGeo();
  scheduleReminders();
  setInterval(tickClock, 1000);
  setInterval(() => { renderHeader(); renderList(); renderMyBar(); renderMine(); if (openId) renderRoom(); if (view === 'zmanim') renderZmanim(); }, 20000);
  setInterval(checkUpdate, 30 * MIN);
  setTimeout(checkUpdate, 4000);
  setTimeout(maybeInstallBanner, 15000);
  if (store.get('tutorialSeen', 0) < 2 && !pendingOpen) showTutorial(0);
  try {
    await Promise.race([connect(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 20000))]);
    subscribe();
  } catch(e){
    console.warn(e);
    setConn('error', 'net');
  }
})();
