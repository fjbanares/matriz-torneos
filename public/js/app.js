'use strict';

// ---------- Utilidades ----------
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, k) => a + k);
const same = (a, b) => String(a) === String(b);
const uid = () => 'l' + Math.random().toString(36).slice(2, 9);
const SCORES = [1, 2, 3, 4, 5, 6, 7];
const legendText = (s) => (s === 1 ? '0-20' : s === 7 ? '20-0' : String(s));
const EYE_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M3 3l18 18"/></svg>';

const S = {
  meta: null,        // catálogo del servidor: juegos, disposiciones, límites
  user: null,        // usuario con sesión
  list: [],          // torneos del usuario
  T: null,           // torneo abierto (copia de trabajo)
  tid: null,         // id del torneo abierto
  activeId: null,    // matriz visible
  pending: null,     // acción pendiente de confirmar
  busyRow: null,     // fila en la que se están calculando sugerencias
  listEdit: null,    // lista de rival que se está editando
  dirty: false,      // hay cambios sin guardar
  version: 0,        // contador de cambios (para saber si un guardado ya está al día)
  timer: null,
  chain: Promise.resolve(),
  opener: null,
  restoreFocus: true,
};

function setMsg(node, text = '', type = '') {
  node.textContent = text;
  node.className = `msg ${type}`.trim();
}
const setStatus = (t) => { $('status').textContent = t; };
function setSaveStatus(text, type = '') {
  const el = $('save-status');
  el.textContent = text;
  el.className = `save-status ${type}`.trim();
}

// ---------- API ----------
async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return {};
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Ha ocurrido un error inesperado');
    err.status = res.status;
    err.code = data.code;
    err.details = data.details;
    throw err;
  }
  return data;
}

function failGlobal(err) {
  if (err.status === 401) return showLogin('Tu sesión ha caducado. Vuelve a entrar.', 'error');
  if (err.code === 'PASSWORD_CHANGE_REQUIRED') return showPassword();
  setMsg($('global-msg'), err.message, 'error');
}

// ---------- Espera visible (spinner) ----------
// Desactiva el botón, muestra un spinner con texto y lo restaura al terminar
async function withBusy(btn, label, fn) {
  const original = btn.textContent;
  const wasDisabled = btn.disabled;
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  btn.innerHTML = `<span class="spinner" aria-hidden="true"></span><span>${esc(label)}</span>`;
  try {
    return await fn();
  } finally {
    btn.textContent = original;
    btn.disabled = wasDisabled;
    btn.removeAttribute('aria-busy');
  }
}

// ---------- Vistas y navegación ----------
const VIEWS = ['v-login', 'v-list', 'v-tournament', 'v-admin', 'v-password', 'v-guide'];
const VIEW_NAV = { 'v-list': 'list', 'v-tournament': 'list', 'v-admin': 'admin', 'v-guide': 'list' };

function showView(id) {
  VIEWS.forEach((v) => { $(v).hidden = v !== id; });
  $('site').hidden = id === 'v-login';
  const current = VIEW_NAV[id];
  document.querySelectorAll('.nav-btn[data-go]').forEach((b) => {
    if (b.dataset.go === current) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  setMsg($('global-msg'));
}

function setNavRestricted(restricted) {
  document.querySelectorAll('.nav-btn[data-go]').forEach((b) => {
    const isAdmin = b.dataset.go === 'admin';
    b.hidden = (isAdmin && S.user?.role !== 'superadmin') || restricted;
  });
}

// ---------- Sesión ----------
async function start() {
  try {
    const { user } = await api('/auth/me');
    S.user = user;
    await enterApp();
  } catch {
    showLogin();
  }
}

async function enterApp() {
  $('who').textContent = S.user.username;
  // Primero la contraseña temporal: el catálogo está protegido y no se puede pedir antes
  if (S.user.must_change_password) return showPassword();
  if (!S.meta) S.meta = await api('/tournaments/meta');
  setNavRestricted(false);
  showList();
}

function showLogin(message = '', type = '') {
  S.user = null;
  S.T = null;
  S.tid = null;
  S.dirty = false;
  showView('v-login');
  setMsg($('login-msg'), message, type);
  $('login-username').focus();
}

function showPassword() {
  setNavRestricted(true);
  showView('v-password');
  $('password-title').focus();
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.currentTarget.querySelector('button');
  btn.disabled = true;
  try {
    const { user } = await api('/auth/login', {
      method: 'POST',
      body: { username: $('login-username').value, password: $('login-password').value },
    });
    S.user = user;
    $('login-password').value = '';
    setMsg($('login-msg'));
    await enterApp();
  } catch (err) {
    $('login-password').value = '';
    if (err.code === 'PASSWORD_CHANGE_REQUIRED') return showPassword();
    setMsg($('login-msg'), err.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

$('password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  // Guardar el formulario antes de cualquier await: después, e.currentTarget ya es null
  const form = e.currentTarget;
  const msg = $('password-msg');
  const nw = $('new-password').value;
  if (nw !== $('confirm-password').value) return setMsg(msg, 'Las contraseñas nuevas no coinciden', 'error');
  try {
    const { user } = await withBusy(form.querySelector('button'), 'Guardando…', () =>
      api('/auth/change-password', {
        method: 'POST',
        body: { currentPassword: $('current-password').value, newPassword: nw },
      }));
    S.user = user;
    form.reset();
    setMsg(msg);
    setStatus('Contraseña actualizada.');
    await enterApp();
  } catch (err) {
    setMsg(msg, err.message, 'error');
  }
});

async function logout() {
  await flush();
  await api('/auth/logout', { method: 'POST' }).catch(() => {});
  showLogin('Has cerrado sesión.');
}

// ---------- Lista de torneos ----------
async function showList() {
  await flush();
  S.T = null;
  S.tid = null;
  showView('v-list');
  $('list-title').focus();
  try {
    const { tournaments } = await api('/tournaments');
    S.list = tournaments;
    renderList();
  } catch (err) {
    failGlobal(err);
  }
}

function renderList() {
  $('t-list').innerHTML = S.list.map((t) => `
    <li class="t-item">
      <div>
        <h3>${esc(t.title)}</h3>
        <p class="muted">${esc(t.teamName)} · ${esc(t.gameLabel)} · ${t.playersPerTeam} × ${t.playersPerTeam} · ${t.matrixCount} ${t.matrixCount === 1 ? 'matriz' : 'matrices'}</p>
      </div>
      <div class="t-actions">
        <button type="button" class="btn" data-action="open" data-id="${t.id}">Abrir<span class="sr-only"> ${esc(t.title)}</span></button>
        <button type="button" class="btn danger" data-action="del-tournament" data-id="${t.id}">Eliminar<span class="sr-only"> ${esc(t.title)}</span></button>
      </div>
    </li>`).join('');
  $('t-empty').hidden = S.list.length > 0;
}

// ---------- Diálogo nuevo torneo (dos caminos: desde cero o desde BCP) ----------
const newMode = () => $('new-form').mode.value;

// Muestra los detalles técnicos de un fallo de lectura de BCP (etapa, pares encontrados, texto visto)
function showBcpDetails(err) {
  const pre = $('bcp-debug');
  if (err && err.details) {
    pre.textContent = JSON.stringify(err.details, null, 2);
    pre.hidden = false;
  } else {
    pre.textContent = '';
    pre.hidden = true;
  }
}

function syncNewMode() {
  const bcp = newMode() === 'bcp';
  $('mode-manual').hidden = bcp;
  $('mode-bcp').hidden = !bcp;
  $('new-submit').textContent = bcp ? 'Importar torneo' : 'Crear torneo';
  $('new-submit').disabled = bcp && !S.bcpReady;
  setMsg($('new-msg'));
}

function openNewDialog() {
  S.opener = document.activeElement;
  S.restoreFocus = true;
  S.bcpReady = false;
  $('nt-game').innerHTML = S.meta.games.map((g) =>
    `<option value="${g.key}" ${g.available ? '' : 'disabled'}>${esc(g.label)}${g.available ? '' : ' (próximamente)'}</option>`).join('');
  const first = S.meta.games.find((g) => g.available);
  if (first) $('nt-game').value = first.key;
  $('nt-ppt').innerHTML = range(S.meta.minPlayers, S.meta.maxPlayers).map((n) =>
    `<option value="${n}" ${n === 5 ? 'selected' : ''}>${n} × ${n}</option>`).join('');
  $('new-form').reset();
  $('bcp-result').hidden = true;
  $('nt-bcp-team').innerHTML = '';
  showBcpDetails(null);
  syncNewMode();
  $('new-dialog').showModal();
  $('nt-name').focus();
}

function closeNewDialog(restore) {
  S.restoreFocus = restore;
  const dlg = $('new-dialog');
  if (dlg.open) dlg.close();
}

$('new-dialog').addEventListener('close', () => {
  if (S.restoreFocus && S.opener && S.opener.focus) S.opener.focus();
  S.opener = null;
});

$('open-new').addEventListener('click', openNewDialog);
$('open-guide').addEventListener('click', () => { showView('v-guide'); $('guide-h').focus(); });
$('guide-back').addEventListener('click', () => showList());

$('new-form').addEventListener('change', (e) => {
  if (e.target.name === 'mode') syncNewMode();
});
$('nt-link').addEventListener('input', () => { S.bcpReady = false; syncNewMode(); });

// Paso 1 (BCP): leer el evento y mostrar sus equipos
$('bcp-read').addEventListener('click', async () => {
  const link = $('nt-link').value.trim();
  if (!link) return setMsg($('new-msg'), 'Pega el enlace del evento.', 'error');
  const btn = $('bcp-read');
  setMsg($('new-msg'), 'Leyendo el evento en BCP. Puede tardar hasta un minuto…');
  try {
    const data = await withBusy(btn, 'Leyendo evento…', () =>
      api('/tournaments/bcp/preview', { method: 'POST', body: { link } }));
    showBcpDetails(null);
    $('bcp-title').textContent = `${data.title} · ${data.teams.length} equipos`;
    $('nt-bcp-team').innerHTML = data.teams.map((t) =>
      `<option value="${esc(t.name)}">${esc(t.name)} (${t.playerCount} jugadores)</option>`).join('');
    $('bcp-result').hidden = false;
    S.bcpReady = true;
    syncNewMode();
    setMsg($('new-msg'), 'Elige tu equipo y pulsa "Importar torneo".', 'ok');
    $('nt-bcp-team').focus();
  } catch (err) {
    S.bcpReady = false;
    syncNewMode();
    if (err.status === 401) return showLogin('Tu sesión ha caducado. Vuelve a entrar.', 'error');
    setMsg($('new-msg'), err.message, 'error');
    showBcpDetails(err);
  }
});

$('new-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const gameType = $('nt-game').value;

  if (newMode() === 'bcp') {
    if (!S.bcpReady) return setMsg($('new-msg'), 'Lee primero el evento.', 'error');
    try {
      setMsg($('new-msg'), 'Importando el torneo. Puede tardar un minuto…');
      const { id, warnings } = await withBusy($('new-submit'), 'Importando…', () =>
        api('/tournaments/bcp/import', {
          method: 'POST',
          body: { link: $('nt-link').value.trim(), teamName: $('nt-bcp-team').value },
        }));
      closeNewDialog(false);
      await openTournament(id);
      setStatus('Torneo importado desde Best Coast Pairings.');
      if (warnings && warnings.length) setMsg($('global-msg'), `Avisos de importación: ${warnings.join(' · ')}`, 'error');
    } catch (err) {
      if (err.status === 401) return showLogin('Tu sesión ha caducado. Vuelve a entrar.', 'error');
      setMsg($('new-msg'), err.message, 'error');
      showBcpDetails(err);
    }
    return;
  }

  const name = $('nt-name').value.trim();
  const team = $('nt-team').value.trim();
  if (!name) return setMsg($('new-msg'), 'Escribe el nombre del torneo.', 'error');
  if (!team) return setMsg($('new-msg'), 'Escribe el nombre de tu equipo.', 'error');
  try {
    const { id } = await withBusy($('new-submit'), 'Creando…', () =>
      api('/tournaments', {
        method: 'POST',
        body: { name, teamName: team, gameType, setupMode: 'manual', playersPerTeam: Number($('nt-ppt').value) },
      }));
    closeNewDialog(false);
    await openTournament(id);
    setStatus(`Torneo "${name}" creado.`);
  } catch (err) {
    if (err.status === 401) return showLogin('Tu sesión ha caducado. Vuelve a entrar.', 'error');
    setMsg($('new-msg'), err.message, 'error');
  }
});

// ---------- Torneo: carga y guardado ----------
async function openTournament(id) {
  await flush();
  try {
    const data = await api(`/tournaments/${id}`);
    S.tid = id;
    S.T = data;
    S.dirty = false;
    S.version = 0;
    S.activeId = S.T.matrices[0]?.id ?? null;
    showView('v-tournament');
    renderTournament();
    setSaveStatus('');
    $('tournament-title').focus();
  } catch (err) {
    failGlobal(err);
  }
}

function serialize(T) {
  return {
    title: T.title,
    teamName: T.teamName,
    playersPerTeam: T.playersPerTeam,
    own: T.own.map((p) => ({ name: p.name, faction: p.faction, disposition: p.disposition })),
    matrices: T.matrices.map((m) => ({
      rivalName: m.rivalName,
      rivals: m.rivals.map((r) => ({ name: r.name, faction: r.faction, disposition: r.disposition, listText: r.listText ?? '', listUrl: r.listUrl ?? null })),
      hiddenCols: m.hiddenCols,
      hiddenRows: m.hiddenRows,
      cells: m.cells,
      mapCells: ensureMapCells(m, S.T.playersPerTeam),
    })),
  };
}

// Cada cambio marca el torneo como pendiente y programa un guardado tras una pausa corta
function touch() {
  if (!S.T) return;
  S.dirty = true;
  S.version++;
  clearTimeout(S.timer);
  setSaveStatus('Cambios sin guardar…');
  S.timer = setTimeout(save, 600);
}

// Los guardados se encadenan para que nunca lleguen en desorden
function save() {
  clearTimeout(S.timer);
  S.timer = null;
  S.chain = S.chain.then(doSave);
  return S.chain;
}

async function doSave() {
  if (!S.T || !S.dirty) return;
  const tid = S.tid;
  const version = S.version;
  const body = serialize(S.T);
  setSaveStatus('Guardando…');
  try {
    await api(`/tournaments/${tid}`, { method: 'PUT', body });
    if (S.tid === tid && version === S.version) {
      S.dirty = false;
      setSaveStatus('Guardado');
    } else {
      setSaveStatus('Cambios sin guardar…');
    }
  } catch (err) {
    if (err.status === 401) return showLogin('Tu sesión ha caducado. Vuelve a entrar.', 'error');
    setSaveStatus(`No se pudo guardar: ${err.message}`, 'error');
  }
}

function flush() {
  if (S.T && S.dirty) return save();
  return Promise.resolve();
}

window.addEventListener('beforeunload', (e) => {
  if (S.dirty) { e.preventDefault(); e.returnValue = ''; }
});

// ---------- Torneo: vista ----------
const activeMatrix = () => (S.T ? S.T.matrices.find((m) => same(m.id, S.activeId)) ?? null : null);
const matrixIndex = (id) => S.T.matrices.findIndex((m) => same(m.id, id));
// Ejércitos ordenados alfabéticamente en todos los selectores
const factionsOf = () => [...(S.meta.games.find((g) => g.key === S.T.game)?.factions ?? [])]
  .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
const dispOf = (key) => S.meta.dispositions.find((d) => d.key === key);
const dispClass = (key) => (dispOf(key) ? `disp-${dispOf(key).color}` : '');
const scoreClass = (v) => (v ? `sc-${v}` : '');
// Estrella de "elige mapa": activa = rellena; inactiva = solo contorno
const STAR_PATH = 'M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.9L12 17.8 5.8 21l1.2-6.9-5-4.9 6.9-1z';
const WAND_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 20L14 10"/><path d="M15 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1z"/><path d="M19 12l.7 1.3 1.3.7-1.3.7-.7 1.3-.7-1.3-1.3-.7 1.3-.7z"/></svg>';
const REPORT_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 3h6v3H9z"/><path d="M8 11h8M8 15h8M8 19h5"/></svg>';
const starIcon = (on) => (on
  ? `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${STAR_PATH}"/></svg>`
  : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="${STAR_PATH}"/></svg>`);
// Garantiza la matriz de marcas (torneos o matrices sin este campo)
function ensureMapCells(m, n) {
  if (!Array.isArray(m.mapCells)) m.mapCells = Array.from({ length: n }, () => Array(n).fill(false));
  return m.mapCells;
}

function avg(values) {
  const nums = values.filter((v) => Number.isFinite(v));
  return nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1) : '–';
}
const rowAvg = (m, i) => avg(m.cells[i]);
const colAvg = (m, j) => avg(m.cells.map((row) => row[j]));
const allAvg = (m) => avg(m.cells.flat());

function renderTournament() {
  const T = S.T;
  $('tournament-title').textContent = T.title;
  $('tournament-meta').textContent = `${T.teamName} · ${T.gameLabel} · ${T.playersPerTeam} × ${T.playersPerTeam}`;
  renderTabs();
  renderPanel();
}

function renderTabs() {
  const tabs = S.T.matrices.map((m, i) => {
    const sel = same(m.id, S.activeId);
    return `<button type="button" role="tab" id="tab-${m.id}" aria-selected="${sel}" aria-controls="matrix-panel"
      tabindex="${sel ? 0 : -1}" data-tab="${m.id}" title="${esc(m.rivalName)}">${i + 1} · ${esc(m.rivalName)}</button>`;
  }).join('');
  $('tabs').innerHTML = tabs + `<button type="button" class="btn add-tab" data-action="add-matrix">+ Matriz</button>`;
}


function renderEmpty() {
  const panel = $('matrix-panel');
  panel.removeAttribute('aria-labelledby');
  panel.innerHTML = `<div class="empty"><p>Este torneo todavía no tiene matrices.</p>
    <button type="button" class="btn primary" data-action="add-matrix">Crear la primera matriz</button></div>`;
}

function renderPanel() {
  const m = activeMatrix();
  if (!m) return renderEmpty();

  const T = S.T;
  const idx = matrixIndex(m.id);
  const isFirst = idx === 0;
  const n = T.playersPerTeam;
  const cols = range(0, n - 1);
  const totalCols = 3 + n + 1;
  const factions = factionsOf();

  const facOpts = (v) => `<option value="">Elige ejército</option>` +
    factions.map((f) => `<option value="${esc(f)}" ${f === v ? 'selected' : ''}>${esc(f)}</option>`).join('');
  const dispOpts = (v) => `<option value="">Disposición</option>` +
    S.meta.dispositions.map((d) => `<option value="${d.key}" ${d.key === v ? 'selected' : ''}>${esc(d.label)}</option>`).join('');
  const scoreOpts = (v) => `<option value="">–</option>` +
    SCORES.map((s) => `<option value="${s}" ${s === v ? 'selected' : ''}>${s}</option>`).join('');

  const colgroup = `<colgroup><col class="col-name"><col class="col-fac"><col class="col-disp">${
    cols.map((j) => (m.hiddenCols[j] ? '<col class="col-hidden">' : '<col class="col-rival">')).join('')
  }<col class="col-avg"></colgroup>`;

  const r1 = cols.map((j) => {
    const label = `columna ${j + 1}${m.rivals[j].name ? ' (' + m.rivals[j].name + ')' : ''}`;
    if (m.hiddenCols[j]) return `<th scope="col" class="c-hidden">${eyeBtn('toggle-col', j, true, label)}</th>`;
    return `<th scope="col"><div class="cf">${eyeBtn('toggle-col', j, false, label)}
      <input class="rival-name-in" data-action="rival-player-name" data-j="${j}" value="${esc(m.rivals[j].name)}"
        placeholder="Rival ${j + 1}" aria-label="Nombre del jugador rival ${j + 1}"></div></th>`;
  }).join('');
  const listControl = (j) => {
    const rv = m.rivals[j];
    const who = esc(rv.name || 'rival ' + (j + 1));
    if (rv.listUrl) {
      return `<a class="report" href="${esc(rv.listUrl)}" target="_blank" rel="noopener noreferrer"
        aria-label="Ver la lista de ${who} en BCP (se abre en una ventana nueva)" title="Ver la lista en BCP">${REPORT_SVG}</a>`;
    }
    return `<button type="button" class="report" data-action="list-open" data-j="${j}"
      aria-label="Ver o editar la lista de ${who}" title="Lista del rival">${REPORT_SVG}</button>`;
  };
  const r2 = cols.map((j) => m.hiddenCols[j] ? '<th class="c-hidden"></th>' :
    `<th scope="col"><div class="cf">${listControl(j)}<select class="fac-sel" data-action="rival-faction" data-j="${j}" aria-label="Ejército del rival ${j + 1}">${facOpts(m.rivals[j].faction)}</select></div></th>`).join('');
  const r3 = cols.map((j) => m.hiddenCols[j] ? '<th class="c-hidden"></th>' :
    `<th scope="col"><select class="disp-sel ${dispClass(m.rivals[j].disposition)}" data-action="rival-disp" data-j="${j}" aria-label="Disposición del rival ${j + 1}">${dispOpts(m.rivals[j].disposition)}</select></th>`).join('');

  const body = cols.map((i) => {
    const own = T.own[i];
    const label = `fila ${i + 1}${own.name ? ' (' + own.name + ')' : ''}`;
    if (m.hiddenRows[i]) {
      return `<tr class="row-hidden"><th scope="row" colspan="${totalCols}" class="sticky">
        <div class="cf">${eyeBtn('toggle-row', i, true, label)}<span>Fila oculta: ${esc(own.name || 'Hueco ' + (i + 1))}</span></div></th></tr>`;
    }
    const nameCell = isFirst
      ? `<input class="name-in" data-action="own-name" data-i="${i}" value="${esc(own.name)}" title="${esc(own.name)}" placeholder="Hueco ${i + 1}" aria-label="Nombre del jugador ${i + 1}">`
      : (own.name
          ? `<span class="ellipsis" title="${esc(own.name)}">${esc(own.name)}</span>`
          : `<span class="hueco ellipsis">Hueco ${i + 1}</span>`);
    const facCell = isFirst
      ? `<select class="fac-sel" data-action="own-faction" data-i="${i}" aria-label="Ejército del jugador ${i + 1}">${facOpts(own.faction)}</select>`
      : esc(own.faction || '—');
    const dispCell = isFirst
      ? `<select class="disp-sel ${dispClass(own.disposition)}" data-action="own-disp" data-i="${i}" aria-label="Disposición del jugador ${i + 1}">${dispOpts(own.disposition)}</select>`
      : (own.disposition ? `<span class="disp-chip ${dispClass(own.disposition)}">${esc(dispOf(own.disposition)?.label)}</span>` : '—');
    const cells = cols.map((j) => {
      if (m.hiddenCols[j]) return '<td class="c-hidden"></td>';
      const v = m.cells[i][j];
      const onMap = !!ensureMapCells(m, n)[i][j];
      const rivalName = esc(m.rivals[j].name || 'rival ' + (j + 1));
      const who = esc(own.name || 'hueco ' + (i + 1));
      return `<td class="cell ${onMap ? 'cell-map' : ''}"><div class="cell-inner">
        <select class="cell-sel ${scoreClass(v)}" data-action="cell" data-i="${i}" data-j="${j}"
          aria-label="Valoración de ${who} contra ${rivalName}">${scoreOpts(v)}</select>
        <button type="button" class="star" data-action="map" data-i="${i}" data-j="${j}"
          aria-pressed="${onMap}" aria-label="Elige mapa: ${who} contra ${rivalName}">${starIcon(onMap)}</button>
      </div></td>`;
    }).join('');
    const busy = S.busyRow === i;
    const locked = S.busyRow !== null;
    return `<tr class="${busy ? 'row-busy' : ''}" ${busy ? 'aria-busy="true"' : ''}>
      <th scope="row" class="sticky"><div class="cf">${eyeBtn('toggle-row', i, false, label)}
        <button type="button" class="wand" data-action="suggest-row" data-i="${i}" ${locked ? 'disabled' : ''}
          aria-label="Sugerir valores para ${esc(own.name || 'hueco ' + (i + 1))} según los datos cargados"
          title="Sugerir valores según los datos cargados">${busy ? '<span class="spinner" aria-hidden="true"></span>' : WAND_SVG}</button>
        ${nameCell}</div></th>
      <td>${facCell}</td><td>${dispCell}</td>${cells}
      <td class="avg c-avg" data-avg-row="${i}">${rowAvg(m, i)}</td>
    </tr>`;
  }).join('');

  const foot = cols.map((j) => m.hiddenCols[j] ? '<td class="c-hidden"></td>' :
    `<td class="avg" data-avg-col="${j}">${colAvg(m, j)}</td>`).join('');

  const panel = $('matrix-panel');
  panel.setAttribute('aria-labelledby', `tab-${m.id}`);
  panel.innerHTML = `
    <div class="panel-head">
      <div class="rival-title">
        <label for="rival-name">Equipo rival</label>
        <input id="rival-name" data-action="rival-title" value="${esc(m.rivalName)}" maxlength="60">
      </div>
      <p class="hint">${isFirst
        ? 'Matriz 1: define tus jugadores en las filas. Se comparten con todas las matrices.'
        : 'Tus jugadores se comparten desde la primera matriz. Aquí defines el equipo rival de esta ronda.'}</p>
      <button type="button" class="btn small" data-action="legend-open">Leyenda de colores</button>
      <button type="button" class="btn danger small" data-action="del-matrix" data-id="${m.id}">Eliminar matriz</button>
    </div>
    <div class="table-wrap">
      <table>
        <caption class="sr-only">Matriz ${idx + 1}: valoración de tus jugadores frente a los rivales</caption>
        ${colgroup}
        <thead>
          <tr class="r1">
            <th scope="col" rowspan="3" class="sticky">Jugador</th>
            <th scope="col" rowspan="3">Ejército</th>
            <th scope="col" rowspan="3">Disposición</th>
            ${r1}
            <th scope="col" rowspan="3" class="c-avg">Prom.</th>
          </tr>
          <tr class="r2">${r2}</tr>
          <tr class="r3">${r3}</tr>
        </thead>
        <tbody>${body}</tbody>
        <tfoot>
          <tr><th scope="row" class="sticky">Promedio</th><td colspan="2"></td>${foot}<td class="avg c-avg" data-avg-all>${allAvg(m)}</td></tr>
        </tfoot>
      </table>
    </div>`;

  // Mientras se calcula una varita, se bloquean todos los controles de la matriz
  if (S.busyRow !== null) panel.querySelectorAll('select, input, button').forEach((el) => { el.disabled = true; });

  // Altura real de las cabeceras pegadas, para que no se solapen al desplazar
  requestAnimationFrame(() => {
    const rows = panel.querySelectorAll('thead tr');
    const wrap = panel.querySelector('.table-wrap');
    if (!rows || rows.length < 2 || !wrap) return;
    const h1 = rows[0].getBoundingClientRect().height;
    const h2 = rows[1].getBoundingClientRect().height;
    wrap.style.setProperty('--r1h', `${h1}px`);
    wrap.style.setProperty('--r2h', `${h1 + h2}px`);
  });
}

function eyeBtn(action, idx, hidden, label) {
  const verb = hidden ? 'Mostrar' : 'Ocultar';
  return `<button type="button" class="eye" data-action="${action}" data-idx="${idx}"
    aria-label="${verb} ${esc(label)}" title="${verb} ${esc(label)}">${hidden ? EYE_OFF : EYE_ON}</button>`;
}

function refreshAverages(m) {
  document.querySelectorAll('[data-avg-row]').forEach((el) => { el.textContent = rowAvg(m, Number(el.dataset.avgRow)); });
  document.querySelectorAll('[data-avg-col]').forEach((el) => { el.textContent = colAvg(m, Number(el.dataset.avgCol)); });
  const all = document.querySelector('[data-avg-all]');
  if (all) all.textContent = allAvg(m);
}

function focusEye(action, idx) {
  const el = document.querySelector(`#matrix-panel [data-action="${action}"][data-idx="${idx}"]`);
  if (el) el.focus();
}

// ---------- Lista de un rival (texto a mano; enlace de BCP si existe) ----------
function openListDialog(j) {
  const m = activeMatrix();
  if (!m) return;
  S.listEdit = { matrixId: m.id, j };
  const rv = m.rivals[j];
  $('list-dialog-title').textContent = `Lista de ${rv.name || 'rival ' + (j + 1)}${rv.faction ? ' · ' + rv.faction : ''}`;
  $('list-text').value = rv.listText || '';
  $('list-dialog').showModal();
  $('list-text').focus();
}

// Al cerrar (botón, Escape o clic fuera) se guarda lo que haya en el texto
$('list-dialog').addEventListener('close', () => {
  const edit = S.listEdit;
  S.listEdit = null;
  if (!edit || !S.T) return;
  const m = S.T.matrices.find((x) => same(x.id, edit.matrixId));
  if (!m) return;
  const text = $('list-text').value;
  if (text !== (m.rivals[edit.j].listText || '')) {
    m.rivals[edit.j].listText = text;
    touch();
    setStatus('Lista guardada.');
  }
});

// ---------- Sugerencias de la matriz (datos cargados por el administrador) ----------
async function suggestRow(i) {
  if (S.busyRow !== null) return;
  const m = activeMatrix();
  if (!m) return;
  const player = S.T.own[i];
  if (!player.faction) return setStatus('Elige primero el ejército de este jugador.', 'error');
  const rivals = m.rivals.map((r) => r.faction).filter(Boolean);
  if (rivals.length === 0) return setStatus('Elige primero los ejércitos de los rivales de esta matriz.', 'error');

  S.busyRow = i;
  renderPanel();
  setStatus(`Calculando sugerencias para ${player.name || 'este jugador'}…`);
  try {
    const res = await api('/suggest/matchups', {
      method: 'POST',
      body: { faction: player.faction, rivals },
    });
    let filled = 0;
    const skipped = [];
    m.rivals.forEach((r, j) => {
      if (!r.faction) return;
      const out = res.results[r.faction];
      if (out && out.score !== null && out.score !== undefined) {
        m.cells[i][j] = out.score;
        filled++;
      } else {
        skipped.push(`${r.faction} (${out?.reason || 'sin dato'})`);
      }
    });
    touch();
    setStatus(`${filled} valores sugeridos desde ${res.dataslate}.${skipped.length ? ' Sin dato: ' + skipped.join(', ') : ''}`,
      skipped.length ? '' : 'ok');
  } catch (err) {
    if (err.status === 401) return showLogin('Tu sesión ha caducado. Vuelve a entrar.', 'error');
    setStatus(err.message, 'error');
  } finally {
    S.busyRow = null;
    renderPanel();
  }
}

// ---------- Acciones sobre el torneo ----------
function wouldLoseData(n) {
  const T = S.T;
  const cur = T.playersPerTeam;
  if (n >= cur) return false;
  for (let i = n; i < cur; i++) {
    const o = T.own[i];
    if (o.name || o.faction || o.disposition) return true;
    if (T.matrices.some((m) => m.rivals[i].name || m.rivals[i].faction || m.rivals[i].disposition)) return true;
  }
  return T.matrices.some((m) => {
    for (let i = 0; i < cur; i++) for (let j = 0; j < cur; j++) {
      if ((i >= n || j >= n) && m.cells[i][j] !== null) return true;
    }
    return false;
  });
}

function resizeAll(n) {
  const T = S.T;
  const grow = (arr, make) => Array.from({ length: n }, (_, i) => arr[i] ?? make());
  const blank = () => ({ name: '', faction: '', disposition: '' });
  T.playersPerTeam = n;
  T.own = grow(T.own, blank);
  T.matrices.forEach((m) => {
    m.rivals = grow(m.rivals, blank);
    const cells = Array.from({ length: n }, () => Array(n).fill(null));
    for (let i = 0; i < Math.min(n, m.cells.length); i++) {
      for (let j = 0; j < Math.min(n, m.cells[i].length); j++) cells[i][j] = m.cells[i][j];
    }
    m.cells = cells;
    m.hiddenRows = grow(m.hiddenRows, () => false);
    m.hiddenCols = grow(m.hiddenCols, () => false);
    const oldMap = ensureMapCells(m, n);
    const newMap = Array.from({ length: n }, () => Array(n).fill(false));
    for (let i = 0; i < Math.min(n, oldMap.length); i++) {
      for (let j = 0; j < Math.min(n, oldMap[i].length); j++) newMap[i][j] = oldMap[i][j];
    }
    m.mapCells = newMap;
  });
}

function newMatrix(n, number) {
  return {
    id: uid(),
    rivalName: `Rival ${number}`,
    rivals: Array.from({ length: n }, () => ({ name: '', faction: '', disposition: '' })),
    cells: Array.from({ length: n }, () => Array(n).fill(null)),
    hiddenRows: Array(n).fill(false),
    hiddenCols: Array(n).fill(false),
    mapCells: Array.from({ length: n }, () => Array(n).fill(false)),
  };
}

function selectMatrix(id) {
  S.activeId = id;
  renderTabs();
  renderPanel();
  const tab = $(`tab-${id}`);
  if (tab) tab.focus(); else $('matrix-panel').focus();
}

function addMatrix() {
  const m = newMatrix(S.T.playersPerTeam, S.T.matrices.length + 1);
  S.T.matrices.push(m);
  S.activeId = m.id;
  renderTournament();
  touch();
  $('rival-name')?.focus();
  setStatus(`Matriz ${S.T.matrices.length} creada.`);
}

function removeMatrix(id) {
  const idx = matrixIndex(id);
  if (idx < 0) return;
  const name = S.T.matrices[idx].rivalName;
  S.T.matrices.splice(idx, 1);
  if (same(S.activeId, id)) {
    const next = S.T.matrices[Math.min(idx, S.T.matrices.length - 1)];
    S.activeId = next ? next.id : null;
  }
  renderTournament();
  touch();
  const tab = S.activeId !== null ? $(`tab-${S.activeId}`) : null;
  if (tab) tab.focus();
  else document.querySelector('#v-tournament [data-action="add-matrix"]')?.focus();
  setStatus(`Matriz "${name}" eliminada.`);
}

function applyResize(n) {
  resizeAll(n);
  renderTournament();
  touch();
  setStatus(`Matriz de ${n} × ${n}.`);
}

// ---------- Confirmación en página ----------
function ask(message, yesLabel, onYes, onNo) {
  S.pending = { onYes, onNo };
  $('confirm-text').textContent = message;
  $('confirm-yes').textContent = yesLabel;
  $('confirm').hidden = false;
  $('confirm-yes').focus();
}

function closeAsk(cancelled) {
  const p = S.pending;
  S.pending = null;
  $('confirm').hidden = true;
  if (cancelled && p && p.onNo) p.onNo();
}

$('confirm-yes').addEventListener('click', () => {
  const p = S.pending;
  closeAsk(false);
  if (p) p.onYes();
});
$('confirm-no').addEventListener('click', () => { closeAsk(true); setStatus('Acción cancelada.'); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && S.pending) { closeAsk(true); setStatus('Acción cancelada.'); }
});

// ---------- Eventos de cambio (formularios de la matriz y ppt) ----------
document.addEventListener('change', (e) => {
  const t = e.target;
  const action = t.dataset?.action;
  if (!action || !S.T) return;
  const T = S.T;
  const m = activeMatrix();

  if (action === 'ppt') {
    const n = Number(t.value);
    const cur = T.playersPerTeam;
    if (wouldLoseData(n)) {
      ask(`Reducir a ${n} × ${n} eliminará datos de las filas o columnas sobrantes. ¿Continuar?`,
        'Sí, reducir', () => applyResize(n), () => { t.value = String(cur); });
    } else {
      applyResize(n);
    }
    return;
  }

  if (action === 'own-name') { T.own[Number(t.dataset.i)].name = t.value.trim(); touch(); return setStatus('Nombre del jugador guardado.'); }
  if (action === 'own-faction') { T.own[Number(t.dataset.i)].faction = t.value; touch(); return setStatus('Ejército del jugador guardado.'); }
  if (action === 'own-disp') {
    const i = Number(t.dataset.i);
    T.own[i].disposition = t.value;
    t.className = `disp-sel ${dispClass(t.value)}`;
    touch();
    return setStatus('Disposición del jugador guardada.');
  }

  if (!m) return;

  if (action === 'cell') {
    const i = Number(t.dataset.i), j = Number(t.dataset.j);
    const v = t.value === '' ? null : Number(t.value);
    m.cells[i][j] = v;
    t.className = `cell-sel ${scoreClass(v)}`;
    refreshAverages(m);
    touch();
    return setStatus(v ? `Valoración ${v} guardada.` : 'Valoración vacía.');
  }
  if (action === 'rival-player-name') { m.rivals[Number(t.dataset.j)].name = t.value.trim(); touch(); return setStatus('Nombre del rival guardado.'); }
  if (action === 'rival-faction') { m.rivals[Number(t.dataset.j)].faction = t.value; touch(); return setStatus('Ejército rival guardado.'); }
  if (action === 'rival-disp') {
    const j = Number(t.dataset.j);
    m.rivals[j].disposition = t.value;
    t.className = `disp-sel ${dispClass(t.value)}`;
    touch();
    return setStatus('Disposición rival guardada.');
  }
  if (action === 'rival-title') {
    m.rivalName = t.value.trim() || 'Rival sin nombre';
    const tab = $(`tab-${m.id}`);
    if (tab) { tab.textContent = `${matrixIndex(m.id) + 1} · ${m.rivalName}`; tab.title = m.rivalName; }
    touch();
    return setStatus('Nombre del equipo rival guardado.');
  }
});

// ---------- Eventos de pulsación ----------
document.addEventListener('click', async (e) => {
  const tab = e.target.closest('[role="tab"]');
  if (tab) return selectMatrix(tab.dataset.tab);

  const nav = e.target.closest('.nav-btn[data-go]');
  if (nav) {
    if (nav.dataset.go === 'list') return showList();
    if (nav.dataset.go === 'admin') return showAdmin();
  }
  if (e.target.closest('#nav-logout')) return logout();

  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;

  if (action === 'open') return openTournament(btn.dataset.id);
  if (action === 'back') return showList();
  if (action === 'close-new') return closeNewDialog(true);

  if (action === 'del-tournament') {
    const t = S.list.find((x) => same(x.id, btn.dataset.id));
    if (!t) return;
    return ask(`¿Eliminar el torneo "${t.title}" con todas sus matrices? No se puede deshacer.`, 'Sí, eliminar',
      () => deleteTournament(t.id));
  }

  if (!S.T) return;

  if (action === 'legend-open') return $('legend-dialog').showModal();
  if (action === 'legend-close') return $('legend-dialog').close();
  if (action === 'list-open') return openListDialog(Number(btn.dataset.j));
  if (action === 'list-close') return $('list-dialog').close();

  if (action === 'suggest-row') {
    if (S.busyRow !== null) return;
    return suggestRow(Number(btn.dataset.i));
  }

  if (action === 'map') {
    const m = activeMatrix();
    if (!m) return;
    const i = Number(btn.dataset.i), j = Number(btn.dataset.j);
    const flags = ensureMapCells(m, S.T.playersPerTeam);
    flags[i][j] = !flags[i][j];
    const on = flags[i][j];
    btn.setAttribute('aria-pressed', String(on));
    btn.innerHTML = starIcon(on);
    btn.closest('td').classList.toggle('cell-map', on);
    touch();
    return setStatus(on ? 'Marcado: elige mapa.' : 'Marca de mapa quitada.');
  }

  if (action === 'add-matrix') return addMatrix();

  if (action === 'toggle-col' || action === 'toggle-row') {
    const m = activeMatrix();
    if (!m) return;
    const idx = Number(btn.dataset.idx);
    const key = action === 'toggle-col' ? 'hiddenCols' : 'hiddenRows';
    m[key][idx] = !m[key][idx];
    renderPanel();
    focusEye(action, idx);
    touch();
    const what = action === 'toggle-col' ? `Columna ${idx + 1}` : `Fila ${idx + 1}`;
    return setStatus(`${what} ${m[key][idx] ? 'oculta' : 'visible'}.`);
  }

  if (action === 'del-matrix') {
    const m = S.T.matrices[matrixIndex(btn.dataset.id)];
    if (!m) return;
    return ask(`¿Eliminar la matriz "${m.rivalName}"? No se puede deshacer.`, 'Sí, eliminar',
      () => removeMatrix(m.id));
  }
});

// Navegación por teclado entre pestañas (patrón WAI-ARIA)
$('tabs').addEventListener('keydown', (e) => {
  const tabs = [...document.querySelectorAll('#tabs [role="tab"]')];
  if (!tabs.length) return;
  const current = tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
  let next = null;
  if (e.key === 'ArrowRight') next = (current + 1) % tabs.length;
  if (e.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
  if (e.key === 'Home') next = 0;
  if (e.key === 'End') next = tabs.length - 1;
  if (next === null) return;
  e.preventDefault();
  selectMatrix(tabs[next].dataset.tab);
});

async function deleteTournament(id) {
  try {
    await api(`/tournaments/${id}`, { method: 'DELETE' });
    if (same(S.tid, id)) { S.T = null; S.tid = null; S.dirty = false; }
    setStatus('Torneo eliminado.');
    await showList();
  } catch (err) {
    failGlobal(err);
  }
}

// ---------- Administración de usuarios (solo superadmin) ----------
async function showAdmin() {
  await flush();
  showView('v-admin');
  $('admin-title').focus();
  await loadUsers();
  renderMetaAdmin();
}

// ---------- Datos de meta en Excel (solo superadmin) ----------
const metaFiles = {}; // juego -> { name, base64 } del Excel elegido

function renderMetaAdmin() {
  $('meta-admin').innerHTML = `<p class="muted">Sube un Excel (.xls o .xlsx) por juego. La primera hoja debe tener estas columnas: <strong>faction | rival | win_rate | avg_diff | games</strong>. Un valor ausente se marca con "-" y no impide guardar. Un nombre desconocido, un número mal escrito o una fila repetida sí lo impide.</p>` +
    S.meta.games.map((g) => `
      <section class="panel meta-section" aria-labelledby="meta-h-${g.key}">
        <h3 id="meta-h-${g.key}">${esc(g.label)}</h3>
        ${g.available ? `
          <div class="meta-tools">
            <input type="file" accept=".xls,.xlsx" data-meta-file="${g.key}" aria-label="Elegir Excel de ${esc(g.label)}">
            <button type="button" class="btn small" data-action="meta-export" data-game="${g.key}">Descargar datos actuales</button>
            <button type="button" class="btn small" data-action="meta-validate" data-game="${g.key}">Validar</button>
            <button type="button" class="btn small primary" data-action="meta-save" data-game="${g.key}">Guardar datos</button>
          </div>
          <p class="hint" id="meta-file-${g.key}" aria-live="polite">Ningún archivo elegido.</p>
          <p class="msg" id="meta-msg-${g.key}" role="status"></p>
          <div id="meta-report-${g.key}" aria-live="polite"></div>
        ` : `<p class="muted">Todavía no hay facciones configuradas para este juego. Esta sección se activará cuando se definan.</p>`}
      </section>`).join('');
}

function renderMetaReport(game, report) {
  const box = $(`meta-report-${game}`);
  let html = '';
  if (report.errors && report.errors.length) html += `<p class="msg error">${report.errors.map(esc).join(' · ')}</p>`;
  if (report.summary && report.summary.ok !== undefined) {
    const s = report.summary;
    html += `<p class="meta-summary">Correctas: ${s.ok} · Sin dato ("-"): ${s.missing} · Con error: ${s.error} · Pares sin fila (se muestran "-"): ${s.pairsAbsent}</p>`;
  }
  if (report.rows && report.rows.length) {
    const label = { ok: 'Correcta', missing: 'Sin dato ("-")', error: 'Error' };
    html += `<div class="table-wrap meta-scroll"><table class="meta-table"><caption>Validación por fila</caption>
      <thead><tr><th scope="col">Fila</th><th scope="col">Facción</th><th scope="col">Rival</th><th scope="col">Estado</th><th scope="col">Detalle</th></tr></thead>
      <tbody>${report.rows.map((r) => `<tr class="st-${r.status}"><td>${r.line}</td><td>${esc(r.faction)}</td><td>${esc(r.rival)}</td><td>${label[r.status]}</td><td>${esc(r.message)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  if (report.grid) {
    html += `<div class="table-wrap meta-scroll"><table class="meta-table meta-grid"><caption>Vista previa: diferencia media (facción en filas, rival en columnas)</caption>
      <thead><tr><th scope="col">Facción</th>${report.grid.factions.map((f) => `<th scope="col">${esc(f)}</th>`).join('')}</tr></thead>
      <tbody>${report.grid.factions.map((f, i) => `<tr><th scope="row">${esc(f)}</th>${report.grid.cells[i].map((c) => `<td class="st-${c.status}">${esc(String(c.value))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  box.innerHTML = html;
}

// Convierte el archivo elegido a base64 para enviarlo como JSON
function fileToBase64(file) {
  return file.arrayBuffer().then((buf) => {
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  });
}

async function metaAction(game, action) {
  const box = $(`meta-report-${game}`);
  if (action === 'export') {
    const res = await fetch(`/api/admin/meta/${game}/export`, { credentials: 'same-origin' });
    if (!res.ok) throw new Error('No se pudo descargar el archivo.');
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = `meta-${game}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return setMsg($(`meta-msg-${game}`), 'Datos descargados en Excel.', 'ok');
  }

  const chosen = metaFiles[game];
  if (!chosen) throw new Error('Elige primero un archivo Excel.');
  if (action === 'validate') {
    const report = await api(`/admin/meta/${game}/validate`, { method: 'POST', body: { file: chosen.base64 } });
    return renderMetaReport(game, report);
  }
  if (action === 'save') {
    try {
      const res = await api(`/admin/meta/${game}`, { method: 'POST', body: { file: chosen.base64 } });
      renderMetaReport(game, res.report);
      setMsg($(`meta-msg-${game}`), `Datos guardados: ${res.saved} filas.`, 'ok');
    } catch (err) {
      if (err.details) renderMetaReport(game, err.details);
      throw err;
    }
  }
  return box;
}

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action^="meta-"]');
  if (!btn) return;
  const game = btn.dataset.game;
  const action = btn.dataset.action.replace('meta-', '');
  const labels = { save: 'Guardando…', export: 'Preparando…', validate: 'Validando…' };
  try {
    await withBusy(btn, labels[action], () => metaAction(game, action));
  } catch (err) {
    if (err.status === 401) return showLogin('Tu sesión ha caducado. Vuelve a entrar.', 'error');
    setMsg($(`meta-msg-${game}`), err.message, 'error');
  }
});

document.addEventListener('change', async (e) => {
  const input = e.target.closest && e.target.closest('input[data-meta-file]');
  if (!input || !input.files || !input.files[0]) return;
  const game = input.dataset.metaFile;
  const file = input.files[0];
  try {
    metaFiles[game] = { name: file.name, base64: await fileToBase64(file) };
    $(`meta-file-${game}`).textContent = `Archivo elegido: ${file.name}`;
    await metaAction(game, 'validate');
  } catch (err) {
    setMsg($(`meta-msg-${game}`), err.message, 'error');
  }
});

async function loadUsers() {
  try {
    const { users } = await api('/admin/users');
    renderUsers(users);
  } catch (err) {
    failGlobal(err);
  }
}

function renderUsers(users) {
  $('users-body').innerHTML = users.map((u) => {
    const protectedAccount = u.role === 'superadmin' || u.id === S.user.id;
    const actions = protectedAccount
      ? '<span class="muted">Cuenta protegida</span>'
      : `<button type="button" class="btn small" data-action="adm-reset" data-id="${u.id}">Restablecer<span class="sr-only"> ${esc(u.username)}</span></button>
         <button type="button" class="btn danger small" data-action="adm-del" data-id="${u.id}">Eliminar<span class="sr-only"> ${esc(u.username)}</span></button>`;
    return `<tr>
      <td data-label="Usuario">${esc(u.username)}${u.role === 'superadmin' ? '<span class="badge">Superadmin</span>' : ''}</td>
      <td data-label="Estado">${u.must_change_password ? 'Contraseña temporal' : 'Activo'}</td>
      <td data-label="Torneos">${u.tournament_count}</td>
      <td data-label="Acciones">${actions}</td>
    </tr>`;
  }).join('');
}

function showTempPassword(username, password, message) {
  setMsg($('user-msg'), message, 'ok');
  const box = $('temp-box');
  box.innerHTML = `<p>Contraseña temporal de <strong>${esc(username)}</strong>:</p>
    <p><code class="temp">${esc(password)}</code></p>
    <p class="muted">Entrégala por un canal seguro. No volverá a mostrarse.</p>`;
  box.hidden = false;
  box.focus();
}

$('user-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const input = $('new-username');
  try {
    const data = await withBusy(form.querySelector('button'), 'Creando…', () =>
      api('/admin/users', { method: 'POST', body: { username: input.value.trim() } }));
    input.value = '';
    showTempPassword(data.user.username, data.temporaryPassword, `Usuario "${data.user.username}" creado.`);
    await loadUsers();
  } catch (err) {
    setMsg($('user-msg'), err.message, 'error');
  }
});

document.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action^="adm-"]');
  if (!btn) return;
  const id = btn.dataset.id;
  if (btn.dataset.action === 'adm-reset') {
    ask('¿Restablecer la contraseña? Se generará una temporal y sus sesiones se cerrarán.', 'Sí, restablecer', async () => {
      try {
        const data = await api(`/admin/users/${id}/reset-password`, { method: 'POST' });
        showTempPassword(data.username, data.temporaryPassword, `Contraseña restablecida para ${data.username}.`);
        await loadUsers();
      } catch (err) { setMsg($('user-msg'), err.message, 'error'); }
    });
  }
  if (btn.dataset.action === 'adm-del') {
    ask('¿Eliminar este usuario y todos sus torneos? No se puede deshacer.', 'Sí, eliminar', async () => {
      try {
        await api(`/admin/users/${id}`, { method: 'DELETE' });
        $('temp-box').hidden = true;
        setMsg($('user-msg'), 'Usuario eliminado.', 'ok');
        await loadUsers();
      } catch (err) { setMsg($('user-msg'), err.message, 'error'); }
    });
  }
});

// ---------- Arranque ----------
start();
