'use strict';

const $ = (selector) => document.querySelector(selector);
const state = { user: null };

// ---------- Utilidades ----------

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Ha ocurrido un error inesperado');
    err.status = res.status;
    err.code = data.code;
    throw err;
  }
  return data;
}

// Crea elementos del DOM de forma segura (sin innerHTML con datos del usuario)
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

const srOnly = (text) => el('span', { class: 'sr-only' }, ` ${text}`);

const formatDate = (iso) =>
  new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

function setMsg(node, text = '', type = '') {
  node.textContent = text;
  node.className = `msg ${type}`.trim();
}

// Muestra el error en el sitio adecuado; si la sesión caducó, vuelve al login
function fail(node, err) {
  if (err.status === 401) return showLogin('Tu sesión ha caducado. Vuelve a entrar.', 'error');
  setMsg(node, err.message, 'error');
}

// ---------- Navegación entre vistas ----------

const loaders = {
  'view-tournaments': () => loadTournaments(),
  'view-admin': () => loadUsers(),
};

function showView(id) {
  document.querySelectorAll('.view').forEach((view) => {
    view.hidden = view.id !== id;
  });
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    if (btn.dataset.view === id) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  });
  $('#main').focus();
}

function openView(id) {
  showView(id);
  const loader = loaders[id];
  if (loader) loader().catch((err) => fail($('#global-msg'), err));
}

function applyNav(user) {
  const restricted = user.must_change_password;
  document.querySelectorAll('#main-nav .nav-btn').forEach((btn) => {
    const isAdmin = btn.dataset.view === 'view-admin';
    const isPassword = btn.dataset.view === 'view-password';
    const isLogout = btn.id === 'logout-btn';
    btn.hidden =
      (isAdmin && user.role !== 'superadmin') ||
      (restricted && !isPassword && !isLogout);
  });
}

// ---------- Sesión ----------

function startSession(user) {
  state.user = user;
  $('#user-name').textContent = user.username;
  $('#site-header').hidden = false;
  applyNav(user);

  if (user.must_change_password) {
    $('#password-intro').textContent = 'Tu contraseña es temporal. Debes cambiarla para continuar.';
    showView('view-password');
  } else {
    openView(user.role === 'superadmin' ? 'view-admin' : 'view-tournaments');
  }
}

function showLogin(message = '', type = '') {
  state.user = null;
  $('#site-header').hidden = true;
  setMsg($('#global-msg'));
  setMsg($('#login-msg'), message, type);
  showView('view-login');
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const submit = form.querySelector('button');
  submit.disabled = true;
  try {
    const { user } = await api('/auth/login', {
      method: 'POST',
      body: { username: form.username.value, password: form.password.value },
    });
    form.reset();
    setMsg($('#login-msg'));
    startSession(user);
  } catch (err) {
    setMsg($('#login-msg'), err.message, 'error');
    form.password.value = '';
  } finally {
    submit.disabled = false;
  }
});

$('#logout-btn').addEventListener('click', async () => {
  await api('/auth/logout', { method: 'POST' }).catch(() => {});
  showLogin('Has cerrado sesión.');
});

document.querySelectorAll('.nav-btn[data-view]').forEach((btn) => {
  btn.addEventListener('click', () => {
    setMsg($('#global-msg'));
    openView(btn.dataset.view);
  });
});

// ---------- Torneos ----------

async function loadTournaments() {
  const { tournaments } = await api('/tournaments');
  $('#tournament-list').replaceChildren(
    ...tournaments.map((t) =>
      el('li', {},
        el('div', {},
          el('h3', {}, t.name),
          el('div', { class: 'tournament-meta' },
            el('span', { class: 'muted' }, `Creado el ${formatDate(t.created_at)}`))
        ),
        el('button', { class: 'btn danger', type: 'button', onclick: () => deleteTournament(t) },
          'Eliminar', srOnly(t.name))
      )
    )
  );
  $('#tournament-empty').hidden = tournaments.length > 0;
}

$('#tournament-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('#tournament-name');
  const msg = $('#tournament-msg');
  try {
    await api('/tournaments', { method: 'POST', body: { name: input.value } });
    input.value = '';
    setMsg(msg, 'Torneo creado.', 'ok');
    await loadTournaments();
    input.focus();
  } catch (err) {
    fail(msg, err);
  }
});

async function deleteTournament(t) {
  if (!confirm(`¿Eliminar el torneo "${t.name}"? Esta acción no se puede deshacer.`)) return;
  try {
    await api(`/tournaments/${t.id}`, { method: 'DELETE' });
    setMsg($('#global-msg'), `Torneo "${t.name}" eliminado.`, 'ok');
    await loadTournaments();
  } catch (err) {
    fail($('#global-msg'), err);
  }
}

// ---------- Administración de usuarios ----------

async function loadUsers() {
  const { users } = await api('/admin/users');
  $('#users-body').replaceChildren(
    ...users.map((u) => {
      const protectedAccount = u.role === 'superadmin' || u.id === state.user.id;
      return el('tr', {},
        el('td', { 'data-label': 'Usuario' },
          u.username,
          u.role === 'superadmin' ? el('span', { class: 'badge' }, 'Superadmin') : null
        ),
        el('td', { 'data-label': 'Estado' },
          u.must_change_password ? 'Contraseña temporal' : 'Activo'
        ),
        el('td', { 'data-label': 'Torneos' }, String(u.tournament_count)),
        el('td', { 'data-label': 'Acciones', class: 'actions' },
          protectedAccount
            ? el('span', { class: 'muted' }, 'Cuenta protegida')
            : [
                el('button', { class: 'btn', type: 'button', onclick: () => resetPassword(u) },
                  'Restablecer contraseña', srOnly(u.username)),
                el('button', { class: 'btn danger', type: 'button', onclick: () => deleteUser(u) },
                  'Eliminar', srOnly(u.username)),
              ]
        )
      );
    })
  );
}

function showTempPassword(username, password, message) {
  setMsg($('#user-msg'), message, 'ok');

  const copyBtn = el('button', { class: 'btn', type: 'button' }, 'Copiar contraseña');
  copyBtn.addEventListener('click', async () => {
    await navigator.clipboard.writeText(password).catch(() => {});
    copyBtn.textContent = 'Copiada';
  });

  const box = $('#temp-password');
  box.replaceChildren(
    el('p', {}, 'Contraseña temporal de ', el('strong', {}, username), ':'),
    el('p', {}, el('code', { class: 'temp' }, password)),
    el('p', { class: 'muted' }, 'Entrégala al usuario por un canal seguro. No volverá a mostrarse.'),
    copyBtn
  );
  box.hidden = false;
  box.focus();
}

$('#user-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('#new-username');
  try {
    const data = await api('/admin/users', { method: 'POST', body: { username: input.value } });
    input.value = '';
    showTempPassword(data.user.username, data.temporaryPassword, `Usuario "${data.user.username}" creado.`);
    await loadUsers();
  } catch (err) {
    fail($('#user-msg'), err);
  }
});

async function resetPassword(u) {
  if (!confirm(`¿Restablecer la contraseña de "${u.username}"? Se generará una contraseña temporal y sus sesiones se cerrarán.`)) return;
  try {
    const data = await api(`/admin/users/${u.id}/reset-password`, { method: 'POST' });
    showTempPassword(data.username, data.temporaryPassword, `Contraseña restablecida para ${data.username}.`);
    await loadUsers();
  } catch (err) {
    fail($('#user-msg'), err);
  }
}

async function deleteUser(u) {
  if (!confirm(`¿Eliminar al usuario "${u.username}" y todos sus torneos? Esta acción no se puede deshacer.`)) return;
  try {
    await api(`/admin/users/${u.id}`, { method: 'DELETE' });
    $('#temp-password').hidden = true;
    setMsg($('#user-msg'), `Usuario "${u.username}" eliminado.`, 'ok');
    await loadUsers();
  } catch (err) {
    fail($('#user-msg'), err);
  }
}

// ---------- Cambio de contraseña ----------

$('#password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const msg = $('#password-msg');

  if (form.newPassword.value !== form.confirmPassword.value) {
    return setMsg(msg, 'Las contraseñas nuevas no coinciden', 'error');
  }

  try {
    const { user } = await api('/auth/change-password', {
      method: 'POST',
      body: {
        currentPassword: form.currentPassword.value,
        newPassword: form.newPassword.value,
      },
    });
    form.reset();
    setMsg(msg);
    startSession(user);
    setMsg($('#global-msg'), 'Contraseña actualizada correctamente.', 'ok');
  } catch (err) {
    fail(msg, err);
  }
});

// ---------- Arranque ----------

async function init() {
  try {
    const { user } = await api('/auth/me');
    startSession(user);
  } catch {
    showLogin();
  }
}

init();
