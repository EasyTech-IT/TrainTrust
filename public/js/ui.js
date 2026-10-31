import { api } from './api.js';
import { cicon } from './icons.js';

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ICONS = {
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  'x-circle': '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>',
  'check-circle': '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  thermometer: '<path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/>',
  'wifi-off': '<path d="M12 20h.01M8.5 16.43a5 5 0 0 1 7 0M5 12.86a10 10 0 0 1 5.17-2.69M19 12.86a10 10 0 0 0-2-1.52M2 8.82a15 15 0 0 1 4.18-2.64M22 8.82a15 15 0 0 0-11.29-3.76M2 2l20 20"/>',
  droplet: '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
  swap: '<path d="M8 3 4 7l4 4M4 7h16M16 21l4-4-4-4M20 17H4"/>',
  message: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  train: '<path d="M8 3.1V7a4 4 0 0 0 8 0V3.1M9 15l-1-1M15 15l1-1M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5ZM8 19l-2 3M16 19l2 3"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  arrow: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7"/>',
  crown: '<path d="m2 4 3 12h14l3-12-6 4-4-6-4 6-6-4zM5 20h14"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16M3 16h5v5"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3M12 9v4M12 17h.01"/>',
  ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
};

export const icon = (name) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;

// Illustrationen (eigene SVGs, offline, rein dekorativ)
export const ART = {
  hero: `<img class="photo" src="img/hero.jpg" width="720" height="480" alt="Ein Regionalzug fährt durch eine grüne Landschaft" fetchpriority="high">`,
  community: `<img class="photo" src="img/community.jpg" width="720" height="480" alt="Fahrgäste warten gemeinsam am Bahnsteig" loading="lazy">`,
  alertsPhoto: `<img class="photo" src="img/alerts.jpg" width="720" height="720" alt="Handy mit Glocke und Zug" loading="lazy">`,
  nightPhoto: `<img class="photo" src="img/night.jpg" width="720" height="480" alt="Ruhiger Bahnsteig bei Nacht" loading="lazy">`,
  heroSvg: `<svg class="art" viewBox="0 0 360 140" role="img" aria-label="Ein Zug fährt durch eine grüne Landschaft" xmlns="http://www.w3.org/2000/svg">
    <rect width="360" height="140" rx="18" fill="#e3f3ef"/><circle cx="292" cy="38" r="20" fill="#ffd166"/>
    <path d="M0 104 Q60 62 120 98 T250 92 T360 100 V140 H0Z" fill="#9fd3c7"/><path d="M0 116 Q90 88 180 112 T360 108 V140 H0Z" fill="#5fb3a1"/>
    <rect x="0" y="118" width="360" height="5" fill="#6b7b78"/><g fill="#0f6b59">
    <rect x="40" y="74" width="62" height="34" rx="8"/><rect x="106" y="74" width="62" height="34" rx="8"/><rect x="172" y="74" width="62" height="34" rx="8"/>
    <path d="M238 108V86q0-12 12-12h30q14 2 24 14l6 20z"/></g><g fill="#fff">
    <rect x="48" y="82" width="14" height="12" rx="3"/><rect x="68" y="82" width="14" height="12" rx="3"/><rect x="114" y="82" width="14" height="12" rx="3"/><rect x="134" y="82" width="14" height="12" rx="3"/>
    <rect x="180" y="82" width="14" height="12" rx="3"/><rect x="200" y="82" width="14" height="12" rx="3"/><path d="M252 82h22l12 12h-34z"/></g>
    <g fill="#33423f"><circle cx="62" cy="114" r="5"/><circle cx="128" cy="114" r="5"/><circle cx="194" cy="114" r="5"/><circle cx="262" cy="114" r="5"/></g></svg>`,
  bell: `<svg class="art small" viewBox="0 0 120 100" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><circle cx="60" cy="50" r="42" fill="#e3f3ef"/>
    <path d="M60 22a18 18 0 0 0-18 18c0 20-8 24-8 24h52s-8-4-8-24a18 18 0 0 0-18-18z" fill="#0f6b59"/><circle cx="60" cy="72" r="6" fill="#ffd166"/><circle cx="82" cy="30" r="7" fill="#e5484d"/></svg>`,
  people: `<svg class="art small" viewBox="0 0 120 100" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><circle cx="60" cy="50" r="42" fill="#e3f3ef"/>
    <circle cx="44" cy="40" r="10" fill="#0f6b59"/><path d="M26 74a18 18 0 0 1 36 0z" fill="#0f6b59"/><circle cx="78" cy="44" r="9" fill="#5fb3a1"/><path d="M62 76a16 16 0 0 1 32 0z" fill="#5fb3a1"/>
    <rect x="70" y="14" width="34" height="20" rx="8" fill="#ffd166"/><path d="M80 34l-4 8 12-8z" fill="#ffd166"/></svg>`,
  star: `<svg class="art small" viewBox="0 0 120 100" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><circle cx="60" cy="50" r="42" fill="#e3f3ef"/>
    <polygon points="60,20 68,40 90,42 73,56 78,78 60,66 42,78 47,56 30,42 52,40" fill="#ffd166" stroke="#0f6b59" stroke-width="3" stroke-linejoin="round"/></svg>`,
  route: `<svg class="art" viewBox="0 0 360 110" role="img" aria-label="Zwei Bahnhöfe sind durch eine Strecke verbunden" xmlns="http://www.w3.org/2000/svg">
    <rect width="360" height="110" rx="18" fill="#e3f3ef"/><path d="M60 70C130 20 230 100 300 40" stroke="#0f6b59" stroke-width="6" fill="none" stroke-dasharray="2 12" stroke-linecap="round"/>
    <circle cx="60" cy="70" r="16" fill="#fff" stroke="#0f6b59" stroke-width="6"/><circle cx="300" cy="40" r="16" fill="#0f6b59"/><circle cx="300" cy="40" r="6" fill="#ffd166"/>
    <rect x="150" y="32" width="48" height="26" rx="8" fill="#0f6b59"/><rect x="157" y="39" width="10" height="9" rx="2" fill="#fff"/><rect x="173" y="39" width="10" height="9" rx="2" fill="#fff"/></svg>`,
  login: `<svg class="art small" viewBox="0 0 120 100" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><circle cx="60" cy="50" r="42" fill="#e3f3ef"/>
    <circle cx="60" cy="38" r="13" fill="#0f6b59"/><path d="M34 74a26 22 0 0 1 52 0z" fill="#0f6b59"/><rect x="68" y="58" width="26" height="22" rx="6" fill="#ffd166" stroke="#0f6b59" stroke-width="3"/><path d="M74 58v-6a7 7 0 0 1 14 0v6" fill="none" stroke="#0f6b59" stroke-width="3"/></svg>`,
  night: `<svg class="art small" viewBox="0 0 120 100" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><circle cx="60" cy="50" r="42" fill="#e3f3ef"/>
    <path d="M70 24a26 26 0 1 0 22 36 22 22 0 0 1-22-36z" fill="#ffd166" stroke="#0f6b59" stroke-width="3" stroke-linejoin="round"/><circle cx="38" cy="30" r="3" fill="#0f6b59"/><circle cx="90" cy="30" r="2.5" fill="#0f6b59"/></svg>`,
  search: `<svg class="art small" viewBox="0 0 120 100" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><circle cx="60" cy="50" r="42" fill="#e3f3ef"/>
    <circle cx="54" cy="46" r="18" fill="#fff" stroke="#0f6b59" stroke-width="6"/><path d="M68 60l18 18" stroke="#0f6b59" stroke-width="8" stroke-linecap="round"/><path d="M46 46h16" stroke="#ffd166" stroke-width="5" stroke-linecap="round"/></svg>`,
  crown: `<svg class="art small" viewBox="0 0 120 100" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><circle cx="60" cy="50" r="42" fill="#e3f3ef"/>
    <path d="M30 72l-4-30 20 14 14-22 14 22 20-14-4 30z" fill="#ffd166" stroke="#0f6b59" stroke-width="3" stroke-linejoin="round"/></svg>`,
};

export const REPORT_TYPES = {
  delay: { label: 'Verspätung', icon: 'clock', tone: 'warn' },
  cancelled: { label: 'Zug fällt aus', icon: 'x-circle', tone: 'bad' },
  on_time: { label: 'Pünktlich', icon: 'check-circle', tone: 'ok' },
  crowded: { label: 'Sehr voll', icon: 'users', tone: 'warn' },
  defect: { label: 'Defekt', icon: 'wrench', tone: 'warn' },
  climate: { label: 'Klima / Temperatur', icon: 'thermometer', tone: 'warn' },
  no_wifi: { label: 'Kein WLAN', icon: 'wifi-off', tone: 'info' },
  toilet: { label: 'Toilette', icon: 'droplet', tone: 'warn' },
  platform_change: { label: 'Gleiswechsel', icon: 'swap', tone: 'warn' },
  other: { label: 'Sonstiges', icon: 'message', tone: 'info' },
};

// Status immer mit Farbe, Symbol UND Text (Barrierefreiheit).
export function delayChip(delay, cancelled) {
  if (cancelled) return `<span class="chip bad">${icon('x-circle')} Fällt aus</span>`;
  if (delay >= 15) return `<span class="chip bad">${icon('clock')} +${delay} Min.</span>`;
  if (delay > 0) return `<span class="chip warn">${icon('clock')} +${delay} Min.</span>`;
  return `<span class="chip ok">${icon('check-circle')} Pünktlich</span>`;
}

export function statusChip(status) {
  if (status === 'confirmed') return `<span class="chip ok">${icon('check-circle')} Bestätigt</span>`;
  if (status === 'disputed') return `<span class="chip bad">${icon('alert')} Umstritten</span>`;
  return `<span class="chip gray">${icon('clock')} Noch unbestätigt</span>`;
}

export function ageText(sec) {
  if (sec < 60) return 'gerade eben';
  if (sec < 3600) return `vor ${Math.floor(sec / 60)} Min.`;
  if (sec < 86400) return `vor ${Math.floor(sec / 3600)} Std.`;
  return `vor ${Math.floor(sec / 86400)} Tagen`;
}

let toastTimer;
export function toast(msg, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'show' + (isError ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = ''), isError ? 5000 : 2800);
}

export function sheet(html) {
  const root = document.getElementById('sheet-root');
  const prevFocus = document.activeElement;
  root.innerHTML = `<div class="scrim"><div class="sheet" role="dialog" aria-modal="true">${html}</div></div>`;
  const scrim = root.firstElementChild;
  const close = () => {
    root.innerHTML = '';
    document.removeEventListener('keydown', onKey);
    prevFocus?.focus?.();
  };
  const onKey = (e) => e.key === 'Escape' && close();
  document.addEventListener('keydown', onKey);
  scrim.addEventListener('click', (e) => e.target === scrim && close());
  root.querySelector('[data-close]')?.addEventListener('click', close);
  root.querySelector('button, input, textarea')?.focus();
  return { el: root.querySelector('.sheet'), close };
}

// Bahnhofssuche mit Autovervollständigung (FR-3).
export function stationPicker(container, { label, placeholder, onPick, initial }) {
  const id = 'sp' + Math.random().toString(36).slice(2, 8);
  container.innerHTML = `<div class="picker"><label for="${id}">${esc(label)}</label>
    <input id="${id}" type="text" autocomplete="off" placeholder="${esc(placeholder || 'Stadt, Bahnhof oder Haltestelle suchen')}" role="combobox" aria-expanded="false" aria-controls="${id}-l" value="${esc(initial?.name || '')}">
    <ul class="suggest" id="${id}-l" role="listbox" hidden></ul></div>`;
  const input = container.querySelector('input');
  const list = container.querySelector('ul');
  let timer;
  let seq = 0;
  const hide = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
  };
  const search = async () => {
    const mine = ++seq;
    list.innerHTML = '<li class="muted suggest-message" role="presentation">Haltestellen werden gesucht …</li>';
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    try {
      const { stations } = await api('GET', `/stations?q=${encodeURIComponent(input.value.trim())}`);
      if (mine !== seq) return;
      const head = input.value.trim()
        ? '<li class="sug-head" role="presentation">Orte und Haltestellen</li>'
        : '<li class="sug-head" role="presentation">Meistgesucht</li>';
      list.innerHTML = stations.length
        ? head + stations.map((s) => `<li role="presentation"><button type="button" role="option" aria-selected="false" data-id="${s.id}">${cicon('pin')}<span>${esc(s.name)}</span>${s.popular ? ' <small>★ beliebt</small>' : ''}</button></li>`).join('')
        : '<li class="muted suggest-message" role="presentation">Keine Haltestelle gefunden. Prüfe die Schreibweise.</li>';
      list.querySelectorAll('button').forEach((b) =>
        b.addEventListener('click', () => {
          const st = stations.find((s) => String(s.id) === b.dataset.id);
          input.value = st.name;
          hide();
          onPick(st);
        })
      );
    } catch (e) {
      if (mine !== seq) return;
      list.innerHTML = `<li class="suggest-message error-text" role="alert">${esc(e.message || 'Die Haltestellensuche ist gerade nicht erreichbar.')}</li>
        <li role="presentation"><button type="button" data-retry>${cicon('refresh')} Erneut suchen</button></li>`;
      list.querySelector('[data-retry]').addEventListener('click', search);
    }
  };
  input.addEventListener('input', () => {
    onPick(null);
    clearTimeout(timer);
    timer = setTimeout(search, 150);
  });
  input.addEventListener('focus', search);
  document.addEventListener('click', (e) => !container.contains(e.target) && hide());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
    if (e.key === 'ArrowDown' && !list.hidden) {
      e.preventDefault();
      list.querySelector('button[role="option"]')?.focus();
    }
    if (e.key === 'Enter' && !list.hidden) {
      const option = list.querySelector('button[role="option"]');
      if (option) {
        e.preventDefault();
        option.click();
      }
    }
  });
  return {
    clear: () => (input.value = ''),
    set: (st) => {
      input.value = st?.name || '';
      onPick(st || null);
    },
  };
}
