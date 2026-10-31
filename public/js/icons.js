// Zweifarbige, animierte Icons (eigene SVGs, offline). Farben kommen aus CSS-Variablen in glass.css.
const B = 'var(--c-blue)';
const L = 'var(--c-light)';
const Y = 'var(--c-yellow)';
const R = 'var(--c-red)';
const G = 'var(--c-green)';
const M = 'var(--c-magenta)';
const W = '#fff';

const C = {
  home: `<path d="M3 11 12 3l9 8v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 20z" fill="${L}"/><path d="M2.5 11.5 12 3.5l9.5 8" fill="none" stroke="${B}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><rect x="9.5" y="13" width="5" height="8.5" rx="1.5" fill="${B}"/>`,
  search: `<circle cx="10.5" cy="10.5" r="7" fill="${L}"/><circle cx="10.5" cy="10.5" r="7" fill="none" stroke="${B}" stroke-width="2.4"/><path d="m16 16 5 5" stroke="${Y}" stroke-width="3" stroke-linecap="round"/>`,
  map: `<path d="M3 6.5 9 4v14l-6 2.5z" fill="${L}"/><path d="M9 4l6 2.5v14L9 18z" fill="${G}" opacity=".85"/><path d="M15 6.5 21 4v14l-6 2.5z" fill="${L}"/><g class="a-bob"><path d="M12 2.5a4 4 0 0 1 4 4c0 3-4 6.5-4 6.5S8 9.500 8 6.500a4 4 0 0 1 4-4z" fill="${R}"/><circle cx="12" cy="6.5" r="1.6" fill="${W}"/></g>`,
  pin: `<g class="a-bob"><path d="M12 2a7 7 0 0 1 7 7c0 5.500-7 13-7 13S5 14.500 5 9a7 7 0 0 1 7-7z" fill="${R}"/><circle cx="12" cy="9" r="2.800" fill="${W}"/></g><ellipse cx="12" cy="22" rx="4" ry="1" fill="${B}" opacity=".25"/>`,
  near: `<circle class="a-ping" cx="12" cy="12" r="9" fill="none" stroke="${B}" stroke-width="1.6"/><circle cx="12" cy="12" r="5.500" fill="${L}"/><circle cx="12" cy="12" r="2.600" fill="${B}"/><path d="M12 1.500v3M12 19.500v3M1.500 12h3M19.500 12h3" stroke="${B}" stroke-width="2" stroke-linecap="round"/>`,
  live: `<circle class="a-ping" cx="12" cy="12" r="10" fill="${G}" opacity=".35"/><circle class="a-ping2" cx="12" cy="12" r="7" fill="${G}" opacity=".35"/><circle cx="12" cy="12" r="4" fill="${G}"/>`,
  bike: `<circle cx="5.500" cy="16" r="4" fill="none" stroke="${B}" stroke-width="2"/><circle cx="18.500" cy="16" r="4" fill="none" stroke="${B}" stroke-width="2"/><g class="a-wiggle"><path d="M5.500 16 9 8h6l3.500 8M9 8l3.500 8M12.500 16 15 8" fill="none" stroke="${G}" stroke-width="2.200" stroke-linecap="round" stroke-linejoin="round"/><path d="M7.500 6.500H10M14.500 6h2.500" stroke="${Y}" stroke-width="2.600" stroke-linecap="round"/></g>`,
  community: `<circle cx="8" cy="8" r="3.500" fill="${B}"/><path d="M1.500 20a6.500 6.500 0 0 1 13 0z" fill="${B}"/><g class="a-bob"><circle cx="17" cy="9" r="3" fill="${Y}"/><path d="M11.500 20a5.500 5.500 0 0 1 11 0z" fill="${Y}"/></g>`,
  bell: `<g class="a-swing"><path d="M12 3a6 6 0 0 0-6 6c0 5-2.500 7-2.500 7h17S18 14 18 9a6 6 0 0 0-6-6z" fill="${Y}"/><path d="M9.800 19a2.400 2.400 0 0 0 4.400 0z" fill="${B}"/></g><circle cx="18.500" cy="5" r="3" fill="${R}"/>`,
  ticket: `<path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2.500a2.500 2.500 0 0 0 0 5V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2.500a2.500 2.500 0 0 0 0-5z" fill="${B}"/><path d="M14.500 5v14" stroke="${W}" stroke-width="1.600" stroke-dasharray="2 2.200"/><path d="m7 12 2 2 3-4" fill="none" stroke="${W}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  faq: `<path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" fill="${L}"/><path d="M9.500 9.500a2.500 2.500 0 1 1 3.500 2.300c-.7.400-1 .8-1 1.700" fill="none" stroke="${B}" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="15.700" r="1.100" fill="${B}"/>`,
  gear: `<g class="a-spin"><path d="M12 1.500l2 2.500 3.200-.7.8 3.200 3 1.300-1.200 3 1.200 3-3 1.300-.8 3.200-3.200-.7-2 2.500-2-2.500-3.200.7-.8-3.200-3-1.300 1.200-3-1.200-3 3-1.300.8-3.200L10 4z" fill="${B}"/><circle cx="12" cy="12" r="3.500" fill="${W}"/></g>`,
  user: `<circle cx="12" cy="8" r="4.500" fill="${B}"/><path d="M3.500 21.500a8.500 8.500 0 0 1 17 0z" fill="${L}"/><path d="M3.500 21.500a8.500 8.500 0 0 1 17 0" fill="none" stroke="${B}" stroke-width="2"/>`,
  train: `<rect x="4" y="2.500" width="16" height="15" rx="5" fill="${B}"/><rect x="6.500" y="5.500" width="11" height="6" rx="2" fill="${L}"/><circle cx="8.500" cy="14.500" r="1.400" fill="${Y}"/><circle cx="15.500" cy="14.500" r="1.400" fill="${Y}"/><path d="M7.500 17.500 5.500 21.500M16.500 17.500l2 4" stroke="${B}" stroke-width="2.200" stroke-linecap="round"/>`,
  route: `<circle cx="5.500" cy="18" r="3" fill="${G}"/><circle cx="18.500" cy="6" r="3" fill="${R}"/><path class="a-dash" d="M5.500 15c0-6 13-3 13-6" fill="none" stroke="${B}" stroke-width="2.200" stroke-linecap="round" stroke-dasharray="1 4.500"/>`,
  warn: `<path d="M12 2.500 22.500 20.500a1 1 0 0 1-.9 1.500H2.400a1 1 0 0 1-.9-1.500z" fill="${Y}"/><g class="a-bob"><path d="M12 9v5.500" stroke="${B}" stroke-width="2.400" stroke-linecap="round"/><circle cx="12" cy="17.800" r="1.300" fill="${B}"/></g>`,
  swap: `<path d="M7 3 3 7l4 4M3 7h14M17 21l4-4-4-4M21 17H7" fill="none" stroke="${B}" stroke-width="2.400" stroke-linecap="round" stroke-linejoin="round"/>`,
  star: `<path d="m12 2.500 2.900 6 6.600.9-4.800 4.600 1.200 6.500L12 17.400 6.100 20.500l1.200-6.500L2.500 9.400l6.600-.9z" fill="${Y}" stroke="${B}" stroke-width="1.400" stroke-linejoin="round"/>`,
  wagon: `<rect x="1.500" y="6" width="9" height="9" rx="2.500" fill="${B}"/><rect x="13" y="6" width="9" height="9" rx="2.500" fill="${L}" stroke="${B}" stroke-width="1.600"/><rect x="3.500" y="8" width="5" height="3" rx="1" fill="${L}"/><circle cx="5" cy="18" r="1.800" fill="${B}"/><circle cx="18" cy="18" r="1.800" fill="${B}"/>`,
  lock: `<rect x="4.500" y="10" width="15" height="11" rx="3" fill="${Y}"/><path d="M8 10V7.500a4 4 0 0 1 8 0V10" fill="none" stroke="${B}" stroke-width="2.200"/><circle cx="12" cy="15.500" r="1.600" fill="${B}"/>`,
  shield: `<path d="M12 2.500 20 6v6c0 5-3.500 8.500-8 10-4.500-1.500-8-5-8-10V6z" fill="${G}"/><path d="m8 12 3 3 5-6" fill="none" stroke="${W}" stroke-width="2.400" stroke-linecap="round" stroke-linejoin="round"/>`,
  clock: `<circle cx="12" cy="12" r="9.500" fill="${L}" stroke="${B}" stroke-width="2"/><path d="M12 6.500V12l3.500 2" fill="none" stroke="${B}" stroke-width="2.200" stroke-linecap="round"/>`,
  bus: `<rect x="3.500" y="3" width="17" height="15" rx="3.500" fill="${M}"/><rect x="6" y="6" width="12" height="5.500" rx="1.500" fill="${W}" opacity=".9"/><circle cx="8" cy="14.500" r="1.200" fill="${W}"/><circle cx="16" cy="14.500" r="1.200" fill="${W}"/><path d="M6.500 18v2.500M17.500 18v2.500" stroke="${M}" stroke-width="2.400" stroke-linecap="round"/>`,
  trash: `<path d="M5 7h14l-1 13a1.500 1.500 0 0 1-1.500 1.500h-9A1.500 1.500 0 0 1 6 20z" fill="${R}"/><path d="M3.500 7h17M9.500 7V4.500h5V7" fill="none" stroke="${B}" stroke-width="2" stroke-linecap="round"/>`,
};

export const cicon = (name, cls = '') =>
  `<svg class="ci ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${C[name] || ''}</svg>`;

// Linienfarben: Farbe und Name der Linie stehen immer zusammen sichtbar.
const LINE_COLORS = [
  [/^S\d/i, '#00814a', 'S-Bahn'],
  [/^U\d/i, '#0a58b0', 'U-Bahn'],
  [/^(ICE|IC|EC|RJX?|NJ|TGV)/i, '#1c2430', 'Fernverkehr'],
  [/^(RE|MEX|IRE|RS)/i, '#c8102e', 'Regional-Express'],
  [/^(RB|R\d)/i, '#8a2b3b', 'Regionalbahn'],
  [/^(BUS|X\d|\d{2,3}$)/i, '#c4006b', 'Bus'],
  [/^(STR|TRAM)/i, '#b3261e', 'Straßenbahn'],
];

export function lineInfo(line) {
  const l = String(line || '').trim();
  for (const [re, color, label] of LINE_COLORS) if (re.test(l)) return { color, label };
  return { color: '#4a5b78', label: 'Linie' };
}

// Färbt alle .line-tag-Elemente nach der Linienart ein.
export function colorizeLines(root) {
  root.querySelectorAll('.line-tag:not([data-c])').forEach((el) => {
    const { color, label } = lineInfo(el.textContent);
    el.dataset.c = '1';
    el.style.background = color;
    el.title = label;
  });
}

// Zeichnungen für leere Zustände
export const PIC = {
  moon: `<svg class="art small" viewBox="0 0 120 100" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><circle cx="60" cy="50" r="42" fill="var(--c-light)"/><path d="M72 30a22 22 0 1 0 8 36 18 18 0 0 1-8-36z" fill="var(--c-yellow)"/><circle cx="82" cy="30" r="2.500" fill="var(--c-blue)"/><circle cx="90" cy="44" r="1.800" fill="var(--c-blue)"/><circle cx="44" cy="26" r="1.800" fill="var(--c-blue)"/></svg>`,
  map: `<svg class="art small" viewBox="0 0 120 100" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><circle cx="60" cy="50" r="42" fill="var(--c-light)"/><path d="M30 36 48 30v38l-18 6z" fill="#fff"/><path d="M48 30l24 8v38l-24-8z" fill="var(--c-green)" opacity=".8"/><path d="M72 38l18-8v38l-18 8z" fill="#fff"/><path class="a-bob" d="M60 14a10 10 0 0 1 10 10c0 8-10 17-10 17S50 32 50 24a10 10 0 0 1 10-10z" fill="var(--c-red)"/><circle cx="60" cy="24" r="4" fill="#fff"/></svg>`,
};
