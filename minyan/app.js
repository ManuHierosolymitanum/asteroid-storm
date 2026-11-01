'use strict';
/* מניין עכשיו: מוצאים מניין קרוב.
   נתונים משותפים בזמן אמת: Firebase (Firestore, אוסף minyanim).
   מפות: OpenStreetMap / CARTO. מסלולי הליכה: OSRM (routing.openstreetmap.de). כתובות: Nominatim. */

const FB_CONFIG = {"apiKey":"AIzaSyBPgIc5-N6L91oIgSW-gHZvvEJbnb7EXRI","authDomain":"asteroid-storm-d4ed7.firebaseapp.com","projectId":"asteroid-storm-d4ed7","storageBucket":"asteroid-storm-d4ed7.firebasestorage.app","messagingSenderId":"389019859065","appId":"1:389019859065:web:75e2a5f0ac32cc45c17ca8"};
const FB_V = '10.12.2';

const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MIN = 60e3;
const TYPES = {shacharit:{n:'שחרית', i:'🌅'}, mincha:{n:'מנחה', i:'☀️'}, arvit:{n:'ערבית', i:'🌙'}};
const NUSACH = {any:'כל נוסח', ashk:'אשכנז', sfard:'ספרד', edot:'עדות המזרח', teiman:'תימני'};
const DEFAULT_POS = {lat:31.7784, lng:35.2066}; // ירושלים, עד שמגיע מיקום
const WALK_M_PER_MIN = 80; // ~4.8 קמ"ש
const fmtT = ms => new Date(ms).toLocaleTimeString('he-IL', {hour:'2-digit', minute:'2-digit'});
const fmtMin = m => m < 1 ? 'פחות מדקה' : m < 60 ? `${Math.round(m)} דק'` : `${Math.floor(m / 60)}:${String(Math.round(m % 60)).padStart(2, '0')} שע'`;

const store = {
  get(k, d){ try { const v = localStorage.getItem('mn_' + k); return v == null ? d : JSON.parse(v); } catch(e){ return d; } },
  set(k, v){ try { localStorage.setItem('mn_' + k, JSON.stringify(v)); } catch(e){} },
};
const S = {
  name: store.get('name', ''),
  radius: store.get('radius', 20),      // דקות הליכה, 0 = הכל
  notif: store.get('notif', true),
  watch: store.get('watch', true),      // להודיע כשנפתח מניין חדש בסביבה
  sound: store.get('sound', true),
  theme: store.get('theme', 'auto'),
  nusach: store.get('nusach', 'any'),
};
const save = () => Object.entries(S).forEach(([k, v]) => store.set(k, v));

let uid = null, db = null, connState = 'connecting';
let docs = new Map();           // id -> minyan
let prevDocs = null;            // לזיהוי שינויים (התראות)
let me = {lat:DEFAULT_POS.lat, lng:DEFAULT_POS.lng, real:false, acc:null};
let type = store.get('type', null) || nowZman().type;
let filter = 'all', view = 'list';
const routes = {};              // id -> {min, km, geo, at:{lat,lng}}

/* ================= ZMANIM (NOAA) ================= */
function sunTime(date, lat, lng, zenith, rising){
  const rad = Math.PI / 180;
  const start = new Date(date.getFullYear(), 0, 0);
  const N = Math.floor((new Date(date.getFullYear(), date.getMonth(), date.getDate()) - start) / 864e5);
  const lngHour = lng / 15;
  const t = N + ((rising ? 6 : 18) - lngHour) / 24;
  const M = 0.9856 * t - 3.289;
  let L = M + 1.916 * Math.sin(M * rad) + 0.020 * Math.sin(2 * M * rad) + 282.634;
  L = (L + 360) % 360;
  let RA = Math.atan(0.91764 * Math.tan(L * rad)) / rad;
  RA = (RA + 360) % 360;
  RA += Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90;
  RA /= 15;
  const sinDec = 0.39782 * Math.sin(L * rad), cosDec = Math.cos(Math.asin(sinDec));
  const cosH = (Math.cos(zenith * rad) - sinDec * Math.sin(lat * rad)) / (cosDec * Math.cos(lat * rad));
  if (cosH > 1 || cosH < -1) return null;
  let H = rising ? 360 - Math.acos(cosH) / rad : Math.acos(cosH) / rad;
  H /= 15;
  const T = H + RA - 0.06571 * t - 6.622;
  const UT = ((T - lngHour) % 24 + 24) % 24;
  let ms = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) + UT * 36e5;
  // לוודא שהתוצאה באותו יום מקומי
  const d = new Date(ms);
  if (d.getDate() !== date.getDate()) ms += (d < date ? 1 : -1) * 864e5;
  return ms;
}
function zmanim(date = new Date(), pos = me){
  const z = (zen, r) => sunTime(date, pos.lat, pos.lng, zen, r);
  const sunrise = z(90.833, true), sunset = z(90.833, false);
  const alot = z(106.1, true), tzeit = z(98.5, false);
  const sh = (sunset - sunrise) / 12; // שעה זמנית (גר"א)
  return {
    alot, misheyakir: z(101.5, true), sunrise,
    shma: sunrise + 3 * sh, tfila: sunrise + 4 * sh, chatzot: sunrise + 6 * sh,
    minchaG: sunrise + 6.5 * sh, minchaK: sunrise + 9.5 * sh, plag: sunrise + 10.75 * sh,
    sunset, tzeit, sh,
  };
}
function nowZman(t = Date.now()){
  const z = zmanim(new Date(t), me.lat ? me : DEFAULT_POS);
  if (t < z.alot - 5 * 36e5) return {type:'arvit', z}; // אחרי חצות הלילה
  if (t < z.chatzot) return {type:'shacharit', z};
  if (t < z.sunset) return {type:'mincha', z};
  return {type:'arvit', z};
}

/* ================= GEO ================= */
function distM(a, b){
  const R = 6371e3, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function walkOf(m){
  const r = routes[m.id];
  if (r && distM(r.at, me) < 120) return {min:r.min, km:r.km, real:true};
  const d = distM(me, m) * 1.3; // רחובות לא ישרים
  return {min:d / WALK_M_PER_MIN, km:d / 1000, real:false};
}
async function fetchRoute(m){
  const r = routes[m.id];
  if (r && distM(r.at, me) < 120) return r;
  const at = {lat:me.lat, lng:me.lng};
  const url = `https://routing.openstreetmap.de/routed-foot/route/v1/driving/${at.lng},${at.lat};${m.lng},${m.lat}?overview=full&geometries=geojson`;
  const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 9000);
  try {
    const j = await (await fetch(url, {signal:ctl.signal})).json();
    const rt = j.routes && j.routes[0];
    if (!rt) return null;
    // זמן הליכה לפי המרחק בדרך, במהירות הליכה רגילה
    const res = {min:rt.distance / WALK_M_PER_MIN, km:rt.distance / 1000, geo:rt.geometry.coordinates.map(([x, y]) => [y, x]), at};
    routes[m.id] = res;
    return res;
  } catch(e){ return null; } finally { clearTimeout(to); }
}
let routeQueueBusy = false;
async function fetchListRoutes(list){
  if (routeQueueBusy || !me.real) return;
  routeQueueBusy = true;
  let changed = false;
  for (const m of list.slice(0, 8)){
    const r = routes[m.id];
    if (r && distM(r.at, me) < 120) continue;
    if (await fetchRoute(m)) changed = true;
    await new Promise(r => setTimeout(r, 250));
  }
  routeQueueBusy = false;
  if (changed){ renderList(); renderMyBar(); }
}
function startGeo(){
  if (!('geolocation' in navigator)){ geoFail(); return; }
  navigator.geolocation.watchPosition(p => {
    const first = !me.real;
    me = {lat:p.coords.latitude, lng:p.coords.longitude, real:true, acc:p.coords.accuracy};
    store.set('lastPos', {lat:me.lat, lng:me.lng});
    hideBanner('geo');
    if (first){ renderAll(); if (bigMap) bigMap.setView([me.lat, me.lng], 15); }
    else throttle('geoRender', 4000, () => { renderList(); renderMyBar(); updateMeMarkers(); });
    autoArrive();
  }, err => geoFail(err), {enableHighAccuracy:true, maximumAge:15000, timeout:20000});
}
function geoFail(){
  if (me.real) return;
  const last = store.get('lastPos', null);
  if (last){ me = {...last, real:false}; }
  showBanner('geo', '📍 אין גישה למיקום, אז זמני ההליכה משוערים. אפשר לאשר מיקום בדפדפן, או לסמן את המיקום במפה.', 'נסה שוב', () => location.reload());
  renderAll();
}
const throttles = {};
function throttle(k, ms, fn){ if (throttles[k]) return; throttles[k] = setTimeout(() => { throttles[k] = null; fn(); }, ms); }

/* ================= FIREBASE ================= */
async function connect(){
  const base = `https://www.gstatic.com/firebasejs/${FB_V}/`;
  const [{initializeApp}, A, F] = await Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-firestore.js')]);
  const app = initializeApp(FB_CONFIG);
  const auth = A.getAuth(app), fs = F.getFirestore(app);
  const emu = window.__FB_EMU; // רק בבדיקות מקומיות
  if (emu){ A.connectAuthEmulator(auth, 'http://127.0.0.1:9099', {disableWarnings:true}); F.connectFirestoreEmulator(fs, '127.0.0.1', 8085); }
  await auth.authStateReady();
  if (!auth.currentUser) await A.signInAnonymously(auth);
  uid = auth.currentUser.uid;
  db = {F, fs, col:() => F.collection(fs, 'minyanim'), ref:id => F.doc(fs, 'minyanim', id)};
}
function subscribe(){
  const {F} = db;
  F.onSnapshot(F.query(db.col(), F.where('expires', '>', Date.now())), snap => {
    const next = new Map();
    snap.forEach(d => next.set(d.id, {id:d.id, ...d.data()}));
    onData(next);
    setConn('ok');
  }, err => {
    console.warn(err);
    setConn('error', err.code === 'permission-denied' ? 'perm' : 'net');
  });
}
function setConn(s, why){
  connState = s;
  if (s === 'ok') hideBanner('conn');
  else if (s === 'error'){
    showBanner('conn', why === 'perm' ? '🔒 השרת עוד לא מוכן למניינים (צריך לעדכן את הכללים ב-Firebase).' : '📡 אין חיבור לשרת. בודק שוב…', 'נסה שוב', () => location.reload());
    renderList();
  }
}

const M = { // פעולות על מניין
  members: m => Object.entries(m.members || {}),
  count: m => Object.keys(m.members || {}).length + (m.extra || 0),
  here: m => Object.values(m.members || {}).filter(x => x.s === 'here').length + (m.extra || 0),
  isOwner: m => m.owner === uid,
  isIn: m => !!(m.members && m.members[uid]),
  full: m => M.count(m) >= 10,
  expires(m, patch = {}){
    const x = {...m, ...patch}, now = Date.now();
    let e = Math.max((x.created || now) + 3 * 60 * MIN, (x.startAt || 0) + 90 * MIN, now + 60 * MIN);
    if (x.status === 'started') e = Math.min(e, now + 75 * MIN);
    return e;
  },
};
async function createMinyan(d){
  const {F} = db;
  const ref = F.doc(db.col());
  const now = Date.now();
  const doc = {
    type:d.type, lat:d.lat, lng:d.lng, place:d.place.slice(0, 120), note:(d.note || '').slice(0, 300),
    nusach:d.nusach, owner:uid, ownerName:S.name || 'אורח',
    status:d.startAt && d.startAt > now + MIN ? 'wait' : 'now', startAt:d.startAt || now,
    extra:Math.max(0, (d.count || 1) - 1),
    members:{[uid]:{n:S.name || 'אורח', s:'here', t:now}},
    created:now, updated:now,
  };
  doc.expires = M.expires(doc);
  await leaveCurrent();
  await F.setDoc(ref, doc);
  return ref.id;
}
async function ownerUpdate(m, patch){
  const {F} = db;
  patch.updated = Date.now();
  patch.expires = M.expires(m, patch);
  Object.assign(m, patch); // תצוגה מיידית
  renderRoom(); renderList(); renderMyBar();
  try { await F.updateDoc(db.ref(m.id), patch); } catch(e){ toast('⚠️ לא נשמר: ' + (e.code || e.message)); }
}
async function join(m, s){
  const {F} = db;
  if (!M.isIn(m)) await leaveCurrent(m.id);
  const w = walkOf(m);
  const entry = {n:S.name || 'אורח', s, t:Date.now()};
  if (s === 'coming') entry.eta = Date.now() + Math.round(w.min) * MIN;
  try {
    await F.updateDoc(db.ref(m.id), {[`members.${uid}`]:entry, updated:Date.now()});
  } catch(e){ toast('⚠️ לא הצלחתי להצטרף: ' + (e.code || e.message)); }
}
async function leave(m){
  const {F} = db;
  try { await F.updateDoc(db.ref(m.id), {[`members.${uid}`]:F.deleteField(), updated:Date.now()}); }
  catch(e){ toast('⚠️ ' + (e.code || e.message)); }
}
async function leaveCurrent(exceptId){
  for (const m of docs.values()){
    if (m.id !== exceptId && M.isIn(m) && !M.isOwner(m)) await leave(m);
  }
}
async function closeMinyan(m){
  try { await db.F.deleteDoc(db.ref(m.id)); } catch(e){ toast('⚠️ ' + (e.code || e.message)); }
}

/* ================= DATA CHANGES + ALERTS ================= */
function alive(m){ return (m.expires || 0) > Date.now(); }
function onData(next){
  const prev = prevDocs;
  docs = next;
  if (prev){
    for (const m of next.values()){
      const p = prev.get(m.id);
      const mine = M.isIn(m) || M.isOwner(m);
      const w = walkOf(m), near = !S.radius || w.min <= S.radius;
      const t = TYPES[m.type];
      if (!p){
        if (!mine && S.watch && m.type === type && near)
          notify(`${t.i} נפתח מניין ${t.n}`, `${m.place} · ${fmtMin(w.min)} הליכה · ${M.count(m)}/10`, m.id);
        continue;
      }
      if (mine){
        const before = new Set(Object.keys(p.members || {}));
        for (const [k, v] of M.members(m)){
          if (k !== uid && !before.has(k))
            notify(`👋 ${v.n || 'מישהו'} ${v.s === 'coming' ? 'בדרך למניין' : 'הצטרף למניין'}`, `${t.n} ב${m.place}: עכשיו ${M.count(m)}/10`, m.id);
        }
        if (p.status !== m.status && m.owner !== uid){
          if (m.status === 'now') notify('▶️ מתחילים עכשיו!', `${t.n} ב${m.place}`, m.id);
          if (m.status === 'started') notify('✅ התחילו להתפלל', `${t.n} ב${m.place}`, m.id);
        }
        if (p.startAt !== m.startAt && m.status === 'wait' && m.owner !== uid)
          notify('⏰ זמן ההתחלה השתנה', `${t.n} ב${m.place}: מתחילים ב-${fmtT(m.startAt)}`, m.id);
      }
      if (!M.full(p) && M.full(m) && (mine || (m.type === type && near)))
        notify(`🎉 יש מניין! ${t.n}`, `${m.place}: ${M.count(m)} אנשים${mine ? '' : ' · ' + fmtMin(w.min) + ' הליכה'}`, m.id, true);
    }
    for (const p of prev.values()){
      if (!next.has(p.id) && M.isIn(p) && !M.isOwner(p)) toast(`המניין ב${p.place} נסגר`);
    }
  }
  prevDocs = new Map([...next].map(([k, v]) => [k, JSON.parse(JSON.stringify(v))]));
  renderList(); renderMyBar(); renderBigMap(); renderRoom();
  if (pendingOpen){
    const id = pendingOpen; pendingOpen = null;
    if (docs.has(id)) openRoom(id); else toast('המניין הזה כבר לא פעיל');
  }
}

let audioCtx = null;
function beep(happy){
  if (!S.sound) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const notes = happy ? [523, 659, 784, 1047] : [660, 880];
    notes.forEach((f, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = f; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime + i * 0.13);
      g.gain.exponentialRampToValueAtTime(0.25, audioCtx.currentTime + i * 0.13 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + i * 0.13 + 0.25);
      o.connect(g).connect(audioCtx.destination);
      o.start(audioCtx.currentTime + i * 0.13); o.stop(audioCtx.currentTime + i * 0.13 + 0.3);
    });
  } catch(e){}
}
async function notify(title, body, id, happy){
  toast(`<b>${esc(title)}</b><br>${esc(body)}`, id, happy);
  if (!S.notif) return;
  beep(happy);
  try { navigator.vibrate && navigator.vibrate(happy ? [120, 80, 120, 80, 240] : [150]); } catch(e){}
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted'){
    try {
      const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      const opts = {body, icon:'icon-192.png', badge:'icon-192.png', tag:id || 'mn', data:{id}, renotify:true};
      if (reg) reg.showNotification(title, opts); else new Notification(title, opts);
    } catch(e){}
  }
}
function toast(html, id, ok){
  const el = document.createElement('div');
  el.className = 'toast' + (ok ? ' ok' : '');
  el.innerHTML = html;
  if (id) el.onclick = () => { openRoom(id); el.remove(); };
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), ok ? 8000 : 5000);
  while ($('#toasts').children.length > 3) $('#toasts').firstChild.remove();
}

/* ================= TEXT HELPERS ================= */
function statusOf(m){
  const now = Date.now();
  if (m.status === 'started') return {t:'✅ התחילו', c:'ok'};
  if (m.status === 'now') return {t:'▶️ מתחילים עכשיו', c:'now'};
  const left = (m.startAt - now) / MIN;
  if (left <= 0) return {t:`⏰ אמורים להתחיל (${fmtT(m.startAt)})`, c:'now'};
  return {t:`⏱️ מתחילים בעוד ${fmtMin(left)} (${fmtT(m.startAt)})`, c:'go'};
}
function arriveHint(m){
  if (M.isIn(m) || m.status === 'started') return '';
  const w = walkOf(m);
  if (m.status === 'now') return w.min > 3 ? `<span class="badge warn">🏃 תגיע אחרי שהתחילו</span>` : '';
  const left = (m.startAt - Date.now()) / MIN;
  if (left <= 0) return '';
  if (w.min > left + 1) return `<span class="badge warn">🏃 תגיע ${Math.round(w.min - left)} דק' אחרי ההתחלה</span>`;
  return `<span class="badge">👍 תספיק להגיע (צא עד ${fmtT(m.startAt - w.min * MIN)})</span>`;
}
function bar(m, big){
  const c = M.count(m), full = c >= 10;
  return `<div class="count${big ? ' big' : ''}"><div class="bar${full ? ' full' : ''}">${Array.from({length:10}, (_, i) => `<i class="${i < c ? 'on' : ''}"></i>`).join('')}</div><b>${full ? '✅ ' : ''}${c}/10</b></div>`;
}
function whoLine(m){
  const mem = Object.values(m.members || {});
  const here = mem.filter(x => x.s === 'here').length, coming = mem.length - here;
  const parts = [];
  if (here) parts.push(`${here} כאן`);
  if (coming) parts.push(`${coming} בדרך`);
  if (m.extra) parts.push(`${m.extra} בלי אפליקציה`);
  return parts.join(' · ');
}

/* ================= LIST ================= */
function filtered(){
  const out = [];
  for (const m of docs.values()){
    if (!alive(m) || m.type !== type) continue;
    const w = walkOf(m), mine = M.isIn(m) || M.isOwner(m);
    if (!mine){
      if (S.radius && w.min > S.radius) continue;
      if (filter === 'full' && !M.full(m)) continue;
      if (filter === 'near' && w.min > 10) continue;
      if (filter === 'soon' && m.status === 'wait' && m.startAt - Date.now() > 20 * MIN) continue;
      if (filter === 'soon' && m.status === 'started') continue;
      if (S.nusach !== 'any' && m.nusach !== 'any' && m.nusach !== S.nusach) continue;
    }
    out.push({m, w, mine});
  }
  out.sort((a, b) => (b.mine - a.mine) || (a.w.min - b.w.min));
  return out;
}
function renderList(){
  const el = $('#list'); if (!el) return;
  if (connState === 'connecting'){ el.innerHTML = `<div class="empty"><div class="big spin">🔄</div><b>מתחבר…</b></div>`; return; }
  const list = filtered();
  const t = TYPES[type];
  if (!list.length){
    const z = nowZman();
    el.innerHTML = `<div class="empty"><div class="big">${t.i}</div>
      <b>אין כרגע מניין ${t.n} ${S.radius ? `עד ${S.radius} דק' הליכה ממך` : 'פתוח'}</b>
      ${connState === 'error' ? 'אין חיבור לשרת כרגע.' : 'אפשר לפתוח מניין, ואנשים בסביבה יראו אותו ויצטרפו.'}
      <div style="margin-top:14px;display:flex;flex-direction:column;gap:8px;align-items:center">
        <button class="btn pri" data-act="create">➕ לפתוח מניין ${t.n}</button>
        ${S.radius && S.radius < 60 ? `<button class="btn" data-act="wider">🔭 לחפש רחוק יותר</button>` : ''}
        ${S.watch ? `<span class="small">🔔 נודיע לך כשנפתח מניין ${t.n} בסביבה</span>` : `<button class="btn" data-act="watch">🔔 תודיע לי כשנפתח מניין</button>`}
      </div>
      <p class="small" style="margin-top:18px">${zmanHint(type, z.z)}</p></div>`;
    $('[data-act=create]', el).onclick = () => openCreate();
    const wb = $('[data-act=wider]', el); if (wb) wb.onclick = () => { S.radius = S.radius < 30 ? 30 : 60; save(); renderAll(); toast(`מחפש עד ${S.radius} דק' הליכה`); };
    const nb = $('[data-act=watch]', el); if (nb) nb.onclick = () => { S.watch = true; save(); askNotif(); renderList(); };
    return;
  }
  el.innerHTML = list.map(({m, w, mine}) => {
    const st = statusOf(m);
    return `<button class="card mcard${M.full(m) ? ' full' : ''}${mine ? ' mine' : ''}" data-id="${m.id}">
      <div class="mrow">
        <div style="flex:1;min-width:0">
          <div class="mtitle">${TYPES[m.type].i} ${esc(m.place)}</div>
          <div class="msub">${mine ? (M.isOwner(m) ? '⭐ המניין שלך · ' : '🙋 אתה רשום כאן · ') : ''}${NUSACH[m.nusach] || ''}${m.ownerName ? ' · פתח: ' + esc(m.ownerName) : ''}</div>
        </div>
        <div class="walk${w.real ? '' : ' est'}"><b>${Math.max(1, Math.round(w.min))}</b><small>דק' הליכה${w.real ? '' : ' ~'}</small></div>
      </div>
      ${bar(m)}
      <div><span class="badge ${st.c}">${st.t}</span>${M.full(m) ? '<span class="badge ok">✅ יש מניין</span>' : ''}${arriveHint(m)}</div>
      ${m.note ? `<div class="msub" style="margin-top:6px">💬 ${esc(m.note)}</div>` : ''}
    </button>`;
  }).join('');
  $$('.mcard', el).forEach(b => b.onclick = () => openRoom(b.dataset.id));
  fetchListRoutes(list.map(x => x.m));
}
function zmanHint(t, z){
  const now = Date.now();
  if (t === 'shacharit') return now < z.tfila ? `סוף זמן תפילה היום: ${fmtT(z.tfila)} · חצות: ${fmtT(z.chatzot)}` : `סוף זמן תפילה (${fmtT(z.tfila)}) כבר עבר. אפשר להתפלל עד חצות (${fmtT(z.chatzot)}).`;
  if (t === 'mincha') return `מנחה גדולה ${fmtT(z.minchaG)} · שקיעה ${fmtT(z.sunset)}`;
  return `צאת הכוכבים ${fmtT(z.tzeit)} · פלג המנחה ${fmtT(z.plag)}`;
}
function renderMyBar(){
  const bar = $('#mybar');
  const m = [...docs.values()].find(x => alive(x) && (M.isIn(x) || M.isOwner(x)));
  if (!m || !$('#room').hidden){ bar.hidden = true; return; }
  const st = statusOf(m);
  bar.hidden = false;
  bar.className = M.full(m) ? '' : 'notfull';
  bar.innerHTML = `<span>${M.isOwner(m) ? '⭐ המניין שלך' : '🙋 המניין שלך'}: ${TYPES[m.type].n} · ${M.count(m)}/10 ${M.full(m) ? '✅' : ''}<br><small>${st.t}</small></span><span>‹</span>`;
  bar.onclick = () => openRoom(m.id);
}

/* ================= MAPS ================= */
const TILE = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const tiles = () => L.tileLayer(TILE, {maxZoom:20, subdomains:'abcd', attribution:'© OpenStreetMap © CARTO'});
const meIcon = () => L.divIcon({className:'', html:'<div class="medot"></div>', iconSize:[18, 18], iconAnchor:[9, 9]});
const pinIcon = m => L.divIcon({className:'', html:`<div class="pin${M.full(m) ? ' full' : ''}"><span>${M.count(m)}</span></div>`, iconSize:[38, 38], iconAnchor:[19, 40]});
let bigMap = null, bigLayer = null, bigMe = null;
function renderBigMap(){
  if (view !== 'map') return;
  if (!bigMap){
    bigMap = L.map('bigmap', {zoomControl:true, attributionControl:true}).setView([me.lat, me.lng], 15);
    tiles().addTo(bigMap);
    bigLayer = L.layerGroup().addTo(bigMap);
    bigMe = L.marker([me.lat, me.lng], {icon:meIcon(), interactive:false}).addTo(bigMap);
  }
  setTimeout(() => bigMap.invalidateSize(), 50);
  bigLayer.clearLayers();
  const list = filtered();
  for (const {m, w} of list){
    L.marker([m.lat, m.lng], {icon:pinIcon(m)}).addTo(bigLayer)
      .bindTooltip(`${TYPES[m.type].n} · ${esc(m.place)} · ${Math.round(w.min)} דק'`, {direction:'top', offset:[0, -36]})
      .on('click', () => openRoom(m.id));
  }
  $('#btnHereIsMe').hidden = me.real;
}
function updateMeMarkers(){
  if (bigMe) bigMe.setLatLng([me.lat, me.lng]);
  if (roomMap && roomMe) roomMe.setLatLng([me.lat, me.lng]);
}

/* ================= ROOM ================= */
let openId = null, roomMap = null, roomMe = null, roomRoute = null, chatUnsub = null, roomOwnerBuilt = false, lastChat = [];
function openRoom(id){
  const m = docs.get(id); if (!m) return;
  if (openId !== id) closeRoom(true);
  openId = id;
  history.pushState({room:id}, '', '?m=' + id);
  const el = $('#room');
  el.hidden = false; $('#mybar').hidden = true;
  el.innerHTML = `<div class="inner">
    <div class="phead"><button class="back" id="rBack">→</button><h2 id="rTitle"></h2><button class="iconbtn" id="rShare" title="שיתוף">📤</button></div>
    <div id="rmap" class="rmap" dir="ltr"></div>
    <div class="routeinfo" id="rRoute"></div>
    <div class="row" style="margin-bottom:10px">
      <a class="btn" id="rGmaps" target="_blank" rel="noopener">🧭 ניווט בגוגל מפות</a>
      <a class="btn" id="rWaze" target="_blank" rel="noopener">🚙 Waze</a>
    </div>
    <div class="card" id="rInfo"></div>
    <div id="rActions"></div>
    <div id="rOwner"></div>
    <div class="sect">👥 מי בפנים</div><div class="members" id="rMembers"></div>
    <div class="sect">💬 צ'אט המניין</div>
    <div class="card"><div class="chat" id="rChat"><div class="small">אין הודעות עדיין</div></div>
      <form class="chatin" id="rChatForm"><input type="text" id="rChatIn" maxlength="200" placeholder="כתוב הודעה… (למשל: אני מביא עוד 2)" autocomplete="off"><button class="btn pri">שלח</button></form>
    </div>
  </div>`;
  $('#rBack').onclick = () => history.back();
  $('#rShare').onclick = () => share(docs.get(openId));
  $('#rChatForm').onsubmit = e => { e.preventDefault(); sendChat(); };
  roomOwnerBuilt = false;
  // map
  roomMap = L.map('rmap', {zoomControl:false, attributionControl:true});
  tiles().addTo(roomMap);
  L.marker([m.lat, m.lng], {icon:pinIcon(m)}).addTo(roomMap);
  roomMe = L.marker([me.lat, me.lng], {icon:meIcon(), interactive:false}).addTo(roomMap);
  roomMap.fitBounds(L.latLngBounds([[m.lat, m.lng], [me.lat, me.lng]]).pad(0.25), {maxZoom:17});
  $('#rGmaps').href = `https://www.google.com/maps/dir/?api=1&destination=${m.lat},${m.lng}&travelmode=walking`;
  $('#rWaze').href = `https://waze.com/ul?ll=${m.lat},${m.lng}&navigate=yes`;
  fetchRoute(m).then(r => {
    if (!r || openId !== id || !roomMap) return;
    if (roomRoute) roomRoute.remove();
    roomRoute = L.polyline(r.geo, {color:'#2f80ff', weight:6, opacity:.85}).addTo(roomMap);
    roomMap.fitBounds(roomRoute.getBounds().pad(0.2), {maxZoom:17});
    renderRoom(); renderList();
  });
  // chat
  const {F} = db;
  chatUnsub = F.onSnapshot(F.query(F.collection(db.fs, 'minyanim', id, 'chat'), F.orderBy('t'), F.limitToLast(60)), s => {
    const msgs = s.docs.map(d => d.data());
    const fresh = msgs.filter(x => x.uid !== uid && !lastChat.some(y => y.t === x.t && y.uid === x.uid));
    if (lastChat.length && fresh.length) beep(false);
    lastChat = msgs;
    renderChat();
  }, () => {});
  renderRoom();
}
function closeRoom(silent){
  if (chatUnsub){ chatUnsub(); chatUnsub = null; }
  if (roomMap){ roomMap.remove(); roomMap = null; roomRoute = null; roomMe = null; }
  lastChat = []; openId = null;
  $('#room').hidden = true; $('#room').innerHTML = '';
  if (!silent){ renderMyBar(); renderList(); }
}
function renderRoom(){
  if (!openId) return;
  const m = docs.get(openId);
  if (!m){ toast('המניין נסגר'); history.replaceState(null, '', location.pathname); closeRoom(); return; }
  const t = TYPES[m.type], st = statusOf(m), w = walkOf(m);
  $('#rTitle').textContent = `${t.i} ${t.n} · ${m.place}`;
  $('#rRoute').innerHTML = `<div class="walk${w.real ? '' : ' est'}"><b>${Math.max(1, Math.round(w.min))}</b><small>דק' הליכה${w.real ? ' לפי הדרך' : ' (הערכה)'}</small></div>
    <div class="walk"><b>${w.km < 1 ? Math.round(w.km * 1000) : w.km.toFixed(1)}</b><small>${w.km < 1 ? 'מטר' : 'ק"מ'}</small></div>
    <div class="walk"><b>${fmtT(Date.now() + w.min * MIN)}</b><small>תגיע בערך</small></div>`;
  $('#rInfo').innerHTML = `<div class="status">${st.t}</div>
    ${M.full(m) ? `<div class="badge ok" style="font-size:16px">🎉 יש מניין! ${M.count(m)} אנשים</div>` : `<div class="small">חסרים עוד ${10 - M.count(m)} למניין</div>`}
    ${bar(m, true)}
    <div class="small" style="margin-top:6px">${whoLine(m)}</div>
    <div class="small" style="margin-top:6px">${NUSACH[m.nusach] || ''} · פתח: ${esc(m.ownerName || '')} · עודכן ${fmtT(m.updated || m.created)}</div>
    ${arriveHint(m)}
    ${m.note ? `<div class="note">💬 ${esc(m.note)}</div>` : ''}`;
  // join / leave
  const my = m.members && m.members[uid];
  const act = $('#rActions');
  if (M.isOwner(m)) act.innerHTML = '';
  else if (!my) act.innerHTML = `<div class="row" style="margin-bottom:10px"><button class="btn pri" data-j="coming">🚶 אני בא!</button><button class="btn ok" data-j="here">🙋 אני כבר כאן</button></div>`;
  else act.innerHTML = `<div class="card" style="text-align:center"><b>${my.s === 'here' ? '🙋 סימנת שאתה במניין' : `🚶 סימנת שאתה בדרך${my.eta ? ` (מגיע ~${fmtT(my.eta)})` : ''}`}</b>
      <div class="row" style="margin-top:10px">${my.s !== 'here' ? '<button class="btn ok" data-j="here">🙋 הגעתי</button>' : ''}<button class="btn bad" data-j="leave">יציאה מהמניין</button></div></div>`;
  $$('[data-j]', act).forEach(b => b.onclick = async () => {
    b.disabled = true;
    if (b.dataset.j === 'leave') await leave(m); else { if (!S.name) await askName(); await join(m, b.dataset.j); }
  });
  // owner panel
  if (M.isOwner(m)) buildOwner(m); else $('#rOwner').innerHTML = '';
  // members
  const mem = M.members(m).sort((a, b) => (a[1].s === 'here' ? 0 : 1) - (b[1].s === 'here' ? 0 : 1) || a[1].t - b[1].t);
  $('#rMembers').innerHTML = mem.map(([k, v]) => `<div class="member"><span>${v.s === 'here' ? '🙋' : '🚶'} ${esc(v.n || 'אורח')}${k === m.owner ? ' ⭐' : ''}${k === uid ? ' (אתה)' : ''}</span><small>${v.s === 'here' ? 'כאן' : v.eta ? `בדרך · ~${fmtT(v.eta)}` : 'בדרך'}</small></div>`).join('')
    + (m.extra ? `<div class="member"><span>👤 עוד ${m.extra} בלי האפליקציה</span><small>לפי מי שפתח</small></div>` : '');
}
function buildOwner(m){
  const box = $('#rOwner');
  const inApp = Object.keys(m.members || {}).length;
  if (!roomOwnerBuilt){
    roomOwnerBuilt = true;
    box.innerHTML = `<div class="card owner"><h3>⭐ ניהול המניין</h3><div class="small">רק אתה רואה את זה, כי פתחת את המניין.</div>
      <label class="lbl">כמה אנשים יש בפועל?</label>
      <div class="stepper"><button data-d="1">+</button><b id="oCount"></b><button data-d="-1">−</button></div>
      <div class="hint" id="oCountHint"></div>
      <label class="lbl">מתי מתחילים?</label>
      <div class="chips" style="flex-wrap:wrap">
        ${[5, 10, 15, 20, 30].map(x => `<button data-in="${x}">בעוד ${x} דק'</button>`).join('')}
        <input type="time" id="oTime" style="width:auto;padding:6px 10px">
      </div>
      <div class="row"><button class="btn" data-st="now">▶️ מתחילים עכשיו</button><button class="btn ok" data-st="started">✅ התחילו</button></div>
      <label class="lbl">תיאור / הערה</label>
      <textarea id="oNote" maxlength="300" placeholder="למשל: קומה 2, הדלת השמאלית. צריך עוד 2 לקדיש."></textarea>
      <div class="row" style="margin-top:6px"><button class="btn" id="oSaveNote">💾 שמור תיאור</button></div>
      <div class="row" style="margin-top:14px"><button class="btn bad" id="oClose">🗑️ סגור את המניין</button></div>
    </div>`;
    $('#oNote').value = m.note || '';
    let pending = null, timer = null;
    $$('[data-d]', box).forEach(b => b.onclick = () => {
      const cur = docs.get(openId); if (!cur) return;
      const minN = Object.keys(cur.members || {}).length;
      const n = Math.max(minN, (pending ?? M.count(cur)) + +b.dataset.d);
      pending = n; $('#oCount').textContent = n;
      clearTimeout(timer);
      timer = setTimeout(() => { const c = docs.get(openId); pending = null; if (c) ownerUpdate(c, {extra:Math.max(0, n - Object.keys(c.members || {}).length)}); }, 700);
    });
    box._pending = () => pending;
    $$('[data-in]', box).forEach(b => b.onclick = () => ownerUpdate(docs.get(openId), {status:'wait', startAt:Date.now() + b.dataset.in * MIN}));
    $('#oTime').onchange = e => {
      const [h, mi] = e.target.value.split(':').map(Number); if (isNaN(h)) return;
      const d = new Date(); d.setHours(h, mi, 0, 0);
      if (d < Date.now() - 30 * MIN) d.setDate(d.getDate() + 1);
      ownerUpdate(docs.get(openId), {status:'wait', startAt:+d});
    };
    $$('[data-st]', box).forEach(b => b.onclick = () => ownerUpdate(docs.get(openId), {status:b.dataset.st, startAt:Date.now()}));
    $('#oSaveNote').onclick = () => { ownerUpdate(docs.get(openId), {note:$('#oNote').value.trim().slice(0, 300)}); toast('✔️ התיאור נשמר'); };
    $('#oClose').onclick = () => confirmBox('לסגור את המניין?', 'המניין יימחק ואנשים לא יראו אותו יותר.', 'סגור', async () => { await closeMinyan(docs.get(openId)); });
  }
  if (box._pending && box._pending() == null) $('#oCount').textContent = M.count(m);
  $('#oCountHint').textContent = `באפליקציה: ${inApp}${m.extra ? ` · עוד ${m.extra} בלי אפליקציה` : ''}. אם מישהו שספרת הצטרף אחר כך באפליקציה, תוריד אחד.`;
}
function renderChat(){
  const el = $('#rChat'); if (!el) return;
  if (!lastChat.length){ el.innerHTML = '<div class="small">אין הודעות עדיין</div>'; return; }
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  el.innerHTML = lastChat.map(x => `<div class="msg${x.uid === uid ? ' mine' : ''}"><small>${esc(x.n)} · ${fmtT(x.t)}</small>${esc(x.text)}</div>`).join('');
  if (atBottom || true) el.scrollTop = el.scrollHeight;
}
async function sendChat(){
  const inp = $('#rChatIn'), text = inp.value.trim();
  if (!text || !openId) return;
  if (!S.name) await askName();
  inp.value = '';
  const {F} = db;
  try { await F.addDoc(F.collection(db.fs, 'minyanim', openId, 'chat'), {uid, n:S.name || 'אורח', text:text.slice(0, 200), t:Date.now()}); }
  catch(e){ toast('⚠️ ההודעה לא נשלחה'); inp.value = text; }
}
async function share(m){
  if (!m) return;
  const url = location.origin + location.pathname + '?m=' + m.id;
  const st = statusOf(m);
  const text = `${TYPES[m.type].i} מניין ${TYPES[m.type].n} ב${m.place}\n${M.count(m)}/10 ${M.full(m) ? '✅ יש מניין' : `· חסרים ${10 - M.count(m)}`}\n${st.t}\nבואו! ${url}`;
  if (navigator.share){ try { await navigator.share({title:'מניין עכשיו', text}); return; } catch(e){ if (e.name === 'AbortError') return; } }
  window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
}
function autoArrive(){
  // אם סימנת "בדרך" והגעת למקום, מסמנים "כאן" לבד
  for (const m of docs.values()){
    const my = m.members && m.members[uid];
    if (my && my.s === 'coming' && me.real && distM(me, m) < 40 + Math.min(me.acc || 0, 60)){
      join(m, 'here'); toast(`🙋 הגעת! סימנתי שאתה במניין ב${esc(m.place)}`);
    }
  }
}

/* ================= CREATE ================= */
let pickMap = null;
function openCreate(){
  if (connState !== 'ok' && connState !== 'connecting'){ toast('אין חיבור לשרת כרגע'); }
  const el = $('#create');
  el.hidden = false;
  history.pushState({create:1}, '', location.pathname + '#new');
  let ctype = type, startIn = 0;
  el.innerHTML = `<div class="inner">
    <div class="phead"><button class="back" id="cBack">→</button><h2>➕ פתיחת מניין</h2></div>
    <nav class="seg small" id="cType" style="margin:0 0 6px">${Object.entries(TYPES).map(([k, v]) => `<button data-t="${k}">${v.i} ${v.n}</button>`).join('')}</nav>
    <label class="lbl">📍 איפה?</label>
    <div class="pickmap"><div id="pmap" style="height:100%" dir="ltr"></div><div class="center">📍</div></div>
    <div class="hint">הזז את המפה כך שהסיכה תהיה בדיוק על המקום.</div>
    <input type="text" id="cPlace" maxlength="120" placeholder="שם המקום, למשל: בית הכנסת אוהל יצחק / הלובי בבניין 5">
    <label class="lbl">⏱️ מתי מתחילים?</label>
    <div class="chips" id="cStart" style="flex-wrap:wrap">
      <button data-s="0" class="on">עכשיו</button>${[5, 10, 15, 20, 30, 45].map(x => `<button data-s="${x}">בעוד ${x} דק'</button>`).join('')}
      <input type="time" id="cTime" style="width:auto;padding:6px 10px">
    </div>
    <label class="lbl">👥 כמה אנשים כבר יש איתך? (כולל אותך)</label>
    <div class="stepper"><button data-cd="1">+</button><b id="cCount">1</b><button data-cd="-1">−</button></div>
    <label class="lbl">📖 נוסח</label>
    <select id="cNusach">${Object.entries(NUSACH).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
    <label class="lbl">💬 תיאור (לא חובה)</label>
    <textarea id="cNote" maxlength="300" placeholder="למשל: בחניה מאחורי הבניין. יש ספר תורה."></textarea>
    <label class="lbl">🙂 השם שלך</label>
    <input type="text" id="cName" maxlength="30" placeholder="איך יראו אותך ברשימה">
    <div class="hint" id="cZman"></div>
    <button class="btn pri block" id="cGo" style="margin-top:16px;font-size:18px;padding:16px">🕍 פתח את המניין</button>
  </div>`;
  $('#cName').value = S.name;
  $('#cNusach').value = S.nusach;
  const setType = t => { ctype = t; $$('#cType button').forEach(b => b.classList.toggle('on', b.dataset.t === t)); const z = nowZman().z; $('#cZman').textContent = '🕰️ ' + zmanHint(t, z); };
  setType(ctype);
  $$('#cType button').forEach(b => b.onclick = () => setType(b.dataset.t));
  $$('#cStart [data-s]').forEach(b => b.onclick = () => { startIn = +b.dataset.s; $('#cTime').value = ''; $$('#cStart button').forEach(x => x.classList.toggle('on', x === b)); });
  let startAt = null;
  $('#cTime').onchange = e => {
    const [h, mi] = e.target.value.split(':').map(Number); if (isNaN(h)) return;
    const d = new Date(); d.setHours(h, mi, 0, 0); if (d < Date.now() - 30 * MIN) d.setDate(d.getDate() + 1);
    startAt = +d; startIn = null; $$('#cStart button').forEach(x => x.classList.remove('on'));
  };
  let count = 1;
  $$('[data-cd]').forEach(b => b.onclick = () => { count = Math.min(30, Math.max(1, count + +b.dataset.cd)); $('#cCount').textContent = count; });
  $('#cBack').onclick = () => history.back();
  pickMap = L.map('pmap', {zoomControl:false}).setView([me.lat, me.lng], 17);
  tiles().addTo(pickMap);
  L.marker([me.lat, me.lng], {icon:meIcon(), interactive:false}).addTo(pickMap);
  setTimeout(() => pickMap && pickMap.invalidateSize(), 60);
  let typedPlace = false, revTimer = null;
  $('#cPlace').oninput = () => { typedPlace = !!$('#cPlace').value.trim(); };
  const reverse = () => {
    clearTimeout(revTimer);
    revTimer = setTimeout(async () => {
      if (typedPlace || !pickMap) return;
      const c = pickMap.getCenter();
      try {
        const j = await (await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${c.lat}&lon=${c.lng}&zoom=18&accept-language=he`)).json();
        const a = j.address || {};
        const name = j.name || '';
        const street = [a.road, a.house_number].filter(Boolean).join(' ');
        const txt = [name, street].filter(Boolean).filter((x, i, arr) => arr.indexOf(x) === i).join(', ') || (j.display_name || '').split(',').slice(0, 2).join(',');
        if (!typedPlace && txt) $('#cPlace').placeholder = txt, $('#cPlace').dataset.auto = txt;
      } catch(e){}
    }, 600);
  };
  pickMap.on('moveend', reverse); reverse();
  $('#cGo').onclick = async () => {
    const name = $('#cName').value.trim();
    if (!name){ $('#cName').focus(); toast('כתוב את השם שלך, כדי שאנשים יידעו מי פתח'); return; }
    S.name = name; S.nusach = $('#cNusach').value; save();
    const place = $('#cPlace').value.trim() || $('#cPlace').dataset.auto || 'מניין';
    const c = pickMap.getCenter();
    const sa = startIn != null ? Date.now() + startIn * MIN : startAt;
    $('#cGo').disabled = true; $('#cGo').innerHTML = '<span class="spin">🔄</span> פותח…';
    try {
      if (!db) throw new Error('אין חיבור');
      const id = await createMinyan({type:ctype, lat:c.lat, lng:c.lng, place, note:$('#cNote').value.trim(), nusach:S.nusach, startAt:sa, count});
      type = ctype; store.set('type', type); syncTypeSeg();
      closeCreate(true);
      history.replaceState(null, '', location.pathname);
      pendingOpen = null;
      const wait = Date.now();
      const tryOpen = () => { if (docs.has(id)) openRoom(id); else if (Date.now() - wait < 8000) setTimeout(tryOpen, 150); };
      tryOpen();
      toast('🕍 המניין נפתח! אנשים בסביבה יראו אותו. כדאי לשתף גם בווטסאפ 📤', null, true);
      askNotif();
    } catch(e){
      $('#cGo').disabled = false; $('#cGo').textContent = '🕍 פתח את המניין';
      toast('⚠️ לא הצלחתי לפתוח: ' + (e.code === 'permission-denied' ? 'השרת עוד לא מוכן (כללי Firebase)' : (e.code || e.message)));
    }
  };
}
function closeCreate(silent){
  if (pickMap){ pickMap.remove(); pickMap = null; }
  $('#create').hidden = true; $('#create').innerHTML = '';
}

/* ================= ZMANIM VIEW ================= */
function renderZmanim(){
  const el = $('#zmanim');
  const z = zmanim(), now = Date.now();
  let heb = '';
  try { heb = new Intl.DateTimeFormat('he-u-ca-hebrew', {weekday:'long', day:'numeric', month:'long', year:'numeric'}).format(new Date()); } catch(e){}
  const rows = [
    ['עלות השחר', z.alot], ['זמן טלית ותפילין (משיכיר)', z.misheyakir], ['הנץ החמה', z.sunrise],
    ['סוף זמן קריאת שמע (גר"א)', z.shma], ['סוף זמן תפילה (גר"א)', z.tfila], ['חצות היום', z.chatzot],
    ['מנחה גדולה', z.minchaG], ['מנחה קטנה', z.minchaK], ['פלג המנחה', z.plag],
    ['שקיעה', z.sunset], ['צאת הכוכבים', z.tzeit],
  ];
  const nextIdx = rows.findIndex(r => r[1] > now);
  const nz = nowZman();
  el.innerHTML = `<div class="card"><div class="mtitle">🕰️ זמני היום</div><div class="msub">${heb}${me.real ? '' : ' · לפי מיקום משוער'}</div>
    <div class="note" style="margin-top:10px">עכשיו הזמן ל<b>${TYPES[nz.type].n}</b>. ${zmanHint(nz.type, z)}</div></div>
    <div class="card">${rows.map((r, i) => `<div class="zrow${r[1] < now ? ' past' : ''}${i === nextIdx ? ' next' : ''}"><span>${r[0]}</span><b>${r[1] ? fmtT(r[1]) : '-'}</b></div>`).join('')}</div>
    <p class="small">הזמנים מחושבים לפי המיקום שלך (שעה זמנית לפי הגר"א; עלות השחר 16.1°, צאת הכוכבים 8.5°). הם עשויים להיות שונים בדקה או שתיים מלוחות אחרים.</p>`;
}

/* ================= SETTINGS ================= */
function renderSettings(){
  const el = $('#settings');
  el.innerHTML = `<div class="card">
    <label class="lbl" style="margin-top:0">🙂 השם שלך</label><input type="text" id="sName" maxlength="30" placeholder="איך יראו אותך במניין">
    <label class="lbl">🚶 עד כמה רחוק לחפש?</label>
    <div class="chips" id="sRad" style="flex-wrap:wrap">${[5, 10, 15, 20, 30, 60, 0].map(r => `<button data-r="${r}" class="${S.radius === r ? 'on' : ''}">${r ? r + " דק' הליכה" : 'בלי הגבלה'}</button>`).join('')}</div>
    <label class="lbl">📖 הנוסח שלי (מסנן את הרשימה)</label>
    <select id="sNusach">${Object.entries(NUSACH).map(([k, v]) => `<option value="${k}">${k === 'any' ? 'הכל' : v}</option>`).join('')}</select>
  </div>
  <div class="card">
    <div class="toggle"><span>🔔 התראות (מישהו הצטרף, יש מניין, מתחילים)</span><input type="checkbox" id="sNotif"></div>
    <div class="toggle"><span>📣 להודיע כשנפתח מניין חדש בסביבה (מהסוג שבחרתי למעלה)</span><input type="checkbox" id="sWatch"></div>
    <div class="toggle"><span>🔊 צליל בהתראות</span><input type="checkbox" id="sSound"></div>
    <div class="hint">ההתראות עובדות כשהאפליקציה פתוחה או ברקע בטלפון.</div>
  </div>
  <div class="card">
    <label class="lbl" style="margin-top:0">🎨 תצוגה</label>
    <div class="chips" id="sTheme">${[['auto', 'אוטומטי'], ['dark', '🌙 כהה'], ['light', '☀️ בהיר']].map(([k, n]) => `<button data-th="${k}" class="${S.theme === k ? 'on' : ''}">${n}</button>`).join('')}</div>
  </div>
  <div class="card small">
    <b>איך זה עובד?</b><br>
    1. בוחרים שחרית, מנחה או ערבית.<br>
    2. רואים את כל המניינים בסביבה, כמה אנשים יש בכל אחד, ובכמה דקות הליכה הוא.<br>
    3. לוחצים על מניין כדי לראות את הדרך במפה, ולוחצים "אני בא!".<br>
    4. אין מניין? פותחים אחד, ומי שבסביבה מקבל הודעה.<br>
    5. כשיש 10 אנשים, כולם מקבלים הודעה "🎉 יש מניין!".<br><br>
    מפות © OpenStreetMap. מסלולי הליכה: OSRM.
  </div>`;
  $('#sName').value = S.name;
  $('#sName').onchange = e => { S.name = e.target.value.trim(); save(); toast('✔️ נשמר'); };
  $$('#sRad button').forEach(b => b.onclick = () => { S.radius = +b.dataset.r; save(); renderSettings(); renderList(); });
  $('#sNusach').value = S.nusach;
  $('#sNusach').onchange = e => { S.nusach = e.target.value; save(); renderList(); };
  $('#sNotif').checked = S.notif; $('#sWatch').checked = S.watch; $('#sSound').checked = S.sound;
  $('#sNotif').onchange = e => { S.notif = e.target.checked; save(); if (S.notif) askNotif(); };
  $('#sWatch').onchange = e => { S.watch = e.target.checked; save(); if (S.watch) askNotif(); };
  $('#sSound').onchange = e => { S.sound = e.target.checked; save(); if (S.sound) beep(true); };
  $$('#sTheme button').forEach(b => b.onclick = () => { S.theme = b.dataset.th; save(); applyTheme(); renderSettings(); });
}
function applyTheme(){
  const dark = S.theme === 'dark' || (S.theme === 'auto' && !matchMedia('(prefers-color-scheme: light)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('meta[name=theme-color]').content = dark ? '#0f1b33' : '#f3f6fc';
}
function askNotif(){
  if (!('Notification' in window) || Notification.permission !== 'default') return;
  try { Notification.requestPermission(); } catch(e){}
}

/* ================= MODALS ================= */
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
$('#modal').onclick = e => { if (e.target.id === 'modal' && !$('#mName')) $('#modal').hidden = true; };

/* ================= NAV ================= */
function syncTypeSeg(){ $$('#typeSeg button').forEach(b => b.classList.toggle('on', b.dataset.t === type)); }
function setView(v){
  view = v;
  $$('.view').forEach(s => s.classList.toggle('active', s.id === 'v-' + v));
  $$('#bottom button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  $('#typeSeg').style.display = (v === 'list' || v === 'map') ? '' : 'none';
  $('#fabCreate').style.display = (v === 'list' || v === 'map') ? '' : 'none';
  if (v === 'map') renderBigMap();
  if (v === 'zmanim') renderZmanim();
  if (v === 'settings') renderSettings();
}
function renderAll(){
  renderZline(); renderList(); renderMyBar(); renderBigMap();
  if (view === 'zmanim') renderZmanim();
  if (openId) renderRoom();
}
function renderZline(){
  const nz = nowZman(), z = nz.z, now = Date.now();
  let s;
  if (nz.type === 'shacharit') s = now < z.sunrise ? `הנץ ${fmtT(z.sunrise)}` : now < z.tfila ? `סוף זמן תפילה ${fmtT(z.tfila)}` : `חצות ${fmtT(z.chatzot)}`;
  else if (nz.type === 'mincha') s = `שקיעה ${fmtT(z.sunset)}`;
  else s = now < z.tzeit ? `צאת הכוכבים ${fmtT(z.tzeit)}` : `חצות הלילה ${fmtT(z.chatzot + 12 * 36e5)}`;
  $('#zline').textContent = `עכשיו זמן ${TYPES[nz.type].n} · ${s}`;
}
let banners = {};
function showBanner(k, text, btn, fn){
  banners[k] = {text, btn, fn}; drawBanner();
}
function hideBanner(k){ delete banners[k]; drawBanner(); }
function drawBanner(){
  const el = $('#banner'), b = banners.conn || banners.geo;
  if (!b){ el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<span>${esc(b.text)}</span>${b.btn ? `<button>${esc(b.btn)}</button>` : ''}`;
  if (b.btn) $('button', el).onclick = b.fn;
}

$$('#typeSeg button').forEach(b => b.onclick = () => { type = b.dataset.t; store.set('type', type); syncTypeSeg(); renderList(); renderBigMap(); });
$$('#filterChips button').forEach(b => b.onclick = () => { filter = b.dataset.f; $$('#filterChips button').forEach(x => x.classList.toggle('on', x === b)); renderList(); });
$$('#bottom button').forEach(b => b.onclick = () => setView(b.dataset.v));
$('#fabCreate').onclick = () => openCreate();
$('#btnHereIsMe').onclick = () => { if (!bigMap) return; const c = bigMap.getCenter(); me = {lat:c.lat, lng:c.lng, real:false}; store.set('lastPos', {lat:c.lat, lng:c.lng}); toast('📍 המיקום שלך עודכן'); renderAll(); updateMeMarkers(); };
window.addEventListener('popstate', () => {
  if (!$('#create').hidden) closeCreate();
  if (!$('#room').hidden) closeRoom();
  const id = new URLSearchParams(location.search).get('m');
  if (id && docs.has(id)) openRoom(id);
});
let pendingOpen = new URLSearchParams(location.search).get('m');
if (location.hash === '#new') history.replaceState(null, '', location.pathname + location.search);

// התקנה כאפליקציה
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; $('#btnInstall').hidden = false; });
$('#btnInstall').onclick = async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; $('#btnInstall').hidden = true; };
if ('serviceWorker' in navigator && location.protocol === 'https:'){
  navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.open) { if (docs.has(e.data.open)) openRoom(e.data.open); else pendingOpen = e.data.open; } });
}
matchMedia('(prefers-color-scheme: light)').addEventListener('change', applyTheme);

/* ================= START ================= */
(async function start(){
  applyTheme();
  const last = store.get('lastPos', null);
  if (last) me = {...last, real:false};
  syncTypeSeg(); setView('list'); renderZline(); renderList();
  startGeo();
  setInterval(() => { renderZline(); renderList(); renderMyBar(); if (openId) renderRoom(); }, 20000);
  try {
    await Promise.race([connect(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 20000))]);
    subscribe();
  } catch(e){
    console.warn(e);
    setConn('error', 'net');
  }
})();
