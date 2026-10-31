import { api, cachedGet, getToken, setToken } from './api.js';
import { IS_NATIVE } from './config.js';
import { esc, icon, ART as BASE_ART, toast, sheet, stationPicker, delayChip, statusChip, ageText, REPORT_TYPES } from './ui.js';
import { cicon, PIC, colorizeLines, lineInfo } from './icons.js';
import { BIKE_TIPS, FAQ } from './content.js';
import { mountMap, loadLeaflet } from './map.js';

// Leere Zustände als Icon-Illustrationen statt Fotos
const ART = { ...BASE_ART, community: BASE_ART.people, alertsPhoto: BASE_ART.bell, nightPhoto: PIC.moon };

const view = document.getElementById('view');
const titleEl = document.getElementById('title');
const backBtn = document.getElementById('back');
const netEl = document.getElementById('net');

let me = null;
let config = { payments_mode: 'demo' };
let timers = [];
let cleanups = [];
let renderToken = 0;

backBtn.innerHTML = icon('back');
backBtn.addEventListener('click', () => (history.length > 1 ? history.back() : (location.hash = '#/')));
const NAV = { home: ['home', 'Start'], route: ['search', 'Suche'], map: ['map', 'Karte'], community: ['community', 'Community'], account: ['user', 'Profil'] };
for (const [k, [ic, label]] of Object.entries(NAV)) document.querySelector(`[data-tab=${k}]`).innerHTML = `${cicon(ic)}<span>${label}</span>`;
const bellBtn = document.getElementById('bell');
const drawAlertsTab = (unread = 0) => {
  bellBtn.innerHTML = `${cicon('bell')}${unread ? `<span class="badge" aria-hidden="true">${unread > 9 ? '9+' : unread}</span>` : ''}`;
  bellBtn.setAttribute('aria-label', unread ? `Hinweise (${unread} neu)` : 'Hinweise');
};
drawAlertsTab();
document.getElementById('gear').innerHTML = cicon('gear');
new MutationObserver(() => colorizeLines(view)).observe(view, { childList: true, subtree: true });

const setOnline = () => (netEl.hidden = navigator.onLine);
addEventListener('online', setOnline);
addEventListener('offline', setOnline);
setOnline();

// ---------------------------------------------------------------- Favoriten (lokal, mit Konto zusätzlich auf dem Server)
const LOCAL_FAVS = 'tt_favs';
const localFavs = () => JSON.parse(localStorage.getItem(LOCAL_FAVS) || '[]');
const saveLocalFavs = (f) => localStorage.setItem(LOCAL_FAVS, JSON.stringify(f));

async function getFavs() {
  if (me) {
    try {
      return (await api('GET', '/favorites')).favorites;
    } catch {
      return [];
    }
  }
  return localFavs();
}

const sameFav = (a, b) =>
  a.kind === b.kind && +a.from_station_id === +b.from_station_id && (+a.to_station_id || 0) === (+b.to_station_id || 0);

async function toggleFav(fav) {
  const favs = await getFavs();
  const existing = favs.find((f) => sameFav(f, fav));
  if (me) {
    if (existing) await api('DELETE', `/favorites/${existing.id}`);
    else await api('POST', '/favorites', { kind: fav.kind, from_station_id: fav.from_station_id, to_station_id: fav.to_station_id });
  } else if (existing) {
    saveLocalFavs(favs.filter((f) => !sameFav(f, fav)));
  } else {
    saveLocalFavs([...favs, { ...fav, id: Date.now() }]);
  }
  return !existing;
}

async function pushLocalFavs() {
  for (const f of localFavs()) {
    try {
      await api('POST', '/favorites', { kind: f.kind, from_station_id: f.from_station_id, to_station_id: f.to_station_id });
    } catch {
      /* ignorieren */
    }
  }
  saveLocalFavs([]);
}

// ---------------------------------------------------------------- Hilfen
function getPosition(timeout = 5000) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({});
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => resolve({}),
      { enableHighAccuracy: true, timeout, maximumAge: 30000 }
    );
  });
}

const needLogin = (why) => {
  sessionStorage.setItem('tt_next', location.hash);
  toast(why || 'Bitte melde dich zuerst an.', true);
  location.hash = '#/account';
};

const spinner = (t = 'Lädt …') => `<div class="spinner" role="status">${esc(t)}</div>`;
const errorBox = (e) => `<div class="error-box" role="alert">${esc(e.message || e)}</div>`;

function setScreen(title, { back = true, tab = '' } = {}) {
  view.classList.remove('map-screen');
  titleEl.textContent = title;
  document.title = title === 'TrustTrain' ? title : `${title} · TrustTrain`;
  backBtn.hidden = !back;
  document.querySelectorAll('.tabs a').forEach((a) => {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

const every = (ms, fn) => timers.push(setInterval(fn, ms));

// ---------------------------------------------------------------- Gemeinsame Bausteine
const sectHead = (ic, title, more = '') => `<div class="sect-head"><h2>${cicon(ic)} ${esc(title)}</h2>${more}</div>`;
const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${m} m`);

// Link zur Buchungsseite von bahn.de mit Start, Ziel und Zeit. TrustTrain verkauft selbst keine Tickets.
function ticketUrl(from, to, time) {
  const d = new Date();
  if (/^\d{1,2}:\d{2}$/.test(time || '')) d.setHours(+time.split(':')[0], +time.split(':')[1], 0, 0);
  const p = (n) => String(n).padStart(2, '0');
  const iso = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`;
  return `https://www.bahn.de/buchung/fahrplan/suche#sts=true&so=${encodeURIComponent(from.name)}&zo=${encodeURIComponent(to.name)}&kl=2&hd=${encodeURIComponent(iso)}`;
}

// Von/Nach-Formular, auf Start- und Suchseite gleich.
function routeForm(box, { from = null, to = null, via = null, time = '', onSearch }) {
  const st = { from, to, via };
  box.innerHTML = `<div class="rf"><div class="fields"><div id="pf"></div><div id="pt"></div></div>
    <button class="swap-btn" id="swap" type="button" aria-label="Start und Ziel tauschen">${cicon('swap')}</button></div>
    <button class="linkbtn via-toggle" id="add-via" type="button" ${via ? 'hidden' : ''}>${cicon('plus')} Zwischenstopp hinzufügen</button>
    <div class="via-row" id="via-row" ${via ? '' : 'hidden'}><div id="pv"></div>
      <button class="btn secondary remove-via" id="remove-via" type="button">${icon('x-circle')} Entfernen</button></div>
    <div class="when"><div><label for="tm">Abfahrt (leer = jetzt)</label><input id="tm" type="time" value="${esc(time)}"></div></div>
    <div class="rf-actions">
      <button class="btn big block" id="go" type="button">${cicon('search')} Verbindung suchen</button>
      <div class="seg"><button class="btn secondary" id="favr" type="button">${cicon('star')} Strecke merken</button>
      <a class="btn secondary ticketlink" id="tk" target="_blank" rel="noopener noreferrer" aria-disabled="true">${cicon('ticket')} Ticket kaufen</a></div>
    </div>
    <p class="fine">${cicon('shield')}<span>TrustTrain verkauft keine Tickets. „Ticket kaufen“ öffnet die Buchungsseite der Bahn mit deiner Suche.</span></p>`;
  const tm = box.querySelector('#tm');
  const tk = box.querySelector('#tk');
  const sync = () => {
    const ok = st.from && st.to;
    tk.setAttribute('aria-disabled', String(!ok));
    if (ok) tk.href = ticketUrl(st.from, st.to, tm.value);
    else tk.removeAttribute('href');
  };
  const placePlaceholder = 'Stadt, Bahnhof oder Haltestelle';
  const pf = stationPicker(box.querySelector('#pf'), { label: 'Von', placeholder: placePlaceholder, initial: from, onPick: (s) => ((st.from = s), sync()) });
  const pt = stationPicker(box.querySelector('#pt'), { label: 'Nach', placeholder: placePlaceholder, initial: to, onPick: (s) => ((st.to = s), sync()) });
  const pv = stationPicker(box.querySelector('#pv'), { label: 'Über', placeholder: 'Stadt oder Haltestelle suchen', initial: via, onPick: (s) => ((st.via = s), sync()) });
  const viaRow = box.querySelector('#via-row');
  const viaToggle = box.querySelector('#add-via');
  const showVia = (show) => {
    viaRow.hidden = !show;
    viaToggle.hidden = show;
    if (!show) {
      pv.set(null);
      st.via = null;
      sync();
    } else {
      box.querySelector('#pv input').focus();
    }
  };
  viaToggle.addEventListener('click', () => showVia(true));
  box.querySelector('#remove-via').addEventListener('click', () => showVia(false));
  tm.addEventListener('input', sync);
  box.querySelector('#swap').addEventListener('click', () => {
    const [a, b] = [st.from, st.to];
    pf.set(b);
    pt.set(a);
    st.from = b;
    st.to = a;
    sync();
  });
  box.querySelector('#go').addEventListener('click', () => {
    if (!st.from || !st.to) return toast('Bitte wähle Start und Ziel aus der Liste aus.', true);
    if (st.via && [st.from.id, st.to.id].includes(st.via.id)) return toast('Der Zwischenstopp muss ein anderer Bahnhof sein.', true);
    onSearch(st.from, st.to, tm.value, st.via);
  });
  box.querySelector('#favr').addEventListener('click', async () => {
    if (!st.from || !st.to) return toast('Bitte wähle Start und Ziel aus der Liste aus.', true);
    try {
      toast((await toggleFav({ kind: 'route', from_station_id: st.from.id, to_station_id: st.to.id, from_name: st.from.name, to_name: st.to.name })) ? 'Strecke gespeichert' : 'Strecke entfernt');
    } catch (e) {
      toast(e.message, true);
    }
  });
  sync();
  return st;
}

function favRows(favs) {
  return favs
    .map((f) =>
      f.kind === 'station'
        ? `<a class="row" href="#/station/${f.from_station_id}">${cicon('pin')}<span class="main"><b>${esc(f.from_name || f.name)}</b><span class="muted small">Abfahrten ansehen</span></span></a>`
        : `<a class="row" href="#/route?from=${f.from_station_id}&to=${f.to_station_id}">${cicon('route')}<span class="main"><b>${esc(f.from_name || f.name)} → ${esc(f.to_name || f.name2)}</b><span class="muted small">Verbindung suchen</span></span></a>`
    )
    .join('');
}

const disruptionRow = (d) => {
  const cancelled = d.kind === 'cancelled';
  const label = cancelled ? 'Fällt aus' : d.kind === 'defect' ? 'Defekt' : `+${d.delay} Min.`;
  return `<li><a class="row dis ${cancelled ? 'cancelled' : ''} ${d.source}" href="#/trip/${d.trip_id}">${cicon(cancelled ? 'warn' : 'clock')}<span class="main"><b><span class="line-tag">${esc(d.line)}</span>${esc(d.headsign)}</b>
    <span class="chip ${cancelled ? 'bad' : 'warn'}">${esc(label)}</span> <span class="muted small">${d.source === 'official' ? 'Offiziell' : 'Von Fahrgästen bestätigt'}</span></span></a></li>`;
};

const lockCard = () =>
  me ? '' : `<div class="card lockcard">${cicon('lock')}<div><b>Du liest als Gast mit.</b><br><span class="small">Zum Schreiben und Bestätigen brauchst du ein kostenloses Konto. Du bleibst anonym.</span></div></div>`;

function bindCommunity(favs, limit) {
  let mode = 'all';
  loadCommunity(mode, { limit });
  document.getElementById('quick').addEventListener('click', () => quickReport(favs));
  view.querySelectorAll('[data-c]').forEach((b) =>
    b.addEventListener('click', () => {
      if (b.dataset.c === 'mine' && !me) return needLogin('Für deine Favoriten brauchst du ein Konto.');
      mode = b.dataset.c;
      view.querySelectorAll('[data-c]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      loadCommunity(mode, { limit });
    })
  );
  every(30000, () => !document.getElementById('sheet-root').firstChild && loadCommunity(mode, { limit, silent: true }));
}

const communityControls = () => `${lockCard()}
  <button class="btn big block" id="quick" type="button">${cicon(me ? 'train' : 'lock')} ${me ? 'Meinen Zug melden' : 'Anmelden und mitschreiben'}</button>
  <div class="seg" role="group" aria-label="Filter"><button class="btn secondary" data-c="all" aria-pressed="true">Alle</button><button class="btn secondary" data-c="mine" aria-pressed="false">Meine Favoriten</button></div>
  <div id="cfeed">${spinner()}</div>`;

// ---------------------------------------------------------------- Start
async function homeView() {
  setScreen('TrustTrain', { back: false, tab: 'home' });
  const myToken = renderToken;
  view.innerHTML = `
    <section class="hero glass"><h2>Wohin soll's gehen?</h2><p class="sub muted">Fahrplan, Live-Stand und Community – alles an einem Ort.</p><div id="rform"></div></section>
    <div class="qgrid">
      <a class="tile" href="#/map">${cicon('map')}<span>Karte</span></a>
      <a class="tile" href="#/map?locate=1">${cicon('near')}<span>In meiner Nähe</span></a>
      <a class="tile" href="#/community">${cicon('community')}<span>Community</span></a>
      <a class="tile" href="#/bike">${cicon('bike')}<span>Fahrrad-Tipps</span></a>
      <a class="tile" href="#/disruptions">${cicon('warn')}<span>Einschränkungen</span></a>
      <a class="tile" href="#/faq">${cicon('faq')}<span>Hilfe &amp; FAQ</span></a>
    </div>
    ${sectHead('search', 'Meistgesucht')}<div class="chips" id="popular"><span class="muted small">Lädt …</span></div>
    ${sectHead('star', 'Meine Strecken', '<a class="more" href="#/account">Verwalten</a>')}<div id="favs">${spinner()}</div>
    ${sectHead('near', 'Umgebung')}<section class="card"><p class="muted small" style="margin-top:0">Bahnhöfe in deiner Nähe. Dein Standort bleibt auf deinem Gerät, bis du meldest.</p>
      <button class="btn secondary block" id="near" type="button">${cicon('pin')} Bahnhöfe in meiner Nähe zeigen</button><div id="nearlist"></div></section>
    ${sectHead('live', 'Community live', '<a class="more" href="#/community">Alle</a>')}
    <p class="muted small" style="margin-top:0"><span class="livebadge">Live</span> Fahrgäste melden anonym, ob Züge da sind oder zu spät kommen. Inoffiziell.</p>
    ${communityControls()}
    ${sectHead('warn', 'Einschränkungen heute', '<a class="more" href="#/disruptions">Alle</a>')}<ul class="list" id="dis">${spinner()}</ul>
    ${sectHead('bike', 'Fahrrad-Tipps', '<a class="more" href="#/bike">Alle</a>')}
    <div class="hscroll">${BIKE_TIPS.slice(0, 5).map((t) => `<article class="card tip"><span class="ico">${cicon(t.icon)}</span><div><h3>${esc(t.title)}</h3><p>${esc(t.text)}</p></div></article>`).join('')}</div>
    ${sectHead('user', 'Profil')}
    ${me ? `<a class="row" href="#/account"><span class="avatar" style="width:48px;height:48px;font-size:1.2rem">${esc(me.display_name.slice(0, 1).toUpperCase())}</span><span class="main"><b>${esc(me.display_name)}</b><span class="muted small">Vertrauenswert ${me.trust_score}</span></span></a>`
      : `<a class="row" href="#/account">${cicon('user')}<span class="main"><b>Anmelden oder Konto erstellen</b><span class="muted small">Kostenlos. Zum Mitschreiben, für Hinweise und Favoriten.</span></span></a>`}
    ${sectHead('faq', 'Hilfe & Rechtliches')}
    <a class="row" href="#/faq">${cicon('faq')}<span class="main"><b>Häufige Fragen</b></span></a>
    <a class="row" href="#/settings">${cicon('shield')}<span class="main"><b>Privatsphäre &amp; Einstellungen</b></span></a>
    <a class="row" href="#/legal/imprint">${cicon('ticket')}<span class="main"><b>Rechtliche Hinweise</b></span></a>
    <p class="muted small">Fahrplandaten: <b>gtfs.de</b> (CC BY 4.0, DELFI e.V.), Echtzeit: DB Timetables, Karte: © OpenStreetMap-Mitwirkende. Meldungen von Fahrgästen sind inoffiziell.</p>`;
  routeForm(document.getElementById('rform'), {
    onSearch: (f, t, time, via) => (location.hash = `#/route?from=${f.id}&to=${t.id}${via ? `&via=${via.id}` : ''}${time ? `&time=${time}` : ''}`),
  });
  const favs = await getFavs();
  if (myToken !== renderToken) return;
  document.getElementById('favs').innerHTML = favs.length
    ? favRows(favs)
    : `<div class="empty">${ART.star}<br>Noch keine Favoriten.<br>Tippe bei einem Bahnhof oder einer Strecke auf „Merken“.</div>`;
  bindCommunity(favs, 5);
  api('GET', '/stations?q=')
    .then(({ stations }) => {
      const box = document.getElementById('popular');
      if (box && myToken === renderToken) box.innerHTML = stations.slice(0, 8).map((s) => `<a class="chipbtn" href="#/station/${s.id}">${cicon('train')}${esc(s.name)}</a>`).join('');
    })
    .catch(() => {});
  api('GET', '/disruptions')
    .then(({ items }) => {
      const box = document.getElementById('dis');
      if (box && myToken === renderToken) box.innerHTML = items.length ? items.slice(0, 3).map(disruptionRow).join('') : `<li class="empty">${cicon('shield')}<br>Aktuell keine größeren Einschränkungen.</li>`;
    })
    .catch(() => {});
  document.getElementById('near').addEventListener('click', async () => {
    const out = document.getElementById('nearlist');
    out.innerHTML = spinner('Standort wird gesucht …');
    const pos = await getPosition(8000);
    if (pos.lat === undefined) {
      out.innerHTML = errorBox('Dein Standort ist nicht verfügbar. Erlaube den Standort oder tippe auf der Karte, wo du bist.');
      return;
    }
    try {
      const r = await api('GET', `/stations?lat=${pos.lat}&lon=${pos.lon}`);
      out.innerHTML = r.stations.length
        ? `<ul class="list" style="margin-top:10px">${r.stations.map((s) => `<li><a class="row" href="#/station/${s.id}">${cicon('pin')}<span class="main"><b>${esc(s.name)}</b><span class="muted small">${fmtDist(s.distance_m)} entfernt</span></span></a></li>`).join('')}</ul>`
        : '<div class="empty">Kein Bahnhof in deiner Nähe gefunden.</div>';
    } catch (e) {
      out.innerHTML = errorBox(e);
    }
  });
}

// ---------------------------------------------------------------- Community-Seite
async function communityView() {
  setScreen('Community', { back: false, tab: 'community' });
  view.innerHTML = `<p class="muted"><span class="livebadge">Live</span> Alle Meldungen der letzten Stunden. Die Seite aktualisiert sich selbst.</p>${communityControls()}`;
  bindCommunity(await getFavs(), 0);
}

// ---------------------------------------------------------------- Karte
async function mapView(_m, q) {
  setScreen('Karte', { back: false, tab: 'map' });
  view.classList.add('map-screen');
  const myToken = renderToken;
  view.innerHTML = `<div class="mapwrap"><p id="map-status" class="map-status glass" role="status" aria-live="polite">Haltestellen im Kartenausschnitt werden geladen …</p><div id="map" role="application" aria-label="Karte mit Bahnhöfen und Haltestellen"></div>
    <div class="mapbar"><button class="btn" id="loc" type="button">${cicon('near')} Mein Standort</button><button class="btn secondary" id="live" type="button" aria-pressed="false">${cicon('live')} Live folgen</button></div></div>
    <section class="map-nearby" id="nb" aria-live="polite"><p class="muted small">Tippe auf die Karte oder nutze „Mein Standort“, um Haltestellen in der Nähe zu sehen.</p></section>`;
  const onNearby = async (lat, lon, source) => {
    const box = document.getElementById('nb');
    if (!box) return;
    try {
      const r = await api('GET', `/stations?lat=${lat}&lon=${lon}`);
      if (!document.getElementById('nb')) return;
      box.innerHTML = `${sectHead('pin', source === 'gps' ? 'Bei dir in der Nähe' : 'Dort, wo du getippt hast')}` +
        (r.stations.length
          ? `<ul class="list">${r.stations.map((s) => `<li><a class="row" href="#/station/${s.id}">${cicon('train')}<span class="main"><b>${esc(s.name)}</b><span class="muted small">${fmtDist(s.distance_m)} entfernt</span></span><span class="chev">›</span></a></li>`).join('')}</ul>`
          : '<div class="empty">Hier ist kein Bahnhof in der Nähe.</div>');
    } catch (e) {
      if (document.getElementById('nb')) box.innerHTML = errorBox(e);
    }
  };
  let m;
  try {
    await loadLeaflet();
    if (myToken !== renderToken) return;
    m = await mountMap(view, { onNearby, onLeave: (fn) => cleanups.push(fn) });
  } catch (e) {
    document.getElementById('map').outerHTML = errorBox(e);
    return;
  }
  const locate = async () => {
    if (!(await m.locate())) toast('Dein Standort ist nicht verfügbar. Tippe stattdessen auf die Karte.', true);
  };
  document.getElementById('loc').addEventListener('click', locate);
  document.getElementById('live').addEventListener('click', () => {
    if (m.isLive()) {
      m.stopLive();
      toast('Live-Folgen beendet.');
    } else if (!m.startLive()) toast('Live-Standort ist hier nicht möglich.', true);
    else toast('Die Karte folgt dir. Zum Beenden nochmal tippen.');
  });
  if (q.get('locate')) locate();
}

// ---------------------------------------------------------------- Fahrrad, FAQ, Einschränkungen, Einstellungen
function bikeView() {
  setScreen('Fahrrad-Tipps', { tab: 'home' });
  view.innerHTML = `<p class="muted">Mit dem Rad in Bus und Bahn: das Wichtigste in Kürze.</p>${BIKE_TIPS.map((t) => `<article class="card tip"><span class="ico">${cicon(t.icon)}</span><div><h3>${esc(t.title)}</h3><p>${esc(t.text)}</p></div></article>`).join('')}`;
}

function faqView() {
  setScreen('Hilfe & FAQ', { tab: 'home' });
  view.innerHTML = FAQ.map(([qq, a]) => `<details class="faq"><summary>${cicon('faq')} ${esc(qq)}</summary><p>${esc(a)}</p></details>`).join('') +
    `<h2>Rechtliches</h2>${legalLinks()}`;
}

async function disruptionsView() {
  setScreen('Einschränkungen', { tab: 'home' });
  view.innerHTML = spinner();
  const myToken = renderToken;
  let r;
  try {
    r = await api('GET', '/disruptions');
  } catch (e) {
    if (myToken === renderToken) view.innerHTML = errorBox(e);
    return;
  }
  if (myToken !== renderToken) return;
  const legend = ['S-Bahn', 'U-Bahn', 'Regional-Express', 'Regionalbahn', 'Fernverkehr', 'Bus'];
  const lc = { 'S-Bahn': 'S1', 'U-Bahn': 'U1', 'Regional-Express': 'RE1', Regionalbahn: 'RB1', Fernverkehr: 'ICE', Bus: 'Bus' };
  view.innerHTML = `<p class="muted">Ausfälle und große Verspätungen heute, dazu bestätigte Meldungen von Fahrgästen.</p>
    <div class="legend">${legend.map((l) => `<span style="--k:${lineInfo(lc[l]).color}">${l}</span>`).join('')}</div>
    <ul class="list">${r.items.length ? r.items.map(disruptionRow).join('') : `<li class="empty">${cicon('shield')}<br>Aktuell keine größeren Einschränkungen.</li>`}</ul>`;
}

function settingsView() {
  setScreen('Einstellungen', { tab: 'account' });
  const canAsk = 'Notification' in window && !IS_NATIVE && Notification.permission === 'default';
  view.innerHTML = `${prefsCard()}
    <h2>Privatsphäre</h2><section class="card">
      <p style="margin-top:0">Lesen kannst du ohne Konto. Dein Standort wird nur geprüft, wenn du meldest oder bestätigst, und nach 24 Stunden gelöscht. Karte und Favoriten ohne Konto bleiben auf deinem Gerät.</p>
      <button class="btn secondary block" id="wipe" type="button">${cicon('trash')} Daten auf diesem Gerät löschen</button></section>
    ${canAsk ? `<h2>Hinweise</h2><button class="btn secondary block" id="ask" type="button">${cicon('bell')} Hinweise auch außerhalb der App anzeigen</button>` : ''}
    <h2>Mehr</h2><a class="row" href="#/faq">${cicon('faq')}<span class="main"><b>Häufige Fragen</b></span></a>${legalLinks()}
    <p class="muted small">TrustTrain ist eine Informations-App. Sie verkauft keine Tickets. Fahrplandaten: gtfs.de (CC BY 4.0), Echtzeit: DB Timetables, Karte: © OpenStreetMap-Mitwirkende.</p>`;
  bindPrefs();
  document.getElementById('ask')?.addEventListener('click', async () => {
    await Notification.requestPermission();
    settingsView();
  });
  document.getElementById('wipe').addEventListener('click', () => {
    if (!confirm('Gespeicherte Favoriten, Zwischenspeicher und Einstellungen auf diesem Gerät löschen? Dein Konto bleibt bestehen.')) return;
    Object.keys(localStorage).filter((k) => k.startsWith('tt_') && k !== 'tt_token').forEach((k) => localStorage.removeItem(k));
    applyPrefs();
    toast('Gelöscht.');
    settingsView();
  });
}

// ---------------------------------------------------------------- Community
async function loadCommunity(mode, { limit = 0, silent = false } = {}) {
  const box = document.getElementById('cfeed');
  if (!box) return;
  if (!silent) box.innerHTML = spinner();
  let r;
  try {
    r = await api('GET', `/community${mode === 'mine' ? '?mine=1' : ''}`);
  } catch (e) {
    if (!silent && document.getElementById('cfeed') === box) box.innerHTML = errorBox(e);
    return;
  }
  if (document.getElementById('cfeed') !== box) return;
  const items = limit ? r.items.slice(0, limit) : r.items;
  box.innerHTML = items.length
    ? `<ul class="list">${items
        .map((n) => {
          const t = REPORT_TYPES[n.type] || REPORT_TYPES.other;
          const tone = n.type === 'on_time' ? 'ok' : n.type === 'cancelled' ? 'bad' : 'warn';
          return `<li class="citem"><a class="row" href="#/trip/${n.trip_id}"><span class="main"><b><span class="line-tag">${esc(n.line)}</span>${esc(n.headsign)}</b>
            <span class="chip ${tone}">${icon(t.icon)} ${esc(t.label)}${n.minutes ? ` +${n.minutes} Min.` : ''}</span>
            ${n.comment ? `<br><span class="small">${esc(n.comment)}</span>` : ''}
            <br><span class="muted small">Anonym · ${esc(ageText(n.age_sec))}${n.confirms ? ` · ${n.confirms} bestätigt` : ''}${n.disputes ? ` · ${n.disputes} widersprochen` : ''}${n.mine ? ' · deine Meldung' : ''}</span></span></a>
            ${n.mine || !me ? '' : `<div class="acts"><button class="btn secondary" data-cv="1" data-id="${n.id}">${icon('check-circle')} Bei mir auch</button><button class="btn secondary" data-cv="-1" data-id="${n.id}">${icon('x-circle')} Stimmt nicht</button></div>`}</li>`;
        })
        .join('')}</ul>`
    : `<div class="empty">${ART.community}<br>${mode === 'mine' ? 'Für deine Favoriten gibt es noch keine Meldungen.' : 'Noch keine Meldungen in den letzten Stunden.'}<br>Sei der Erste!</div>`;
  box.querySelectorAll('[data-cv]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!me) return needLogin('Zum Bestätigen brauchst du ein Konto.');
      b.disabled = true;
      const pos = await getPosition(4000);
      try {
        await api('POST', `/reports/${b.dataset.id}/vote`, { value: +b.dataset.cv, ...pos });
        toast('Danke für deine Rückmeldung!');
        loadCommunity(mode, { limit });
      } catch (e) {
        b.disabled = false;
        toast(e.message, true);
      }
    })
  );
}

function quickReport(favs) {
  if (!me) return needLogin('Zum Melden brauchst du ein Konto. Es ist kostenlos, deine Meldung bleibt anonym.');
  const s = sheet(`<h2>Welcher Zug?</h2><div id="qs"></div>`);
  const body = s.el.querySelector('#qs');
  const stationStep = () => {
    const stFavs = favs.filter((f) => f.kind === 'station');
    body.innerHTML = `${stFavs.length ? `<p class="muted small">Deine Favoriten:</p>${stFavs.map((f) => `<button class="btn secondary block" data-st="${f.from_station_id}" style="margin-bottom:8px">${icon('star')} ${esc(f.from_name || f.name)}</button>`).join('')}` : ''}
      <div id="qpick"></div><button class="btn secondary block" data-close style="margin-top:12px">Abbrechen</button>`;
    stationPicker(body.querySelector('#qpick'), { label: 'Bahnhof suchen', placeholder: 'z. B. Mainz', onPick: (st) => st && tripStep(st.id) });
    body.querySelectorAll('[data-st]').forEach((b) => b.addEventListener('click', () => tripStep(+b.dataset.st)));
    body.querySelector('[data-close]').addEventListener('click', s.close);
  };
  const tripStep = async (stId) => {
    body.innerHTML = spinner();
    let r;
    try {
      r = await api('GET', `/stations/${stId}/departures?fast=1`);
    } catch (e) {
      body.innerHTML = errorBox(e);
      return;
    }
    body.innerHTML = `<p class="muted small">${esc(r.station.name)} – tippe deinen Zug an:</p><ul class="list">${
      r.items.length
        ? r.items.slice(0, 12).map((d) => `<li><button class="row" data-trip="${d.trip_id}" type="button" style="width:100%;text-align:left"><span class="time">${esc(d.actual)}</span><span class="main"><b><span class="line-tag">${esc(d.line)}</span>${esc(d.headsign)}</b></span></button></li>`).join('')
        : '<li class="empty">Keine Abfahrten.</li>'
    }</ul><button class="btn secondary block" id="qback" style="margin-top:12px">Zurück</button>`;
    body.querySelector('#qback').addEventListener('click', stationStep);
    body.querySelectorAll('[data-trip]').forEach((b) => b.addEventListener('click', () => stateStep(+b.dataset.trip)));
  };
  const send = async (tripId, type, minutes) => {
    body.innerHTML = spinner('Standort wird geprüft und Meldung gesendet …');
    const pos = await getPosition();
    try {
      const r = await api('POST', '/reports', { trip_id: tripId, type, minutes, ...pos });
      s.close();
      toast(r.location_ok ? 'Danke! Deine anonyme Meldung ist online.' : 'Gesendet. Ohne Standort zählt sie noch nicht als Bestätigung.');
      loadCommunity('all', { limit: 0 });
    } catch (e) {
      s.close();
      toast(e.message, true);
    }
  };
  const stateStep = (tripId) => {
    body.innerHTML = `<h2>Wie ist der Zug?</h2><div class="grid">
      <button class="tile" data-k="on_time">${icon('check-circle')}<span>Ist da / pünktlich</span></button>
      <button class="tile" data-k="delay">${icon('clock')}<span>Zu spät</span></button>
      <button class="tile" data-k="cancelled">${icon('x-circle')}<span>Fällt aus</span></button></div>
      <button class="btn secondary block" data-close style="margin-top:12px">Abbrechen</button>`;
    body.querySelector('[data-close]').addEventListener('click', s.close);
    body.querySelectorAll('[data-k]').forEach((b) =>
      b.addEventListener('click', () => {
        if (b.dataset.k !== 'delay') return send(tripId, b.dataset.k);
        body.innerHTML = `<h2>Wie viele Minuten?</h2><div class="minutes">${[3, 5, 10, 15, 20, 30, 45, 60].map((m) => `<button class="tile" data-m="${m}">${m}</button>`).join('')}</div>
          <button class="btn secondary block" data-close style="margin-top:12px">Abbrechen</button>`;
        body.querySelector('[data-close]').addEventListener('click', s.close);
        body.querySelectorAll('[data-m]').forEach((mb) => mb.addEventListener('click', () => send(tripId, 'delay', +mb.dataset.m)));
      })
    );
  };
  stationStep();
}

// ---------------------------------------------------------------- Abfahrtstafel
async function stationView({ id }) {
  setScreen('Abfahrten', { tab: 'home' });
  view.innerHTML = spinner();
  const myToken = renderToken;
  const load = async (fast = false) => {
    let r;
    try {
      r = await cachedGet(`/stations/${id}/departures${fast ? '?fast=1' : ''}`);
    } catch (e) {
      if (myToken === renderToken) view.innerHTML = errorBox(e);
      return;
    }
    if (myToken !== renderToken) return;
    const { station, items, updated } = r.data;
    titleEl.textContent = station.name;
    const favs = await getFavs();
    const isFav = favs.some((f) => sameFav(f, { kind: 'station', from_station_id: station.id, to_station_id: null }));
    if (myToken !== renderToken) return;
    view.innerHTML = `
      <div class="flex between">
        <span class="muted small">${r.offline ? `Offline – Stand ${new Date(r.at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : `Aktualisiert ${esc(updated)} Uhr`}</span>
        <button class="btn secondary" id="fav" aria-pressed="${isFav}">${icon('star')} ${isFav ? 'Favorit' : 'Merken'}</button>
      </div>
      <ul class="list">${
        items.length
          ? items.map((d) => `<li><a class="row" href="#/trip/${d.trip_id}?from=${station.id}">
              <span class="time">${esc(d.actual)}${d.delay ? `<s>${esc(d.planned)}</s>` : ''}</span>
              <span class="main"><b><span class="line-tag">${esc(d.line)}</span>${esc(d.headsign)}</b>
                ${d.platform ? `<span class="plat">Gleis ${esc(d.platform)}</span>` : ''}
                ${d.badge ? `<br><span class="chip ${d.badge.status === 'confirmed' ? 'warn' : 'gray'}">${icon(REPORT_TYPES[d.badge.type]?.icon || 'message')} ${esc(REPORT_TYPES[d.badge.type]?.label || '')}${d.badge.status === 'confirmed' ? '' : ' (unbestätigt)'}</span>` : ''}</span>
              ${delayChip(d.delay, d.cancelled)}</a></li>`).join('')
          : `<li class="empty">${ART.nightPhoto}<br>Keine Abfahrten in den geladenen Fahrplandaten. Falls das länger so bleibt, muss der Fahrplan aktualisiert werden.</li>`
      }</ul>`;
    document.getElementById('fav').addEventListener('click', async () => {
      try {
        const now = await toggleFav({ kind: 'station', from_station_id: station.id, to_station_id: null, name: station.name, from_name: station.name });
        toast(now ? 'Als Favorit gespeichert' : 'Favorit entfernt');
        load();
      } catch (e) {
        toast(e.message, true);
      }
    });
  };
  await load(true);
  load();
  every(30000, () => !document.getElementById('sheet-root').firstChild && load());
}

// ---------------------------------------------------------------- Zugdetail
async function tripView({ id }, query = new URLSearchParams()) {
  setScreen('Zug', { tab: 'home' });
  view.innerHTML = spinner();
  const myToken = renderToken;
  let data;
  const fromId = +query.get('from') || 0;
  const toId = +query.get('to') || 0;
  const timeline = (trip, stops) => {
    const fi = fromId ? stops.findIndex((s) => s.station_id === fromId) : -1;
    let ti = -1;
    if (fi >= 0) {
      const found = toId ? stops.findIndex((s, i) => i > fi && s.station_id === toId) : -1;
      ti = found > fi ? found : stops.length - 1;
    }
    const sel = fi >= 0 && ti > fi;
    const last = stops.length - 1;
    const items = stops.map((s, i) => {
      const cls = i === 0 ? ['first'] : [];
      if (i === last) cls.push('last');
      if (sel) {
        if (i >= fi && i <= ti) cls.push('in');
        else cls.push('off');
        if (i > fi && i <= ti) cls.push('up-on');
        if (i >= fi && i < ti) cls.push('down-on');
        if (i === fi || (toId && i === ti)) cls.push('edge');
      }
      const edge = sel && i === fi ? 'Einstieg' : sel && toId && i === ti ? 'Ausstieg' : '';
      return `<li class="${cls.join(' ')}"><span class="t">${esc(s.dep_actual || s.arr_actual)}${s.delay && (s.dep || s.arr) ? `<s>${esc(s.dep || s.arr)}</s>` : ''}</span>
        <span class="rail"><span class="dot"></span></span>
        <span class="body"><b data-edge="${edge}">${esc(s.name)}</b>${s.estimated ? '<br><span class="muted small est">geschätzt</span>' : ''}${s.platform ? `<br><span class="muted small">Gleis ${esc(s.platform)}</span>` : ''}</span></li>`;
    });
    const note = sel ? `<p class="selnote">${cicon('route')} Deine Fahrt: ${esc(stops[fi].name)}${toId ? ` → ${esc(stops[ti].name)}` : ''} (${ti - fi} ${ti - fi === 1 ? 'Halt' : 'Halte'})</p>` : '';
    return `${note}<ol class="tl ${sel ? 'sel' : ''}" style="--lc:${lineInfo(trip.line).color}">${items.join('')}</ol>`;
  };
  const draw = () => {
    const { trip, stops, reports, wagons } = data;
    titleEl.textContent = `${trip.line} nach ${trip.headsign}`;
    view.innerHTML = `
      <section class="card">
        <div class="flex between"><b><span class="line-tag">${esc(trip.line)}</span>${esc(trip.headsign)}</b>${delayChip(trip.delay, trip.cancelled)}</div>
        <p class="muted small">Geplante Zeiten, Echtzeit wenn verfügbar. Die ganze Strecke von Anfang bis Ende.</p>
        ${timeline(trip, stops)}
      </section>
      <section class="card wagoncard">${cicon('wagon')}<div style="flex:1"><span class="num">${wagons.count ?? '–'}</span> Wagen<br>
        <span class="muted small">${wagons.votes ? `Laut ${wagons.votes} ${wagons.votes === 1 ? 'Fahrgast' : 'Fahrgästen'} (inoffiziell)` : 'Noch von niemandem gemeldet'}</span></div>
        <button class="btn secondary" id="wag" type="button">${me ? 'Melden' : 'Anmelden'}</button></section>
      <h2>Meldungen von Fahrgästen</h2>
      <p class="muted small">Inoffiziell. „Bestätigt“ heißt: mehrere Fahrgäste im Zug stimmen überein.</p>
      <div id="reports">${reports.length ? reports.map(reportCard).join('') : `<div class="empty">${ART.people}<br>Noch keine Meldungen für diesen Zug.</div>`}</div>
      <button class="btn secondary block" id="share" type="button" style="margin-top:12px">${icon('share')} Diesen Zug teilen</button>
      <div class="fab-wrap"><button class="btn big" id="report">${icon('flag')} Problem melden</button></div>`;
    document.getElementById('wag').addEventListener('click', openWagons);
    document.getElementById('share').addEventListener('click', async () => {
      const first = stops[0];
      const text = `${trip.line} nach ${trip.headsign}${trip.cancelled ? ' – fällt aus' : trip.delay > 0 ? ` – ${trip.delay} Min. Verspätung` : ' – pünktlich'}${first ? ` (ab ${first.name} ${first.dep_actual || ''})` : ''}`;
      try {
        if (navigator.share) await navigator.share({ title: 'TrustTrain', text });
        else {
          await navigator.clipboard.writeText(text);
          toast('Text kopiert. Du kannst ihn jetzt einfügen.');
        }
      } catch (e) {
        if (e.name !== 'AbortError') toast('Teilen ist hier nicht möglich.', true);
      }
    });
    document.getElementById('report').addEventListener('click', openReport);
    view.querySelectorAll('[data-vote]').forEach((b) => b.addEventListener('click', () => vote(+b.dataset.id, +b.dataset.vote)));
    view.querySelectorAll('[data-flag]').forEach((b) => b.addEventListener('click', () => flag(+b.dataset.flag)));
    view.querySelectorAll('[data-block]').forEach((b) => b.addEventListener('click', () => block(+b.dataset.block, b.dataset.name)));
  };
  const load = async (fast = false) => {
    try {
      data = await api('GET', `/trips/${id}${fast ? '?fast=1' : ''}`);
    } catch (e) {
      if (myToken === renderToken) view.innerHTML = errorBox(e);
      return false;
    }
    if (myToken === renderToken) draw();
    return true;
  };
  const reportCard = (r) => {
    const t = REPORT_TYPES[r.type] || REPORT_TYPES.other;
    return `<article class="report"><header><b>${icon(t.icon)} ${esc(t.label)}${r.minutes ? ` · ${r.minutes} Min.` : ''}</b>${statusChip(r.status)}</header>
      ${r.comment ? `<p>${esc(r.comment)}</p>` : ''}
      <div class="who">${esc(r.author)} · ${ageText(r.age_sec)} · ${r.confirms} bestätigt${r.disputes ? `, ${r.disputes} widersprochen` : ''}</div>
      <div class="acts">${
        r.mine
          ? '<span class="muted small">Deine Meldung</span>'
          : `<button class="btn ${r.my_vote === 1 ? '' : 'secondary'}" data-vote="1" data-id="${r.id}" aria-pressed="${r.my_vote === 1}">${icon('check-circle')} Bei mir auch</button>
             <button class="btn ${r.my_vote === -1 ? 'danger' : 'secondary'}" data-vote="-1" data-id="${r.id}" aria-pressed="${r.my_vote === -1}">${icon('x-circle')} Stimmt nicht</button>
             <button class="linkbtn" data-flag="${r.id}">Melden</button>
             <button class="linkbtn" data-block="${r.author_id}" data-name="${esc(r.author)}">Nutzer blockieren</button>`
      }</div></article>`;
  };
  async function vote(rid, value) {
    if (!me) return needLogin('Zum Bestätigen brauchst du ein Konto.');
    const pos = await getPosition(4000);
    try {
      data.reports = (await api('POST', `/reports/${rid}/vote`, { value, ...pos })).reports;
      draw();
      toast('Danke für deine Rückmeldung!');
    } catch (e) {
      toast(e.message, true);
    }
  }
  async function flag(rid) {
    if (!me) return needLogin('Zum Melden brauchst du ein Konto.');
    if (!confirm('Diese Meldung dem Team zur Prüfung senden?')) return;
    try {
      await api('POST', `/reports/${rid}/flag`, {});
      toast('Danke, wir schauen es uns an.');
    } catch (e) {
      toast(e.message, true);
    }
  }
  async function block(uid, name) {
    if (!me) return needLogin();
    if (!confirm(`${name} blockieren? Du siehst dann keine Meldungen mehr von dieser Person.`)) return;
    try {
      await api('POST', `/users/${uid}/block`, {});
      toast('Nutzer blockiert');
      load();
    } catch (e) {
      toast(e.message, true);
    }
  }
  function openWagons() {
    if (!me) return needLogin('Zum Melden der Wagenzahl brauchst du ein Konto.');
    const s = sheet(`<h2>Wie viele Wagen hat der Zug?</h2><p class="muted small">Zähle die Wagen, wenn du am Zug oder im Zug bist.</p>
      <label for="wn">Anzahl (1 bis 30)</label><input id="wn" type="number" min="1" max="30" inputmode="numeric" value="${data.wagons.mine || ''}">
      <button class="btn big block" id="wsend" type="button" style="margin-top:12px">Wagenzahl melden</button>
      <button class="btn secondary block" data-close style="margin-top:12px">Abbrechen</button>`);
    s.el.querySelector('[data-close]').addEventListener('click', s.close);
    s.el.querySelector('#wsend').addEventListener('click', async () => {
      const n = +s.el.querySelector('#wn').value;
      if (!Number.isInteger(n) || n < 1 || n > 30) return toast('Bitte eine Zahl von 1 bis 30 eingeben.', true);
      const pos = await getPosition();
      try {
        data.wagons = (await api('POST', `/trips/${id}/wagons`, { wagons: n, ...pos })).wagons;
        s.close();
        draw();
        toast('Danke! Wagenzahl gespeichert.');
      } catch (e) {
        toast(e.message, true);
      }
    });
  }
  function openReport() {
    if (!me) return needLogin('Zum Melden brauchst du ein Konto. Es ist kostenlos.');
    const s = sheet(`<h2>Was ist los?</h2>
      <div class="grid" id="types">${Object.entries(REPORT_TYPES)
        .map(([k, t]) => `<button class="tile" data-type="${k}">${icon(t.icon)}<span>${esc(t.label)}</span></button>`)
        .join('')}</div>
      <label for="cm">Kommentar (freiwillig, höchstens 280 Zeichen)</label>
      <textarea id="cm" maxlength="280"></textarea>
      <button class="btn secondary block" data-close style="margin-top:12px">Abbrechen</button>`);
    const send = async (type, minutes) => {
      const comment = s.el.querySelector('#cm')?.value.trim() || '';
      s.el.innerHTML = '<div class="spinner" role="status">Standort wird geprüft und Meldung gesendet …</div>';
      const pos = await getPosition();
      try {
        const r = await api('POST', '/reports', { trip_id: +id, type, minutes, comment, ...pos });
        data.reports = r.reports;
        s.close();
        draw();
        toast(r.location_ok ? 'Danke! Deine Meldung ist online.' : 'Gesendet. Ohne Standort zählt sie noch nicht als Bestätigung.');
      } catch (e) {
        s.close();
        toast(e.message, true);
      }
    };
    s.el.querySelectorAll('[data-type]').forEach((b) =>
      b.addEventListener('click', () => {
        const type = b.dataset.type;
        if (type !== 'delay') return send(type);
        const comment = s.el.querySelector('#cm').value;
        s.el.innerHTML = `<h2>Wie viele Minuten?</h2><div class="minutes">${[3, 5, 10, 15, 20, 30, 45, 60]
          .map((m) => `<button class="tile" data-m="${m}">${m}</button>`)
          .join('')}</div><textarea id="cm" hidden>${esc(comment)}</textarea>
          <button class="btn secondary block" data-close style="margin-top:12px">Abbrechen</button>`;
        s.el.querySelectorAll('[data-m]').forEach((mb) => mb.addEventListener('click', () => send('delay', +mb.dataset.m)));
        s.el.querySelector('[data-close]').addEventListener('click', s.close);
      })
    );
  }
  if (await load(true)) {
    load();
    every(10000, () => !document.getElementById('sheet-root').firstChild && load());
  }
}

// ---------------------------------------------------------------- Verbindung
async function routeView(_p, query) {
  setScreen('Verbindung suchen', { back: false, tab: 'route' });
  let from = null;
  let to = null;
  let via = null;
  let preloadError = '';
  const qFrom = +query.get('from') || 0;
  const qTo = +query.get('to') || 0;
  const qVia = +query.get('via') || 0;
  try {
    if (qFrom) from = (await api('GET', `/stations?id=${qFrom}`)).stations[0] || null;
    if (qTo) to = (await api('GET', `/stations?id=${qTo}`)).stations[0] || null;
    if (qVia) via = (await api('GET', `/stations?id=${qVia}`)).stations[0] || null;
  } catch (e) {
    preloadError = e.message;
  }
  const time = /^\d{1,2}:\d{2}$/.test(query.get('time') || '') ? query.get('time') : '';
  view.innerHTML = `<section class="hero glass"><div id="rform"></div></section><div id="res">${preloadError ? errorBox(preloadError) : ''}</div>`;
  const search = async (f, t, tm, v) => {
    const res = document.getElementById('res');
    res.innerHTML = spinner('Suche läuft …');
    try {
      const { connections } = await api('GET', `/connections?from=${f.id}&to=${t.id}${v ? `&via=${v.id}` : ''}${tm ? `&time=${tm}` : ''}`);
      res.innerHTML = `<h2>Ergebnisse</h2>` +
        (connections.length
          ? connections.map((c) => `<article class="card"><div class="flex between"><b style="font-size:1.25rem">${esc(c.dep)} → ${esc(c.arr)}</b>
            <span class="chip ${c.transfers ? 'info' : 'ok'}">${c.transfers ? `${c.transfers} Umstieg` : 'Direkt'}</span></div>
            ${v ? `<p class="via-result">${cicon('pin')} Über ${esc(v.name)}</p>` : ''}
            <div class="legs">${c.legs.map((l) => `<div><a href="#/trip/${l.trip_id}?from=${l.from_id}&to=${l.to_id}"><span class="line-tag">${esc(l.line)}</span></a>${esc(l.from)} ${esc(l.dep_actual)} → ${esc(l.to)} ${esc(l.arr_actual)} · ${l.platform ? `Gleis ${esc(l.platform)}` : ''} ${l.delay ? `<span class="chip warn">+${l.delay}</span>` : ''}</div>`).join('')}</div></article>`).join('')
          : `<div class="empty">${ART.search}<br>Keine passende Verbindung in den geladenen Fahrplandaten. Probiere eine andere Uhrzeit oder prüfe, ob der Fahrplan für deine Region aktualisiert wurde.</div>`);
    } catch (e) {
      res.innerHTML = errorBox(e);
    }
  };
  routeForm(document.getElementById('rform'), { from, to, via, time, onSearch: search });
  if (from && to) search(from, to, time, via);
}

// ---------------------------------------------------------------- Hinweise (Alarme für Favoriten)
let seenNotif = +(localStorage.getItem('tt_notif_seen') || 0);

async function pollAlerts(silent = false) {
  if (!me || document.hidden) return null;
  let r;
  try {
    r = await api('GET', '/notifications');
  } catch {
    return null;
  }
  drawAlertsTab(r.unread);
  const fresh = r.items.filter((n) => !n.read && n.id > seenNotif);
  if (fresh.length) {
    seenNotif = Math.max(...fresh.map((n) => n.id));
    localStorage.setItem('tt_notif_seen', String(seenNotif));
    if (!silent) {
      toast(fresh[0].title);
      if ('Notification' in window && Notification.permission === 'granted') {
        fresh.slice(0, 3).forEach((n) => new Notification(n.title, { body: n.body }));
      }
    }
  }
  return r;
}

async function alertsView() {
  setScreen('Hinweise', { back: true, tab: '' });
  if (!me) {
    view.innerHTML = `<section class="card">${ART.alertsPhoto}<h2 style="margin-top:0">${icon('bell')} Hinweise zu deinen Favoriten</h2>
      <p>Mit einem kostenlosen Konto sagen wir dir Bescheid, wenn sich bei deinem Lieblings-Bahnhof oder deiner Strecke etwas ändert: Verspätung, Ausfall oder anderes Gleis.</p>
      <a class="btn big block" href="#/account" id="tologin">Anmelden oder Konto erstellen</a></section>`;
    document.getElementById('tologin').addEventListener('click', () => sessionStorage.setItem('tt_next', '#/alerts'));
    return;
  }
  view.innerHTML = spinner();
  const r = await api('GET', '/notifications');
  const canAsk = 'Notification' in window && !IS_NATIVE && Notification.permission === 'default';
  view.innerHTML = `
    <p class="muted small">Du bekommst Hinweise für Bahnhöfe und Strecken mit Stern ${icon('star')}, wenn ein Zug bald abfährt.</p>
    ${canAsk ? `<button class="btn secondary block" id="ask">${icon('bell')} Hinweise auch außerhalb der App anzeigen</button>` : ''}
    <ul class="list">${
      r.items.length
        ? r.items
            .map((n) => `<li><a class="row${n.read ? '' : ' unread'}" href="${n.trip_id ? `#/trip/${n.trip_id}` : '#/'}">
              ${icon(n.kind === 'cancelled' ? 'x-circle' : n.kind === 'delay' ? 'clock' : 'swap')}
              <span class="main"><b>${esc(n.title)}</b><span class="muted small">${esc(n.body)}</span><br><span class="muted small">${esc(ageText(n.age_sec))}</span></span></a></li>`)
            .join('')
        : `<li class="empty">${ART.alertsPhoto}<br>Noch keine Hinweise.<br>Tippe bei einem Bahnhof auf den Stern, dann melden wir uns bei Änderungen.</li>`
    }</ul>`;
  document.getElementById('ask')?.addEventListener('click', async () => {
    await Notification.requestPermission();
    alertsView();
  });
  if (r.unread) {
    await api('POST', '/notifications/read', {}).catch(() => {});
    drawAlertsTab(0);
  }
}

// ---------------------------------------------------------------- Konto
async function accountView() {
  setScreen('Konto', { back: false, tab: 'account' });
  if (!me) return loggedOutView();
  const blocks = await api('GET', '/blocks').then((r) => r.users).catch(() => []);
  const favs = await getFavs();
  view.innerHTML = `
    <section class="card"><div class="profile"><span class="avatar" aria-hidden="true">${esc(me.display_name.slice(0, 1).toUpperCase())}</span>
      <div><h2>${esc(me.display_name)}</h2><span class="muted">${esc(me.email)}</span><br>${me.premium ? '<span class="chip ok">' + icon('crown') + ' Premium</span>' : ''}</div></div>
      <div class="stat"><div><b>${me.trust_score}</b><span>Vertrauenswert</span></div><div><b>${favs.length}</b><span>Favoriten</span></div><div><b>${blocks.length}</b><span>Blockiert</span></div></div>
      ${me.role !== 'user' && !IS_NATIVE ? '<a class="btn secondary block" href="admin.html" style="margin-top:12px">Admin-Bereich öffnen</a>' : ''}</section>
    ${sectHead('star', 'Meine Strecken und Bahnhöfe')}
    ${favs.length ? favs.map((f) => `<div class="flex" style="gap:8px;align-items:stretch">${favRows([f]).replace('class="row"', 'class="row" style="flex:1"')}<button class="btn secondary" data-delfav="${f.id}" aria-label="Favorit entfernen">${cicon('trash')}</button></div>`).join('') : `<div class="empty">${ART.star}<br>Noch keine Favoriten.</div>`}
    <a class="row" href="#/premium">${icon('crown')}<span class="main"><b>Premium</b><span class="muted small">${me.premium ? 'Aktiv' : 'Mehr Komfort ansehen'}</span></span></a>
    <a class="row" href="#/settings">${cicon('gear')}<span class="main"><b>Einstellungen und Privatsphäre</b></span></a>
    ${blocks.length ? `<section class="card"><b>Blockierte Nutzer</b>${blocks.map((b) => `<div class="flex between"><span>${esc(b.display_name)}</span><button class="linkbtn" data-unblock="${b.id}">Freigeben</button></div>`).join('')}</section>` : ''}
    <h2>Rechtliches</h2>${legalLinks()}
    <button class="btn secondary block" id="logout" style="margin-top:16px">Abmelden</button>
    <button class="btn danger block" id="delete" style="margin-top:12px">${icon('trash')} Konto und Daten löschen</button>`;
  view.querySelectorAll('[data-delfav]').forEach((b) =>
    b.addEventListener('click', async () => {
      try {
        await api('DELETE', `/favorites/${b.dataset.delfav}`);
        accountView();
      } catch (e) {
        toast(e.message, true);
      }
    })
  );
  document.getElementById('logout').addEventListener('click', async () => {
    await api('POST', '/auth/logout', {}).catch(() => {});
    setToken(null);
    me = null;
    drawAlertsTab(0);
    toast('Du bist abgemeldet.');
    accountView();
  });
  view.querySelectorAll('[data-unblock]').forEach((b) =>
    b.addEventListener('click', async () => {
      await api('DELETE', `/users/${b.dataset.unblock}/block`);
      accountView();
    })
  );
  document.getElementById('delete').addEventListener('click', () => {
    const s = sheet(`<h2>Konto wirklich löschen?</h2><p>Dein Konto, deine Meldungen und Favoriten werden endgültig gelöscht.</p>
      <label for="dp">Zur Bestätigung dein Passwort</label><input id="dp" type="password" autocomplete="current-password">
      <div class="stack" style="margin-top:14px"><button class="btn danger" id="dgo">Endgültig löschen</button><button class="btn secondary" data-close>Abbrechen</button></div>`);
    s.el.querySelector('#dgo').addEventListener('click', async () => {
      try {
        await api('POST', '/me/delete', { password: s.el.querySelector('#dp').value });
        setToken(null);
        me = null;
        s.close();
        toast('Dein Konto wurde gelöscht.');
        accountView();
      } catch (e) {
        toast(e.message, true);
      }
    });
  });
}

function loggedOutView() {
  view.innerHTML = `
    <section class="card">${ART.login}<h2 style="margin-top:0">Anmelden</h2>
      <p class="muted">Ohne Konto kannst du Fahrpläne ansehen. Zum Melden und Bestätigen brauchst du ein kostenloses Konto.</p>
      <form id="login" novalidate>
        <label for="le">E-Mail</label><input id="le" type="email" autocomplete="email" required>
        <label for="lp">Passwort</label><input id="lp" type="password" autocomplete="current-password" required>
        <div id="lerr"></div>
        <button class="btn big block" style="margin-top:14px">Anmelden</button></form></section>
    <section class="card"><h2 style="margin-top:0">Neu hier? Konto erstellen</h2>
      <form id="reg" novalidate>
        <label for="rn">Dein Name im Profil (Meldungen bleiben anonym)</label><input id="rn" autocomplete="nickname" maxlength="40" required>
        <label for="re">E-Mail</label><input id="re" type="email" autocomplete="email" required>
        <label for="rp">Passwort (mindestens 8 Zeichen)</label><input id="rp" type="password" autocomplete="new-password" minlength="8" required>
        <label class="check" style="margin-top:14px"><input id="rt" type="checkbox"><span>Ich habe <a href="#/legal/privacy">Datenschutz</a> und <a href="#/legal/terms">Nutzungsbedingungen</a> gelesen.</span></label>
        <div id="rerr"></div>
        <button class="btn big block" style="margin-top:14px">Konto erstellen</button></form></section>
    ${prefsCard()}
    <h2>Rechtliches</h2>${legalLinks()}`;
  bindPrefs();
  const done = async (r) => {
    setToken(r.token);
    me = r.user;
    await pushLocalFavs();
    pollAlerts(true);
    toast(`Willkommen, ${me.display_name}!`);
    const next = sessionStorage.getItem('tt_next');
    sessionStorage.removeItem('tt_next');
    if (next && next !== '#/account') location.hash = next;
    else accountView();
  };
  const submit = (formId, errId, path, getBody) =>
    document.getElementById(formId).addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = document.getElementById(errId);
      err.innerHTML = '';
      try {
        await done(await api('POST', path, getBody()));
      } catch (ex) {
        err.innerHTML = errorBox(ex);
      }
    });
  submit('login', 'lerr', '/auth/login', () => ({ email: val('le'), password: val('lp') }));
  submit('reg', 'rerr', '/auth/register', () => ({
    display_name: val('rn'), email: val('re'), password: val('rp'), accept_terms: document.getElementById('rt').checked,
  }));
}
const val = (id) => document.getElementById(id).value;

const legalLinks = () => `<a class="row" href="#/legal/imprint">Impressum</a><a class="row" href="#/legal/privacy">Datenschutz</a><a class="row" href="#/legal/terms">Nutzungsbedingungen</a>`;

// ---------------------------------------------------------------- Anzeige-Einstellungen (nur auf diesem Gerät)
const prefOn = (k) => localStorage.getItem(`tt_pref_${k}`) === '1';
const applyPrefs = () => {
  document.documentElement.classList.toggle('pref-large', prefOn('large'));
  document.documentElement.classList.toggle('pref-contrast', prefOn('contrast'));
};
applyPrefs();
const prefsCard = () => `<h2>Anzeige</h2><section class="card">
  <label class="check"><input type="checkbox" data-pref="large" ${prefOn('large') ? 'checked' : ''}><span><b>Große Schrift</b><br><span class="muted small">Texte und Knöpfe werden größer.</span></span></label>
  <label class="check" style="margin-top:12px"><input type="checkbox" data-pref="contrast" ${prefOn('contrast') ? 'checked' : ''}><span><b>Hoher Kontrast</b><br><span class="muted small">Dunklere Schrift und kräftigere Ränder.</span></span></label></section>`;
const bindPrefs = () =>
  view.querySelectorAll('[data-pref]').forEach((c) =>
    c.addEventListener('change', () => {
      localStorage.setItem(`tt_pref_${c.dataset.pref}`, c.checked ? '1' : '0');
      applyPrefs();
    })
  );

// ---------------------------------------------------------------- Premium
async function premiumView() {
  setScreen('Premium', { tab: 'account' });
  const demo = config.payments_mode === 'demo';
  view.innerHTML = `<section class="card">${ART.crown}<h2 style="margin-top:0">${icon('crown')} TrustTrain Premium</h2>
    <p>Der Kern bleibt <b>kostenlos</b>: Fahrplan, Abfahrten, Meldungen lesen und schreiben.</p>
    <ul><li>Alarme für deine Pendelstrecke (volle Version)</li><li>Verspätungs-Verlauf für Verbindungen</li><li>Widgets</li><li>Ohne Werbung</li></ul>
    <p class="muted small">Preis: wird nach dem Wartelisten-Test festgelegt. Diese Funktionen kommen mit Version 1.1.</p>
    ${me?.premium ? `<p><span class="chip ok">${icon('check-circle')} Premium ist aktiv</span></p><button class="btn secondary block" id="cancel">Premium beenden</button>`
      : demo ? '<button class="btn big block" id="buy">Premium testen (Demo, kostenlos)</button>'
      : '<p class="chip info">Der Kauf wird über Google Play abgewickelt (noch nicht freigeschaltet).</p>'}
    </section>`;
  document.getElementById('buy')?.addEventListener('click', async () => {
    if (!me) return needLogin('Bitte melde dich zuerst an.');
    try {
      me = (await api('POST', '/premium/activate', {})).user;
      toast('Premium (Demo) ist aktiv.');
      premiumView();
    } catch (e) {
      toast(e.message, true);
    }
  });
  document.getElementById('cancel')?.addEventListener('click', async () => {
    me = (await api('POST', '/premium/cancel', {})).user;
    premiumView();
  });
}

// ---------------------------------------------------------------- Rechtliches (Platzhalter – vor Veröffentlichung ausfüllen und juristisch prüfen)
const LEGAL = {
  imprint: ['Impressum', `<p><b>Angaben gemäß § 5 DDG</b></p><p>[Vor- und Nachname / Firma]<br>[Straße und Hausnummer]<br>[PLZ Ort]</p><p>Kontakt: [E-Mail-Adresse], [Telefon]</p><p class="muted small">Diese Angaben müssen vor der Veröffentlichung vollständig ausgefüllt werden.</p>`],
  privacy: ['Datenschutz', `<p class="muted small">Entwurf – vor Veröffentlichung juristisch prüfen lassen.</p>
    <h3>Welche Daten wir verarbeiten</h3><ul><li><b>Konto:</b> E-Mail-Adresse, Name, Passwort (nur als Hash).</li><li><b>Meldungen:</b> Art, Text, Zeitpunkt, Zug.</li><li><b>Standort:</b> nur wenn du meldest oder bestätigst, ausschließlich zur Prüfung, ob du am Zug bist. Er wird nach 24 Stunden gelöscht.</li><li><b>Favoriten</b> und Blockierliste.</li></ul>
    <h3>Zweck</h3><p>Betrieb der App, Schutz vor Missbrauch, Moderation.</p>
    <h3>Deine Rechte</h3><p>Auskunft, Berichtigung, Löschung. Dein Konto löschst du selbst unter „Konto“ → „Konto und Daten löschen“.</p>
    <p>Verantwortlicher: [Name, Adresse, E-Mail].</p>`],
  terms: ['Nutzungsbedingungen', `<p class="muted small">Entwurf – vor Veröffentlichung juristisch prüfen lassen.</p>
    <p><b>Inoffizielle Meldungen.</b> Meldungen stammen von Fahrgästen. Sie sind keine offiziellen Auskünfte der Verkehrsunternehmen und können falsch sein.</p>
    <p><b>Regeln.</b> Melde nur, was du selbst im Zug erlebst. Keine Beleidigungen, keine Werbung, keine falschen Angaben. Verstöße führen zur Sperre.</p>
    <p><b>Haftung.</b> Wir übernehmen keine Gewähr für Richtigkeit und Vollständigkeit der Angaben.</p>
    <p>TrustTrain ist nicht mit der Deutschen Bahn AG verbunden.</p>`],
};

function legalView({ page }) {
  const [title, html] = LEGAL[page] || LEGAL.imprint;
  setScreen(title, { tab: 'account' });
  view.innerHTML = `<article class="card">${html}</article>`;
}

// ---------------------------------------------------------------- Router
const routes = [
  [/^\/$/, homeView],
  [/^\/station\/(\d+)$/, (m) => stationView({ id: m[1] })],
  [/^\/trip\/(\d+)$/, (m, q) => tripView({ id: m[1] }, q)],
  [/^\/route$/, (m, q) => routeView({}, q)],
  [/^\/map$/, mapView],
  [/^\/community$/, communityView],
  [/^\/bike$/, bikeView],
  [/^\/faq$/, faqView],
  [/^\/disruptions$/, disruptionsView],
  [/^\/settings$/, settingsView],
  [/^\/alerts$/, alertsView],
  [/^\/account$/, accountView],
  [/^\/premium$/, premiumView],
  [/^\/legal\/(imprint|privacy|terms)$/, (m) => legalView({ page: m[1] })],
];

async function render() {
  renderToken++;
  cleanups.forEach((f) => f());
  cleanups = [];
  timers.forEach(clearInterval);
  timers = [];
  document.getElementById('sheet-root').innerHTML = '';
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  const q = new URLSearchParams(qs);
  for (const [re, fn] of routes) {
    const m = path.match(re);
    if (m) {
      try {
        await fn(m, q);
      } catch (e) {
        view.innerHTML = errorBox(e);
      }
      view.focus({ preventScroll: true });
      window.scrollTo(0, 0);
      return;
    }
  }
  location.hash = '#/';
}

async function start() {
  try {
    config = await api('GET', '/config');
  } catch {
    /* offline: Standardwerte */
  }
  if (getToken()) {
    try {
      me = (await api('GET', '/me')).user;
    } catch (e) {
      if (e.status === 401 || e.status === 403) setToken(null);
    }
  }
  addEventListener('hashchange', render);
  render();
  pollAlerts(true);
  setInterval(pollAlerts, 60000);
  if ('serviceWorker' in navigator && !IS_NATIVE && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
start();
