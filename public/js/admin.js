import { api, setToken, getToken } from './api.js';
import { esc, toast, REPORT_TYPES } from './ui.js';

const view = document.getElementById('view');
let me = null;
let tab = 'flagged';

const fmt = (ts) => new Date(ts * 1000).toLocaleString('de-DE');

async function boot() {
  if (getToken()) {
    try {
      me = (await api('GET', '/me')).user;
    } catch {
      me = null;
    }
  }
  if (!me || !['admin', 'moderator'].includes(me.role)) return loginView();
  show();
}

function loginView() {
  view.innerHTML = `<section class="card" style="max-width:420px;margin:24px auto"><h2 style="margin-top:0">Admin-Anmeldung</h2>
    <form id="f"><label for="e">E-Mail</label><input id="e" type="email" required>
    <label for="p">Passwort</label><input id="p" type="password" required>
    <div id="err"></div><button class="btn big block" style="margin-top:14px">Anmelden</button></form></section>`;
  document.getElementById('f').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try {
      const r = await api('POST', '/auth/login', { email: val('e'), password: val('p') });
      if (!['admin', 'moderator'].includes(r.user.role)) {
        await api('POST', '/auth/logout', {}).catch(() => {});
        throw new Error('Dieses Konto hat keinen Zugriff auf den Admin-Bereich.');
      }
      setToken(r.token);
      me = r.user;
      show();
    } catch (e) {
      document.getElementById('err').innerHTML = `<div class="error-box" role="alert">${esc(e.message)}</div>`;
    }
  });
}
const val = (id) => document.getElementById(id).value;

function show() {
  const tabs = [['flagged', 'Gemeldet'], ['unconfirmed', 'Unbestätigt'], ['all', 'Alle Meldungen'], ['users', 'Nutzer'], ['log', 'Protokoll'], ['health', 'Systemstatus']];
  view.innerHTML = `<div class="flex between"><span>Angemeldet als <b>${esc(me.display_name)}</b> (${esc(me.role)})</span><button class="btn secondary sm" id="out">Abmelden</button></div>
    <div class="tabbar" role="tablist">${tabs.map(([k, l]) => `<button class="btn sm ${k === tab ? '' : 'secondary'}" data-tab="${k}" role="tab" aria-selected="${k === tab}">${l}</button>`).join('')}</div>
    <div id="panel">Lädt …</div>`;
  document.getElementById('out').addEventListener('click', async () => {
    await api('POST', '/auth/logout', {}).catch(() => {});
    setToken(null);
    me = null;
    loginView();
  });
  view.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; show(); }));
  panel();
}

async function panel() {
  const el = document.getElementById('panel');
  try {
    if (['flagged', 'unconfirmed', 'all'].includes(tab)) return await reportsPanel(el);
    if (tab === 'users') return await usersPanel(el);
    if (tab === 'log') return await logPanel(el);
    return await healthPanel(el);
  } catch (e) {
    el.innerHTML = `<div class="error-box" role="alert">${esc(e.message)}</div>`;
  }
}

async function reportsPanel(el) {
  const { reports } = await api('GET', `/admin/reports?filter=${tab}`);
  el.innerHTML = reports.length
    ? `<div class="tbl"><table><thead><tr><th>Meldung</th><th>Zug</th><th>Nutzer</th><th>Status</th><th>Aktion</th></tr></thead><tbody>${reports.map((r) => `<tr>
      <td><b>${esc(REPORT_TYPES[r.type]?.label || r.type)}${r.minutes ? ` (${r.minutes} Min.)` : ''}</b><br>${esc(r.comment || '')}<br><span class="muted small">${fmt(r.created_at)}</span></td>
      <td>${esc(r.line)} → ${esc(r.headsign)}</td>
      <td>${esc(r.display_name)}<br><span class="muted small">Vertrauen ${(+r.trust_score).toFixed(2)}${r.banned ? ' · gesperrt' : ''}</span></td>
      <td>${esc(r.status)}<br><span class="muted small">${r.confirms}✓ ${r.disputes}✗ · ${r.flags} Hinweise · Standort ${r.location_ok ? 'ok' : 'nein'}</span></td>
      <td class="flex"><button class="btn sm" data-a="approve" data-id="${r.id}">Bestätigen</button><button class="btn sm secondary" data-a="reject" data-id="${r.id}">Ablehnen</button><button class="btn sm danger" data-a="remove" data-id="${r.id}">Entfernen</button>
      <button class="btn sm secondary" data-ban="${r.user_id}">Nutzer sperren</button></td></tr>`).join('')}</tbody></table></div>`
    : '<div class="empty">Nichts zu tun. 🎉</div>';
  el.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', async () => {
    const note = prompt('Notiz fürs Protokoll (freiwillig):') ?? '';
    try {
      await api('POST', `/admin/reports/${b.dataset.id}/action`, { action: b.dataset.a, note });
      toast('Erledigt');
      panel();
    } catch (e) { toast(e.message, true); }
  }));
  el.querySelectorAll('[data-ban]').forEach((b) => b.addEventListener('click', () => ban(b.dataset.ban, 'ban')));
}

async function ban(id, what) {
  const note = prompt('Grund (freiwillig):') ?? '';
  try {
    await api('POST', `/admin/users/${id}/${what}`, { note });
    toast(what === 'ban' ? 'Nutzer gesperrt' : 'Sperre aufgehoben');
    panel();
  } catch (e) { toast(e.message, true); }
}

async function usersPanel(el) {
  el.innerHTML = `<label for="uq">Suche (Name oder E-Mail)</label><input id="uq"><div id="ul" style="margin-top:12px"></div>`;
  const load = async () => {
    const { users } = await api('GET', `/admin/users?q=${encodeURIComponent(val('uq'))}`);
    document.getElementById('ul').innerHTML = `<div class="tbl"><table><thead><tr><th>Nutzer</th><th>Rolle</th><th>Aktion</th></tr></thead><tbody>${users.map((u) => `<tr>
      <td><b>${esc(u.display_name)}</b><br><span class="muted small">${esc(u.email)} · Vertrauen ${(+u.trust_score).toFixed(2)}${u.banned ? ' · <b>gesperrt</b>' : ''}</span></td>
      <td>${me.role === 'admin' && u.id !== me.id ? `<select data-role="${u.id}" aria-label="Rolle">${['user', 'moderator', 'admin'].map((r) => `<option ${r === u.role ? 'selected' : ''}>${r}</option>`).join('')}</select>` : esc(u.role)}</td>
      <td>${u.id === me.id ? '' : u.banned ? `<button class="btn sm secondary" data-unban="${u.id}">Entsperren</button>` : `<button class="btn sm danger" data-ban="${u.id}">Sperren</button>`}</td></tr>`).join('')}</tbody></table></div>`;
    el.querySelectorAll('[data-ban]').forEach((b) => b.addEventListener('click', async () => { await ban(b.dataset.ban, 'ban'); }));
    el.querySelectorAll('[data-unban]').forEach((b) => b.addEventListener('click', async () => { await ban(b.dataset.unban, 'unban'); }));
    el.querySelectorAll('[data-role]').forEach((s) => s.addEventListener('change', async () => {
      try { await api('POST', `/admin/users/${s.dataset.role}/role`, { role: s.value }); toast('Rolle geändert'); } catch (e) { toast(e.message, true); load(); }
    }));
  };
  document.getElementById('uq').addEventListener('input', () => { clearTimeout(load.t); load.t = setTimeout(load, 250); });
  load();
}

async function logPanel(el) {
  const { log } = await api('GET', '/admin/log');
  el.innerHTML = log.length
    ? `<div class="tbl"><table><thead><tr><th>Zeit</th><th>Wer</th><th>Aktion</th><th>Ziel</th><th>Notiz</th></tr></thead><tbody>${log.map((l) => `<tr><td>${fmt(l.created_at)}</td><td>${esc(l.actor || '–')}</td><td>${esc(l.action)}</td><td>${esc(l.target_type)} #${l.target_id}</td><td>${esc(l.note || '')}</td></tr>`).join('')}</tbody></table></div>`
    : '<div class="empty">Noch keine Aktionen.</div>';
}

async function healthPanel(el) {
  const h = await api('GET', '/admin/health');
  const rows = [['Datenbank', h.database], ['Datenquelle', h.data_source === 'demo' ? 'Demo (Beispieldaten)' : h.data_source], ['Fahrten heute', h.trips_today], ['Nutzer', h.users], ['Meldungen', h.reports], ['Offene Hinweise', h.open_flags], ['Gespeicherte Standorte (max. 24 h)', h.stored_locations], ['Letzte Bereinigung', h.last_cleanup ? fmt(h.last_cleanup) : 'noch nie']];
  el.innerHTML = `<div class="tbl"><table><tbody>${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table></div>`;
}

boot();
