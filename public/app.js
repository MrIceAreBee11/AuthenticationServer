/* ============================================================
   Auth Service — Console
   Tanpa framework, tanpa proses build. Disajikan langsung oleh Express.
   ============================================================ */

const API = '/api/v1';
const TOKEN_KEY = 'auth-console-token';
const REFRESH_KEY = 'auth-console-refresh';

const state = {
  token: null,
  refreshToken: null,
  me: null,
  permissions: [],
  roles: [],
  permissionCatalog: { permissions: [], groups: {} },
  users: { rows: [], meta: { page: 1, limit: 10, total: 0, totalPages: 1 } },
  matrixDraft: null,
  logs: [],
  hitEndpoints: new Set(),
};

/* ---------- katalog endpoint untuk pelacakan cakupan ---------- */
const ENDPOINTS = [
  ['GET', '/health', 'Liveness — proses hidup'],
  ['GET', '/health/ready', 'Readiness — dependensi siap'],
  ['POST', '/auth/login', 'Masuk dan memperoleh token'],
  ['GET', '/auth/me', 'Identitas pemilik token'],
  ['POST', '/auth/refresh', 'Menukar refresh token dengan yang baru'],
  ['POST', '/auth/logout', 'Mencabut token aktif'],
  ['GET', '/auth/permissions', 'Izin milik sendiri'],
  ['POST', '/auth/forgot-password', 'Meminta tautan reset'],
  ['POST', '/auth/reset-password', 'Menukar token dengan password baru'],
  ['GET', '/profile', 'Profil sendiri beserta avatar'],
  ['PATCH', '/profile', 'Mengubah nama dan telepon'],
  ['POST', '/profile/avatar', 'Mengunggah foto profil'],
  ['DELETE', '/profile/avatar', 'Menghapus foto profil'],
  ['GET', '/users', 'Daftar pengguna per halaman'],
  ['POST', '/users', 'Membuat pengguna baru'],
  ['GET', '/users/:id', 'Detail satu pengguna'],
  ['PATCH', '/users/:id', 'Mengubah data atau status'],
  ['DELETE', '/users/:id', 'Menghapus pengguna'],
  ['PUT', '/users/:id/roles', 'Menetapkan role pengguna'],
  ['GET', '/roles', 'Daftar role beserta izinnya'],
  ['POST', '/roles', 'Membuat role baru'],
  ['GET', '/roles/:id', 'Detail satu role'],
  ['PATCH', '/roles/:id', 'Mengubah nama atau keterangan'],
  ['PUT', '/roles/:id/permissions', 'Mengubah izin sebuah role'],
  ['DELETE', '/roles/:id', 'Menghapus role'],
  ['GET', '/permissions', 'Katalog seluruh permission'],
];

/* ============================================================
   Bantuan DOM
   ============================================================ */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const el = (tag, props = {}, children = []) => {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([key, value]) => {
    if (key === 'class') node.className = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value !== null && value !== undefined && value !== false) node.setAttribute(key, value);
  });
  (Array.isArray(children) ? children : [children]).forEach((child) => {
    if (child === null || child === undefined || child === false) return;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  });
  return node;
};

const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); };

const toast = (message, kind = 'ok') => {
  const node = el('div', { class: `toast ${kind}`, text: message });
  $('#toasts').append(node);
  setTimeout(() => node.remove(), 3600);
};

const fmtDate = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

const pretty = (value) => {
  if (value === undefined || value === null) return '—';
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
};

const fmtTime = (date) =>
  `${date.toLocaleTimeString('id-ID', { hour12: false })}.${String(date.getMilliseconds()).padStart(3, '0')}`;

/** Wajib dijalankan sebelum highlightJson, karena isi respons bisa memuat teks dari pengguna. */
const escapeHtml = (text) =>
  text.replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]));

const JSON_TOKEN = /("(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"\s*:?)|\b(true|false)\b|\b(null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

const highlightJson = (value) =>
  escapeHtml(pretty(value)).replace(JSON_TOKEN, (match, str, bool, nul, numeric) => {
    if (str) return `<span class="${str.trimEnd().endsWith(':') ? 'j-key' : 'j-str'}">${str}</span>`;
    if (bool) return `<span class="j-bool">${bool}</span>`;
    if (nul) return `<span class="j-null">${nul}</span>`;
    return `<span class="j-num">${numeric}</span>`;
  });

const statusTone = (status) => {
  if (status === 0 || status === 429 || status >= 500) return 'err';
  if (status >= 400) return 'warn';
  return 'ok';
};

/* ============================================================
   Lapisan API — setiap panggilan tercatat di panel kanan
   ============================================================ */
const normalizePath = (path) => path
  .split('?')[0]
  .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
  .replace(/\/\d+/g, '/:id');

/**
 * Panel ini dipakai saat demo di depan orang lain, jadi isian rahasia
 * tidak boleh ikut tampil di layar meski request-nya sah.
 */
/** Disembunyikan sepenuhnya — tidak ada gunanya diperlihatkan sebagian. */
const REDACTED_KEYS = new Set(['password', 'newPassword', 'passwordHash']);

/**
 * Ditampilkan sebagian saja.
 *
 * Ketiganya adalah kredensial yang masih berlaku, jadi memperlihatkannya utuh
 * di panel yang sedang dipertunjukkan lewat layar bersama sama saja dengan
 * membagikannya. Tetapi menyembunyikannya sepenuhnya juga menghilangkan hal
 * yang justru paling berguna dilihat: bahwa nilainya BERUBAH setiap kali
 * refresh token dipakai. Potongan awalnya cukup untuk membuktikan itu.
 */
const TRUNCATED_KEYS = new Set(['token', 'refreshToken', 'resetToken']);

const KEPT_CHARS = 10;

const maskValue = (key, value) => {
  if (REDACTED_KEYS.has(key)) return '••••••••  (disembunyikan)';

  if (TRUNCATED_KEYS.has(key) && typeof value === 'string' && value.length > KEPT_CHARS) {
    return `${value.slice(0, KEPT_CHARS)}…  (${value.length} karakter, dipotong)`;
  }

  return value;
};

/**
 * Berjalan rekursif karena token berada di dalam objek data pada response,
 * bukan di tingkat teratas seperti pada request body.
 */
const redactSecrets = (value) => {
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item));

  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      maskValue(key, typeof item === 'object' && item !== null ? redactSecrets(item) : item),
    ])
  );
};

const pushLog = (entry) => {
  state.logs.unshift(entry);
  if (state.logs.length > 60) state.logs.pop();
  renderLogs();
};

async function api(path, { method = 'GET', body, raw = false, retried = false } = {}) {
  const started = performance.now();
  const headers = {};
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  if (body && !raw) headers['Content-Type'] = 'application/json';

  let response;
  let payload;
  let failure = null;

  try {
    response = await fetch(API + path, {
      method,
      headers,
      body: raw ? body : body ? JSON.stringify(body) : undefined,
    });
    payload = await response.json().catch(() => ({}));
  } catch (error) {
    failure = error;
  }

  const ms = Math.round(performance.now() - started);
  const key = `${method} ${normalizePath(path)}`;
  state.hitEndpoints.add(key);

  pushLog({
    at: new Date(),
    method,
    path,
    status: failure ? 0 : response.status,
    ms,
    request: raw ? '[FormData — berkas biner]' : redactSecrets(body) ?? null,
    response: failure ? { error: failure.message } : redactSecrets(payload),
  });

  if (failure) throw new Error('Tidak dapat menghubungi server');

  if (response.status === 401 && state.token && !path.includes('/auth/login')) {
    // Access token berumur 15 menit, jadi 401 adalah kejadian normal, bukan
    // tanda sesi berakhir. Yang dilakukan: tukar refresh token dengan yang
    // baru, lalu ulangi permintaan aslinya satu kali.
    //
    // Pengecualian /auth/refresh mencegah rekursi tanpa ujung, dan penanda
    // retried memastikan pengulangannya hanya sekali — kalau permintaan yang
    // sudah diperbarui masih 401, masalahnya bukan lagi soal umur token.
    const bolehDicoba = !retried && !path.includes('/auth/refresh');

    if (bolehDicoba && (await refreshSession())) {
      return api(path, { method, body, raw, retried: true });
    }

    handleExpiredSession(payload?.message);
    throw new Error(payload?.message || 'Sesi berakhir');
  }

  if (!response.ok) {
    const detail = payload?.details?.errors?.[0]?.message;
    throw new Error(detail || payload?.message || `Permintaan gagal (${response.status})`);
  }

  return payload;
}

function renderLogs() {
  const list = $('#log-list');
  const total = String(state.logs.length);

  $('#log-count').textContent = total;
  $('#insp-fab-count').textContent = total;

  clear(list);

  if (state.logs.length === 0) {
    list.append(el('div', { class: 'empty', html: 'Belum ada permintaan.<br>Setiap aksi akan tercatat di sini.' }));
    return;
  }

  state.logs.forEach((log, index) => {
    const tone = statusTone(log.status);

    list.append(el('div', { class: `log${index === 0 ? ' fresh' : ''}` }, [
      el('div', {
        class: 'log-head',
        onClick: (event) => event.currentTarget.parentElement.classList.toggle('open'),
      }, [
        el('span', { class: `log-method ${log.method}`, text: log.method }),
        el('span', { class: 'log-path', text: log.path }),
        el('span', { class: `log-status ${tone}`, text: log.status || 'ERR' }),
      ]),
      el('div', { class: 'log-meta' }, [
        el('span', { text: fmtTime(log.at) }),
        el('span', { class: 'sep', text: '·' }),
        el('span', { class: `log-ms${log.ms > 500 ? ' slow' : ''}`, text: `${log.ms} ms` }),
        el('span', { class: 'sep', text: '·' }),
        el('span', { text: log.status ? `HTTP ${log.status}` : 'tidak terhubung' }),
      ]),
      el('div', { class: 'log-body' }, [
        log.request ? el('div', { class: 'log-label', text: 'Request Body' }) : null,
        log.request ? el('div', { class: 'log-json', html: highlightJson(log.request) }) : null,
        el('div', { class: 'log-label', text: 'Response Body' }),
        el('div', { class: 'log-json', html: highlightJson(log.response) }),
      ]),
    ]));
  });
}

/* ============================================================
   Sesi
   ============================================================ */
function simpanSesi({ token, refreshToken }) {
  state.token = token;
  state.refreshToken = refreshToken ?? state.refreshToken;

  localStorage.setItem(TOKEN_KEY, state.token);

  if (state.refreshToken) localStorage.setItem(REFRESH_KEY, state.refreshToken);
}

function hapusSesi() {
  state.token = null;
  state.refreshToken = null;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

/**
 * Satu permintaan perbarui yang dibagi bersama seluruh pemanggil.
 *
 * Ini bukan soal kerapian, melainkan kebutuhan. Server merotasi refresh token
 * setiap kali dipakai. Kalau dua permintaan sama-sama kena 401 lalu
 * masing-masing memanggil /auth/refresh, yang kedua mengirim token yang sudah
 * dirotasi oleh yang pertama — dan server membaca itu sebagai pemakaian ulang,
 * lalu mencabut SELURUH rangkaian sesi. Pengaman terhadap pencurian token
 * justru berbalik mengunci pemakainya sendiri.
 */
let refreshInFlight = null;

function refreshSession() {
  if (!state.refreshToken) return Promise.resolve(false);

  if (!refreshInFlight) {
    refreshInFlight = api('/auth/refresh', {
      method: 'POST',
      body: { refreshToken: state.refreshToken },
    })
      .then((result) => {
        simpanSesi(result.data);

        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }

  return refreshInFlight;
}

function handleExpiredSession(message) {
  hapusSesi();
  $('#app-screen').hidden = true;
  $('#login-screen').hidden = false;
  toast(message || 'Sesi berakhir, silakan masuk kembali', 'err');
}

async function bootSession() {
  const me = await api('/auth/me');

  // Daftar izin tidak boleh menghalangi proses masuk. Kalau gagal diambil,
  // konsol tetap terbuka dengan menu yang terbatas, bukan menolak login.
  const perms = await api('/auth/permissions').catch(() => ({ data: { permissions: [] } }));

  state.me = me.data.user;
  state.permissions = perms.data.permissions ?? [];

  $('#top-name').textContent = state.me.fullName;
  $('#top-roles').textContent = state.me.roles.map((role) => role.name).join(' · ') || 'tanpa role';

  $('#login-screen').hidden = true;
  $('#app-screen').hidden = false;

  await goto('dashboard');
}

const can = (permission) => state.permissions.includes(permission);

/* ============================================================
   Navigasi
   ============================================================ */
const PAGES = {
  dashboard: renderDashboard,
  profile: renderProfile,
  users: renderUsers,
  roles: renderRoles,
  matrix: renderMatrix,
  password: renderPasswordPage,
  system: renderSystem,
};

async function goto(page) {
  $$('.nav-item').forEach((btn) => btn.classList.toggle('active', btn.dataset.page === page));
  $$('.page').forEach((node) => { node.hidden = node.dataset.page !== page; });

  try {
    await PAGES[page]();
  } catch (error) {
    toast(error.message, 'err');
  }
}

/* ============================================================
   DASHBOARD
   ============================================================ */
async function renderDashboard() {
  const identity = $('#d-identity');
  clear(identity);
  [
    ['Nama Lengkap', state.me.fullName],
    ['Email', state.me.email],
    ['ID Pengguna', state.me.id],
    ['Role', state.me.roles.map((role) => role.name).join(', ') || '—'],
    ['Status', state.me.isActive ? 'Aktif' : 'Nonaktif'],
    ['Login Terakhir', fmtDate(state.me.lastLoginAt)],
  ].forEach(([label, value]) => {
    identity.append(el('div', {}, [
      el('div', { class: 'stat-label', text: label }),
      el('div', { class: 'stat-value sm mono', text: String(value) }),
    ]));
  });

  const chips = $('#d-perms');
  clear(chips);
  [...state.permissions].sort().forEach((permission) => {
    chips.append(el('span', { class: 'badge mono badge-accent', text: permission }));
  });
  $('#d-perm-count').textContent = String(state.permissions.length);

  await refreshHealth('#d-health');

  if (can('users.read')) {
    const users = await api('/users?page=1&limit=1');
    $('#d-user-count').textContent = String(users.meta.total);
  } else {
    $('#d-user-count').textContent = '—';
  }

  if (can('roles.read')) {
    const roles = await api('/roles');
    state.roles = roles.data.roles;
    $('#d-role-count').textContent = String(state.roles.length);
  } else {
    $('#d-role-count').textContent = '—';
  }

  if (can('permissions.read')) {
    const catalog = await api('/permissions');
    state.permissionCatalog = catalog.data;
    $('#d-perm-total').textContent = String(catalog.data.permissions.length);
  } else {
    $('#d-perm-total').textContent = '—';
  }
}

async function refreshHealth(selector) {
  const box = $(selector);
  clear(box);

  const health = await api('/health');
  const uptime = health.data.uptime;

  let ready = null;
  try {
    ready = await api('/health/ready');
  } catch {
    ready = null;
  }

  const checks = ready?.data ?? { database: 'down', redis: 'down' };

  box.append(
    el('div', { class: 'card' }, [
      el('div', { class: 'stat-label', text: 'Aplikasi' }),
      el('div', { class: 'row', style: 'margin-top:8px' }, [
        el('span', { class: 'dot ok' }),
        el('span', { class: 'stat-value sm', text: 'Berjalan' }),
      ]),
      el('div', { class: 'stat-foot', text: `Aktif ${uptime} detik · ${health.data.environment}` }),
    ]),
    el('div', { class: 'card' }, [
      el('div', { class: 'stat-label', text: 'PostgreSQL' }),
      el('div', { class: 'row', style: 'margin-top:8px' }, [
        el('span', { class: `dot ${checks.database === 'up' ? 'ok' : 'err'}` }),
        el('span', { class: 'stat-value sm', text: checks.database === 'up' ? 'Terhubung' : 'Terputus' }),
      ]),
      el('div', { class: 'stat-foot', text: 'Basis data utama' }),
    ]),
    el('div', { class: 'card' }, [
      el('div', { class: 'stat-label', text: 'Redis' }),
      el('div', { class: 'row', style: 'margin-top:8px' }, [
        el('span', { class: `dot ${checks.redis === 'up' ? 'ok' : 'err'}` }),
        el('span', { class: 'stat-value sm', text: checks.redis === 'up' ? 'Terhubung' : 'Terputus' }),
      ]),
      el('div', { class: 'stat-foot', text: 'Cache izin & daftar token cabut' }),
    ])
  );
}

/* ============================================================
   PROFIL
   ============================================================ */
async function renderProfile() {
  const result = await api('/profile');
  const profile = result.data.profile;

  $('#p-name').value = profile.fullName ?? '';
  $('#p-phone').value = profile.phone ?? '';
  setAvatar(profile.avatarUrl);

  const detail = $('#p-detail');
  clear(detail);
  [
    ['Email', profile.email],
    ['ID Pengguna', profile.id],
    ['Role', profile.roles.map((role) => role.name).join(', ') || '—'],
    ['Kunci Avatar', profile.avatarKey ?? '— belum ada —'],
    ['Dibuat', fmtDate(profile.createdAt)],
    ['Password Diubah', fmtDate(profile.passwordChangedAt)],
  ].forEach(([label, value]) => {
    detail.append(el('div', {}, [
      el('div', { class: 'stat-label', text: label }),
      el('div', { class: 'stat-value sm mono', text: String(value) }),
    ]));
  });
}

function setAvatar(url) {
  const fallback = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88 88">'
    + '<rect width="88" height="88" fill="#111a2e"/>'
    + '<circle cx="44" cy="34" r="13" fill="#2b3a55"/>'
    + '</svg>'
  );
  const src = url || fallback;
  $('#p-avatar').src = src;
  const top = $('#top-avatar');
  top.src = src;
  top.hidden = !url;
}

/* ============================================================
   PENGGUNA
   ============================================================ */
async function renderUsers() {
  const { page, limit } = state.users.meta;
  const result = await api(`/users?page=${page}&limit=${limit}`);
  state.users.rows = result.data.users;
  state.users.meta = { ...result.meta };

  if (state.roles.length === 0 && can('roles.read')) {
    state.roles = (await api('/roles')).data.roles;
  }

  const meta = state.users.meta;
  $('#u-meta').textContent = `${meta.total} pengguna · halaman ${meta.page} dari ${meta.totalPages}`;
  $('#u-prev').disabled = meta.page <= 1;
  $('#u-next').disabled = meta.page >= meta.totalPages;
  $('#u-new').hidden = !can('users.create');

  const body = $('#u-rows');
  clear(body);

  if (state.users.rows.length === 0) {
    body.append(el('tr', {}, el('td', { colspan: '5' }, el('div', { class: 'empty', text: 'Belum ada pengguna.' }))));
    return;
  }

  state.users.rows.forEach((user) => {
    const isSelf = user.id === state.me.id;
    const actions = el('div', { class: 'row', style: 'justify-content:flex-end;gap:6px' });

    if (can('users.read')) {
      actions.append(el('button', { class: 'btn btn-ghost btn-sm', onClick: () => showUserDetail(user.id), text: 'Detail' }));
    }
    if (can('roles.update') && !isSelf) {
      actions.append(el('button', { class: 'btn btn-sm', onClick: () => openRoleAssign(user), text: 'Role' }));
    }
    if (can('users.update') && !isSelf) {
      actions.append(el('button', { class: 'btn btn-sm', onClick: () => openUserEdit(user), text: 'Ubah' }));
    }
    if (can('users.delete') && !isSelf) {
      actions.append(el('button', { class: 'btn btn-danger btn-sm', onClick: () => removeUser(user), text: 'Hapus' }));
    }

    body.append(el('tr', {}, [
      el('td', {}, el('div', {}, [
        el('div', { style: 'font-weight:600', text: user.fullName + (isSelf ? '  (Anda)' : '') }),
        el('div', { class: 'faint mono', style: 'font-size:12px', text: user.email }),
      ])),
      el('td', {}, el('div', { class: 'perm-chips' },
        user.roles.length
          ? user.roles.map((role) => el('span', { class: 'badge mono badge-violet', text: role.name }))
          : [el('span', { class: 'faint', text: '— tanpa role —' })])),
      el('td', {}, el('span', {
        class: `badge ${user.isActive ? 'badge-ok' : 'badge-err'}`,
        text: user.isActive ? 'Aktif' : 'Nonaktif',
      })),
      el('td', { class: 'faint nowrap', text: fmtDate(user.lastLoginAt) }),
      el('td', {}, actions),
    ]));
  });
}

async function showUserDetail(userId) {
  const result = await api(`/users/${userId}`);
  const user = result.data.user;

  openModal('Detail Pengguna', el('div', { class: 'grid grid-2' },
    [
      ['Nama Lengkap', user.fullName], ['Email', user.email], ['ID', user.id],
      ['Telepon', user.phone ?? '—'], ['Status', user.isActive ? 'Aktif' : 'Nonaktif'],
      ['Role', user.roles.map((role) => role.name).join(', ') || '—'],
      ['Dibuat', fmtDate(user.createdAt)], ['Login Terakhir', fmtDate(user.lastLoginAt)],
    ].map(([label, value]) => el('div', {}, [
      el('div', { class: 'stat-label', text: label }),
      el('div', { class: 'stat-value sm mono', text: String(value) }),
    ]))
  ), []);
}

function openUserCreate() {
  const form = el('div', { class: 'stack' }, [
    field('Nama Lengkap', el('input', { class: 'input', id: 'nu-name', placeholder: 'Budi Santoso' })),
    field('Email', el('input', { class: 'input', id: 'nu-email', type: 'email', placeholder: 'budi@contoh.id' })),
    field('Password', el('input', { class: 'input', id: 'nu-pass', type: 'password', placeholder: 'minimal 12 karakter' })),
    field('Telepon (opsional)', el('input', { class: 'input', id: 'nu-phone' })),
    field('Role', roleCheckboxes('nu-role', [])),
  ]);

  openModal('Pengguna Baru', form, [
    el('button', { class: 'btn btn-primary', text: 'Buat Pengguna', onClick: async (event) => {
      const roleIds = $$('input[name="nu-role"]:checked').map((node) => Number(node.value));
      await run(event.target, () => api('/users', { method: 'POST', body: {
        fullName: $('#nu-name').value.trim(),
        email: $('#nu-email').value.trim(),
        password: $('#nu-pass').value,
        phone: $('#nu-phone').value.trim() || null,
        roleIds,
      } }), 'Pengguna berhasil dibuat', renderUsers);
    } }),
  ]);
}

function openUserEdit(user) {
  const form = el('div', { class: 'stack' }, [
    field('Nama Lengkap', el('input', { class: 'input', id: 'eu-name', value: user.fullName })),
    field('Telepon', el('input', { class: 'input', id: 'eu-phone', value: user.phone ?? '' })),
    field('Status', el('select', { class: 'select', id: 'eu-active' }, [
      el('option', { value: 'true', selected: user.isActive ? 'selected' : false }, 'Aktif'),
      el('option', { value: 'false', selected: !user.isActive ? 'selected' : false }, 'Nonaktif'),
    ])),
    el('div', { class: 'hint', text: 'Menonaktifkan akun langsung memutus seluruh sesi pengguna tersebut, tanpa menunggu tokennya kedaluwarsa.' }),
  ]);

  openModal(`Ubah — ${user.fullName}`, form, [
    el('button', { class: 'btn btn-primary', text: 'Simpan', onClick: async (event) => {
      await run(event.target, () => api(`/users/${user.id}`, { method: 'PATCH', body: {
        fullName: $('#eu-name').value.trim(),
        phone: $('#eu-phone').value.trim() || null,
        isActive: $('#eu-active').value === 'true',
      } }), 'Pengguna diperbarui', renderUsers);
    } }),
  ]);
}

function openRoleAssign(user) {
  const current = user.roles.map((role) => role.id);
  const form = el('div', { class: 'stack' }, [
    el('div', { class: 'hint', text: 'Perubahan role berlaku seketika. Cache izin pengguna ini langsung dihapus, sehingga token lamanya tetap dipakai tetapi wewenangnya sudah berubah.' }),
    roleCheckboxes('ar-role', current),
  ]);

  openModal(`Role — ${user.fullName}`, form, [
    el('button', { class: 'btn btn-primary', text: 'Tetapkan', onClick: async (event) => {
      const roleIds = $$('input[name="ar-role"]:checked').map((node) => Number(node.value));
      await run(event.target, () => api(`/users/${user.id}/roles`, { method: 'PUT', body: { roleIds } }), 'Role diperbarui', renderUsers);
    } }),
  ]);
}

async function removeUser(user) {
  if (!window.confirm(`Hapus pengguna "${user.fullName}"? Tindakan ini tidak dapat dibatalkan.`)) return;
  try {
    await api(`/users/${user.id}`, { method: 'DELETE' });
    toast('Pengguna dihapus');
    await renderUsers();
  } catch (error) {
    toast(error.message, 'err');
  }
}

function roleCheckboxes(name, checkedIds) {
  return el('div', { class: 'stack', style: 'gap:8px' },
    state.roles.map((role) => el('label', { class: 'row', style: 'cursor:pointer' }, [
      el('input', { type: 'checkbox', class: 'chk', name, value: role.id, checked: checkedIds.includes(role.id) ? 'checked' : false }),
      el('span', { class: 'badge mono badge-violet', text: role.name }),
      el('span', { class: 'faint', style: 'font-size:12.5px', text: `${role.permissions.length} izin` }),
    ]))
  );
}

/* ============================================================
   ROLE
   ============================================================ */
async function renderRoles() {
  state.roles = (await api('/roles')).data.roles;

  if (state.permissionCatalog.permissions.length === 0 && can('permissions.read')) {
    state.permissionCatalog = (await api('/permissions')).data;
  }

  $('#r-new').hidden = !can('roles.create');

  const box = $('#r-cards');
  clear(box);

  state.roles.forEach((role) => {
    const actions = el('div', { class: 'row', style: 'margin-top:14px;gap:7px' });

    if (can('roles.update')) {
      actions.append(el('button', { class: 'btn btn-sm', text: 'Ubah Izin', onClick: () => openRolePermissions(role) }));
      actions.append(el('button', { class: 'btn btn-ghost btn-sm', text: 'Keterangan', onClick: () => openRoleEdit(role) }));
    }
    if (can('roles.delete') && !role.isProtected) {
      actions.append(el('button', { class: 'btn btn-danger btn-sm', text: 'Hapus', onClick: () => removeRole(role) }));
    }

    box.append(el('div', { class: 'card' }, [
      el('div', { class: 'row' }, [
        el('span', { class: 'badge mono badge-violet', style: 'font-size:13px;padding:4px 11px', text: role.name }),
        role.isProtected ? el('span', { class: 'badge badge-warn', text: 'dilindungi' }) : null,
        el('div', { class: 'spacer' }),
        el('span', { class: 'badge', text: `${role.userCount} pengguna` }),
      ]),
      el('div', { class: 'stat-foot', style: 'margin-top:8px', text: role.description || 'Tanpa keterangan' }),
      el('div', { class: 'section-title', style: 'margin:14px 0 8px', text: `${role.permissions.length} izin` }),
      el('div', { class: 'perm-chips' }, role.permissions.length
        ? role.permissions.map((permission) => el('span', { class: 'badge mono', text: permission.name }))
        : [el('span', { class: 'faint', text: '— tidak punya izin —' })]),
      actions,
    ]));
  });
}

function openRoleCreate() {
  const form = el('div', { class: 'stack' }, [
    field('Nama Role', el('input', { class: 'input mono', id: 'nr-name', placeholder: 'auditor' })),
    field('Keterangan', el('input', { class: 'input', id: 'nr-desc', placeholder: 'Hanya boleh membaca data' })),
    field('Izin', permissionCheckboxes('nr-perm', [])),
  ]);

  openModal('Role Baru', form, [
    el('button', { class: 'btn btn-primary', text: 'Buat Role', onClick: async (event) => {
      const permissionIds = $$('input[name="nr-perm"]:checked').map((node) => Number(node.value));
      await run(event.target, () => api('/roles', { method: 'POST', body: {
        name: $('#nr-name').value.trim(),
        description: $('#nr-desc').value.trim() || null,
        permissionIds,
      } }), 'Role berhasil dibuat', renderRoles);
    } }),
  ]);
}

function openRoleEdit(role) {
  const form = el('div', { class: 'stack' }, [
    field('Nama Role', el('input', {
      class: 'input mono', id: 'er-name', value: role.name,
      disabled: role.isProtected ? 'disabled' : false,
    })),
    role.isProtected ? el('div', { class: 'hint', text: 'Role superadmin dilindungi: namanya tidak dapat diubah karena dijadikan acuan oleh aturan keamanan di kode.' }) : null,
    field('Keterangan', el('input', { class: 'input', id: 'er-desc', value: role.description ?? '' })),
  ]);

  openModal(`Ubah Role — ${role.name}`, form, [
    el('button', { class: 'btn btn-primary', text: 'Simpan', onClick: async (event) => {
      const body = { description: $('#er-desc').value.trim() || null };
      if (!role.isProtected) body.name = $('#er-name').value.trim();
      await run(event.target, () => api(`/roles/${role.id}`, { method: 'PATCH', body }), 'Role diperbarui', renderRoles);
    } }),
  ]);
}

function openRolePermissions(role) {
  const current = role.permissions.map((permission) => permission.id);
  const form = el('div', { class: 'stack' }, [
    el('div', { class: 'hint', text: `Perubahan ini berlaku untuk ${role.userCount} pengguna sekaligus. Seluruh cache izin dinaikkan versinya, sehingga tidak ada yang memakai data lama.` }),
    permissionCheckboxes('rp-perm', current),
  ]);

  openModal(`Izin — ${role.name}`, form, [
    el('button', { class: 'btn btn-primary', text: 'Simpan Izin', onClick: async (event) => {
      const permissionIds = $$('input[name="rp-perm"]:checked').map((node) => Number(node.value));
      await run(event.target, () => api(`/roles/${role.id}/permissions`, { method: 'PUT', body: { permissionIds } }),
        'Izin role diperbarui', async () => { await renderRoles(); await refreshOwnPermissions(); });
    } }),
  ]);
}

async function removeRole(role) {
  if (!window.confirm(`Hapus role "${role.name}"?`)) return;
  try {
    await api(`/roles/${role.id}`, { method: 'DELETE' });
    toast('Role dihapus');
    await renderRoles();
  } catch (error) {
    toast(error.message, 'err');
  }
}

function permissionCheckboxes(name, checkedIds) {
  const box = el('div', { class: 'stack', style: 'gap:12px;max-height:46vh;overflow-y:auto' });

  Object.entries(state.permissionCatalog.groups).forEach(([group, permissions]) => {
    box.append(el('div', {}, [
      el('div', { class: 'section-title', style: 'margin:0 0 7px', text: group }),
      el('div', { class: 'stack', style: 'gap:6px' },
        permissions.map((permission) => el('label', { class: 'row', style: 'cursor:pointer' }, [
          el('input', { type: 'checkbox', class: 'chk', name, value: permission.id, checked: checkedIds.includes(permission.id) ? 'checked' : false }),
          el('span', { class: 'mono', style: 'font-size:12.5px', text: permission.name }),
          el('span', { class: 'faint', style: 'font-size:12px', text: permission.description || '' }),
        ]))),
    ]));
  });

  return box;
}

async function refreshOwnPermissions() {
  const perms = await api('/auth/permissions');
  state.permissions = perms.data.permissions;
}

/* ============================================================
   MATRIKS IZIN
   ============================================================ */
let matrixEditing = false;

async function renderMatrix() {
  state.roles = (await api('/roles')).data.roles;
  if (state.permissionCatalog.permissions.length === 0) {
    state.permissionCatalog = (await api('/permissions')).data;
  }

  const legend = $('#m-legend');
  clear(legend);
  legend.append(
    el('span', { class: 'badge badge-ok', text: '✓ punya izin' }),
    el('span', { class: 'badge', text: '· tidak punya' }),
    el('span', { class: 'badge badge-warn', text: 'kolom dilindungi tidak dapat diubah' }),
    el('div', { class: 'spacer' }),
    el('span', { class: 'faint', style: 'font-size:12.5px', text: 'Kolom yang lebih pendek berarti wewenangnya lebih sempit.' })
  );

  $('#m-edit').hidden = matrixEditing || !can('roles.update');
  $('#m-save').hidden = !matrixEditing;
  $('#m-reset').hidden = !matrixEditing;

  const head = $('#m-head');
  clear(head);
  const headRow = el('tr', {}, el('th', { text: 'Permission' }));
  state.roles.forEach((role) => {
    headRow.append(el('th', { style: 'text-align:center' }, el('div', {}, [
      el('div', { class: 'mono', style: 'color:var(--accent-2);font-size:12.5px', text: role.name }),
      el('div', { class: 'faint', style: 'font-weight:400;font-size:10.5px;text-transform:none;letter-spacing:0', text: `${role.permissions.length} izin · ${role.userCount} user` }),
    ])));
  });
  head.append(headRow);

  const body = $('#m-body');
  clear(body);

  const owned = new Map(state.roles.map((role) => [role.id, new Set(role.permissions.map((p) => p.id))]));
  if (matrixEditing && !state.matrixDraft) {
    state.matrixDraft = new Map([...owned].map(([id, set]) => [id, new Set(set)]));
  }
  const source = matrixEditing ? state.matrixDraft : owned;

  Object.entries(state.permissionCatalog.groups).forEach(([group, permissions]) => {
    const groupRow = el('tr', { class: 'perm-group-row' }, el('td', { colspan: String(state.roles.length + 1), text: group }));
    body.append(groupRow);

    permissions.forEach((permission) => {
      const row = el('tr', {}, el('td', { class: 'perm-name' }, el('div', {}, [
        el('div', { text: permission.name }),
        el('div', { class: 'faint', style: 'font-size:11px;font-family:var(--font-ui)', text: permission.description || '' }),
      ])));

      state.roles.forEach((role) => {
        const has = source.get(role.id)?.has(permission.id) ?? false;

        if (matrixEditing) {
          const input = el('input', {
            type: 'checkbox', class: 'chk',
            checked: has ? 'checked' : false,
            disabled: role.isProtected ? 'disabled' : false,
            onChange: (event) => {
              const set = state.matrixDraft.get(role.id);
              if (event.target.checked) set.add(permission.id);
              else set.delete(permission.id);
            },
          });
          row.append(el('td', {}, input));
        } else {
          row.append(el('td', {}, el('span', { class: `mx ${has ? 'yes' : 'no'}`, text: has ? '✓' : '·' })));
        }
      });

      body.append(row);
    });
  });
}

async function saveMatrix() {
  const owned = new Map(state.roles.map((role) => [role.id, new Set(role.permissions.map((p) => p.id))]));
  const changed = state.roles.filter((role) => {
    if (role.isProtected) return false;
    const before = owned.get(role.id);
    const after = state.matrixDraft.get(role.id);
    if (before.size !== after.size) return true;
    return [...after].some((id) => !before.has(id));
  });

  if (changed.length === 0) {
    toast('Tidak ada perubahan', 'err');
    return;
  }

  for (const role of changed) {
    await api(`/roles/${role.id}/permissions`, {
      method: 'PUT',
      body: { permissionIds: [...state.matrixDraft.get(role.id)] },
    });
  }

  matrixEditing = false;
  state.matrixDraft = null;
  toast(`${changed.length} role diperbarui — cache izin dinaikkan versinya`);
  await refreshOwnPermissions();
  await renderMatrix();
}

/* ============================================================
   RESET PASSWORD
   ============================================================ */
async function renderPasswordPage() {
  if (!$('#fp-email').value) $('#fp-email').value = state.me.email;
}

/* ============================================================
   SISTEM & CAKUPAN
   ============================================================ */
async function renderSystem() {
  await refreshHealth('#s-health');

  const box = $('#s-endpoints');
  clear(box);

  let hits = 0;

  ENDPOINTS.forEach(([method, path, description]) => {
    const key = `${method} ${path}`;
    const hit = state.hitEndpoints.has(key);
    if (hit) hits += 1;

    box.append(el('div', { class: `ep ${hit ? 'hit' : ''}` }, [
      el('span', { class: `ep-m log-method ${method}`, text: method }),
      el('div', { class: 'ep-p' }, el('div', {}, [
        el('div', { text: path }),
        el('div', { class: 'faint', style: 'font-family:var(--font-ui);font-size:11.5px', text: description }),
      ])),
      el('span', { class: hit ? 'badge badge-ok' : 'badge', text: hit ? 'terpanggil' : 'belum' }),
    ]));
  });

  $('#s-coverage').textContent = `${hits} / ${ENDPOINTS.length}`;
}

/* ============================================================
   Modal & bantuan form
   ============================================================ */
function field(label, input) {
  return el('div', { class: 'field' }, [el('label', { class: 'label', text: label }), input]);
}

function openModal(title, bodyNode, footerNodes) {
  closeModal();
  const overlay = el('div', { class: 'overlay', onClick: (event) => { if (event.target === overlay) closeModal(); } }, [
    el('div', { class: 'modal' }, [
      el('div', { class: 'modal-head' }, [
        el('div', { class: 'modal-title', text: title }),
        el('div', { class: 'spacer' }),
        el('button', { class: 'x-btn', text: '×', onClick: closeModal }),
      ]),
      el('div', { class: 'modal-body' }, bodyNode),
      el('div', { class: 'modal-foot' }, [
        el('button', { class: 'btn btn-ghost', text: 'Tutup', onClick: closeModal }),
        ...(footerNodes ?? []),
      ]),
    ]),
  ]);
  $('#modal-root').append(overlay);
}

function closeModal() { clear($('#modal-root')); }

/** Menjalankan aksi dengan penguncian tombol, notifikasi, dan penyegaran halaman. */
async function run(button, action, successMessage, after) {
  button.disabled = true;
  try {
    await action();
    closeModal();
    toast(successMessage);
    if (after) await after();
  } catch (error) {
    toast(error.message, 'err');
  } finally {
    button.disabled = false;
  }
}

/* ============================================================
   Pemasangan event
   ============================================================ */
$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('#login-submit');
  button.disabled = true;
  try {
    const result = await api('/auth/login', {
      method: 'POST',
      body: { email: $('#login-email').value.trim(), password: $('#login-password').value },
    });
    simpanSesi(result.data);
    $('#login-password').value = '';
    await bootSession();
    toast(`Selamat datang, ${state.me.fullName}`);
  } catch (error) {
    toast(error.message, 'err');
  } finally {
    button.disabled = false;
  }
});

$('#open-forgot').addEventListener('click', () => {
  const form = el('div', { class: 'stack' }, [
    field('Email', el('input', { class: 'input', id: 'lf-email', type: 'email', value: $('#login-email').value })),
    el('div', { class: 'hint', text: 'Jawaban selalu sama baik email terdaftar maupun tidak, agar tidak membocorkan daftar pengguna.' }),
  ]);
  openModal('Lupa Password', form, [
    el('button', { class: 'btn btn-primary', text: 'Kirim', onClick: async (event) => {
      await run(event.target, () => api('/auth/forgot-password', { method: 'POST', body: { email: $('#lf-email').value.trim() } }),
        'Jika email terdaftar, instruksi telah dikirim');
    } }),
  ]);
});

$('#btn-logout').addEventListener('click', async () => {
  // Refresh token ikut dikirim supaya rangkaian sesinya benar-benar dicabut.
  // Tanpa itu, hanya access token yang mati sementara sesinya masih dapat
  // diperbarui sampai refresh token-nya kedaluwarsa sendiri.
  try {
    await api('/auth/logout', {
      method: 'POST',
      body: { refreshToken: state.refreshToken ?? undefined },
    });
    toast('Access token dan refresh token dicabut — logout berhasil');
  } catch (error) {
    toast(error.message, 'err');
  }

  hapusSesi();
  $('#app-screen').hidden = true;
  $('#login-screen').hidden = false;
});

// Tombol perbarui manual. Fungsinya untuk peragaan: rotasinya terlihat
// langsung di panel inspector, termasuk refresh token lama yang berganti.
$('#btn-refresh-token').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;

  try {
    const sebelum = state.refreshToken;

    if (await refreshSession()) {
      toast(
        state.refreshToken === sebelum
          ? 'Token diperbarui'
          : 'Token diperbarui — refresh token ikut dirotasi'
      );
    } else {
      toast('Gagal memperbarui token. Silakan masuk kembali.', 'err');
    }
  } finally {
    button.disabled = false;
  }
});

$$('.nav-item').forEach((button) => button.addEventListener('click', () => goto(button.dataset.page)));

/* ============================================================
   API Response Inspector — buka/tutup, geser, ubah ukuran
   ============================================================ */
const INSPECTOR_KEY = 'auth-console-inspector';
const INSPECTOR_BOX_KEY = 'auth-console-inspector-box';

/** Batas ukuran dan jarak minimum dari tepi layar. */
const BOX = { minW: 300, minH: 200, maxW: 720, maxH: 900, margin: 12 };

const inspector = $('#inspector');

const defaultBox = () => {
  const width = Math.min(430, window.innerWidth - BOX.margin * 3);
  const height = Math.min(Math.round(window.innerHeight * 0.6), 600);

  return {
    width,
    height,
    left: window.innerWidth - width - 18,
    top: window.innerHeight - height - 18,
  };
};

/** Menjaga panel tetap utuh di dalam viewport dan dalam rentang ukuran yang wajar. */
const clampBox = ({ left, top, width, height }) => {
  const maxWidth = Math.min(BOX.maxW, window.innerWidth - BOX.margin * 2);
  const maxHeight = Math.min(BOX.maxH, window.innerHeight - BOX.margin * 2);

  const safeWidth = Math.min(Math.max(width, BOX.minW), maxWidth);
  const safeHeight = Math.min(Math.max(height, BOX.minH), maxHeight);

  return {
    width: safeWidth,
    height: safeHeight,
    left: Math.min(Math.max(left, BOX.margin), window.innerWidth - safeWidth - BOX.margin),
    top: Math.min(Math.max(top, BOX.margin), window.innerHeight - safeHeight - BOX.margin),
  };
};

const applyBox = (box, { persist = true } = {}) => {
  const safe = clampBox(box);

  inspector.style.left = `${safe.left}px`;
  inspector.style.top = `${safe.top}px`;
  inspector.style.right = 'auto';
  inspector.style.bottom = 'auto';
  inspector.style.width = `${safe.width}px`;
  inspector.style.height = `${safe.height}px`;

  if (persist) {
    localStorage.setItem(INSPECTOR_BOX_KEY, JSON.stringify(safe));
    document.body.classList.add('insp-moved');
  }

  return safe;
};

const readSavedBox = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(INSPECTOR_BOX_KEY) || 'null');
    return saved && Number.isFinite(saved.width) ? saved : null;
  } catch {
    return null;
  }
};

const resetBox = () => {
  localStorage.removeItem(INSPECTOR_BOX_KEY);
  document.body.classList.remove('insp-moved');
  applyBox(defaultBox(), { persist: false });
};

const setInspectorOpen = (open) => {
  inspector.hidden = !open;
  $('#insp-open').hidden = open;
  document.body.classList.toggle('insp-open', open);
  localStorage.setItem(INSPECTOR_KEY, open ? 'open' : 'closed');

  if (open) {
    const saved = readSavedBox();
    applyBox(saved ?? defaultBox(), { persist: Boolean(saved) });
  }
};

/**
 * Satu penangan untuk geser maupun ubah ukuran. Pointer Events dipakai agar
 * mouse dan sentuh tertangani sekaligus, dan pointer capture membuat gerakan
 * tetap terlacak walau kursor keluar dari elemen pegangannya.
 */
const startInteraction = (event, mode) => {
  if (event.button !== 0) return;

  const rect = inspector.getBoundingClientRect();
  const origin = {
    pointerX: event.clientX,
    pointerY: event.clientY,
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };

  const handle = event.currentTarget;

  inspector.classList.add('interacting');
  handle.setPointerCapture(event.pointerId);

  const onMove = (moveEvent) => {
    const deltaX = moveEvent.clientX - origin.pointerX;
    const deltaY = moveEvent.clientY - origin.pointerY;

    applyBox(mode === 'drag'
      ? { ...origin, left: origin.left + deltaX, top: origin.top + deltaY }
      : { ...origin, width: origin.width + deltaX, height: origin.height + deltaY });
  };

  const onEnd = () => {
    handle.removeEventListener('pointermove', onMove);
    handle.removeEventListener('pointerup', onEnd);
    handle.removeEventListener('pointercancel', onEnd);
    inspector.classList.remove('interacting');
  };

  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', onEnd);
  handle.addEventListener('pointercancel', onEnd);
};

$('#insp-head').addEventListener('pointerdown', (event) => {
  if (event.target.closest('button')) return;
  startInteraction(event, 'drag');
});

$('#insp-head').addEventListener('dblclick', (event) => {
  if (event.target.closest('button')) return;
  resetBox();
  toast('Posisi panel dikembalikan');
});

$('#insp-grip').addEventListener('pointerdown', (event) => startInteraction(event, 'resize'));

window.addEventListener('resize', () => {
  if (inspector.hidden) return;

  const saved = readSavedBox();
  applyBox(saved ?? defaultBox(), { persist: Boolean(saved) });
});

$('#log-clear').addEventListener('click', () => { state.logs = []; renderLogs(); });
$('#insp-min').addEventListener('click', () => setInspectorOpen(false));
$('#insp-open').addEventListener('click', () => setInspectorOpen(true));

if (readSavedBox()) document.body.classList.add('insp-moved');

/**
 * Di layar sempit panel pasti menutupi kartu login, jadi bawaannya mengecil
 * dan cukup diwakili tombol pemanggil. Di layar lebar ia langsung terbuka
 * supaya request login pertama pun ikut tercatat di depan penonton.
 */
const savedOpenState = localStorage.getItem(INSPECTOR_KEY);

setInspectorOpen(savedOpenState ? savedOpenState !== 'closed' : window.innerWidth >= 1000);

$('#u-new').addEventListener('click', openUserCreate);
$('#u-prev').addEventListener('click', () => { state.users.meta.page -= 1; renderUsers(); });
$('#u-next').addEventListener('click', () => { state.users.meta.page += 1; renderUsers(); });

$('#r-new').addEventListener('click', openRoleCreate);

$('#m-edit').addEventListener('click', () => { matrixEditing = true; state.matrixDraft = null; renderMatrix(); });
$('#m-reset').addEventListener('click', () => { matrixEditing = false; state.matrixDraft = null; renderMatrix(); });
$('#m-save').addEventListener('click', async (event) => {
  event.target.disabled = true;
  try { await saveMatrix(); } catch (error) { toast(error.message, 'err'); }
  finally { event.target.disabled = false; }
});

$('#s-refresh').addEventListener('click', renderSystem);

$('#p-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await api('/profile', { method: 'PATCH', body: {
      fullName: $('#p-name').value.trim(),
      phone: $('#p-phone').value.trim() || null,
    } });
    toast('Profil diperbarui');
    await renderProfile();
    state.me.fullName = $('#p-name').value.trim();
    $('#top-name').textContent = state.me.fullName;
  } catch (error) { toast(error.message, 'err'); }
});

$('#p-upload').addEventListener('click', async () => {
  const file = $('#p-file').files[0];
  if (!file) { toast('Pilih berkas terlebih dahulu', 'err'); return; }
  const form = new FormData();
  form.append('avatar', file);
  try {
    await api('/profile/avatar', { method: 'POST', body: form, raw: true });
    toast('Avatar diunggah');
    $('#p-file').value = '';
    await renderProfile();
  } catch (error) { toast(error.message, 'err'); }
});

$('#p-remove').addEventListener('click', async () => {
  try {
    await api('/profile/avatar', { method: 'DELETE' });
    toast('Avatar dihapus');
    await renderProfile();
  } catch (error) { toast(error.message, 'err'); }
});

$('#fp-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const result = await api('/auth/forgot-password', { method: 'POST', body: { email: $('#fp-email').value.trim() } });
    toast(result.message);
  } catch (error) { toast(error.message, 'err'); }
});

$('#rp-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await api('/auth/reset-password', { method: 'POST', body: {
      token: $('#rp-token').value.trim(),
      newPassword: $('#rp-pass').value,
    } });
    toast('Password diganti — seluruh sesi lama dicabut');
    $('#rp-token').value = '';
    $('#rp-pass').value = '';
  } catch (error) { toast(error.message, 'err'); }
});

/* ============================================================
   Mulai
   ============================================================ */
(async () => {
  const saved = localStorage.getItem(TOKEN_KEY);
  const savedRefresh = localStorage.getItem(REFRESH_KEY);

  if (!saved) return;

  state.token = saved;
  state.refreshToken = savedRefresh;

  try {
    // Kalau access token yang tersimpan sudah kedaluwarsa, api() akan
    // memperbaruinya sendiri lewat refresh token — jadi menutup lalu membuka
    // kembali tab konsol tidak memaksa login ulang.
    await bootSession();
  } catch {
    hapusSesi();
    $('#app-screen').hidden = true;
    $('#login-screen').hidden = false;
  }
})();
