// IDX Sharia Stock Screener Frontend Application (Pro Suite with Search & Standalone Calculator)

let currentCandidates = [];
let allTrackedStocks = [];
let currentFilter = 'ALL';
let searchKeyword = '';
let currentOpenStock = null;
let chartInstance = null;
let deferredInstallPrompt = null;
let selectedHistoryDate = '';
let historyDatesList = [];

// -------------------------------------------------------------
// THEME MANAGEMENT (DARK MODE & LIGHT / WHITE MODE)
// -------------------------------------------------------------
function applyTheme(theme) {
  const isLight = (theme === 'light');
  if (isLight) {
    document.documentElement.classList.add('light-theme');
    if (document.body) document.body.classList.add('light-theme');
  } else {
    document.documentElement.classList.remove('light-theme');
    if (document.body) document.body.classList.remove('light-theme');
  }

  // Update theme meta color
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.setAttribute('content', isLight ? '#f6f8fa' : '#0e1117');

  // Desktop Header Button
  const desktopIcon = document.getElementById('themeToggleIcon');
  const desktopText = document.getElementById('themeToggleText');
  if (desktopIcon) {
    desktopIcon.className = isLight ? 'fa-solid fa-moon text-blue-500 text-xs' : 'fa-solid fa-sun text-amber-400 text-xs';
  }
  if (desktopText) {
    desktopText.innerText = isLight ? 'Gelap' : 'Terang';
  }

  // Mobile Header Button
  const mobileIcon = document.getElementById('mobileThemeToggleIcon');
  if (mobileIcon) {
    mobileIcon.className = isLight ? 'fa-solid fa-moon text-xs text-blue-500' : 'fa-solid fa-sun text-xs text-amber-400';
  }

  // Login Card Button
  const loginIcon = document.getElementById('loginThemeIcon');
  if (loginIcon) {
    loginIcon.className = isLight ? 'fa-solid fa-moon text-blue-500' : 'fa-solid fa-sun text-amber-400';
  }

  // Mobile Menu Sheet Item
  const menuIcon = document.getElementById('mobileMenuThemeIcon');
  const menuStatus = document.getElementById('mobileMenuThemeStatus');
  if (menuIcon) {
    menuIcon.className = isLight ? 'fa-solid fa-moon text-blue-500' : 'fa-solid fa-sun text-amber-400';
  }
  if (menuStatus) {
    menuStatus.innerText = isLight ? 'Aktif: Mode Terang (Ketuk utk Gelap)' : 'Aktif: Mode Gelap (Ketuk utk Terang)';
  }

  // Reload Chart if stock detail modal is open
  if (currentOpenStock && document.getElementById('detailModal') && !document.getElementById('detailModal').classList.contains('hidden')) {
    renderTVChart();
  }
}

function toggleTheme() {
  const isCurrentlyLight = (document.documentElement.classList.contains('light-theme') || (document.body && document.body.classList.contains('light-theme')));
  const newTheme = isCurrentlyLight ? 'dark' : 'light';
  localStorage.setItem('syariah_theme', newTheme);
  applyTheme(newTheme);
  showToast(newTheme === 'light' ? '☀️ Mode Terang (White Mode) Aktif' : '🌙 Mode Gelap (Dark Mode) Aktif');
}

function initTheme() {
  const saved = localStorage.getItem('syariah_theme') || 'dark';
  applyTheme(saved);
}

// -------------------------------------------------------------
// USER AUTHENTICATION & ACCESS CONTROL (RBAC & DEVICE RESTRICTION)
// -------------------------------------------------------------
function getOrCreateDeviceId() {
  let id = localStorage.getItem('syariah_device_id');
  if (!id) {
    id = 'dev_' + Math.random().toString(36).substring(2, 12) + '_' + Date.now().toString(36);
    localStorage.setItem('syariah_device_id', id);
  }
  return id;
}

async function authFetch(url, options = {}) {
  const token = localStorage.getItem('syariah_radar_token');
  const deviceId = getOrCreateDeviceId();
  options.headers = options.headers || {};
  if (options.headers instanceof Headers) {
    if (token) options.headers.set('Authorization', `Bearer ${token}`);
    options.headers.set('X-Device-Id', deviceId);
  } else {
    if (token) options.headers['Authorization'] = `Bearer ${token}`;
    options.headers['X-Device-Id'] = deviceId;
  }

  const res = await fetch(url, options);
  if (res.status === 401) {
    localStorage.removeItem('syariah_radar_token');
    localStorage.removeItem('syariah_radar_role');
    let msg = 'Sesi Anda telah kedaluwarsa atau akun Anda telah login di perangkat lain.';
    try {
      const errData = await res.json();
      if (errData && errData.detail) msg = errData.detail;
    } catch (e) {}
    showLoginScreen(msg);
    throw new Error(msg);
  }

  if (res.status === 403) {
    let msg = 'Akses ditolak: Fitur ini khusus untuk Administrator.';
    try {
      const errData = await res.json();
      if (errData && errData.detail) msg = errData.detail;
    } catch (e) {}
    showToast(`⛔ ${msg}`);
    throw new Error(msg);
  }

  return res;
}

function showLoginScreen(errMsg = '') {
  const screen = document.getElementById('loginScreen');
  if (screen) screen.classList.remove('hidden');
  const alert = document.getElementById('loginErrorAlert');
  const alertText = document.getElementById('loginErrorText');
  if (errMsg && alert && alertText) {
    alertText.innerText = errMsg;
    alert.classList.remove('hidden');
  } else if (alert) {
    alert.classList.add('hidden');
  }
  const badge = document.getElementById('userHeaderBadge');
  if (badge) badge.classList.add('hidden');
}

function hideLoginScreen() {
  const screen = document.getElementById('loginScreen');
  if (screen) screen.classList.add('hidden');
  const badge = document.getElementById('userHeaderBadge');
  if (badge) badge.classList.remove('hidden');
}

function updateUserBadge(username, role = 'user', expiryInfo = null) {
  const el = document.getElementById('loggedInUserName');
  const isAdmin = (role === 'admin' || (username && username.toLowerCase() === 'galunk'));

  let expiryStr = expiryInfo?.expiry_str || localStorage.getItem('syariah_radar_expiry_str') || '';
  let daysRemaining = expiryInfo?.days_remaining !== undefined && expiryInfo?.days_remaining !== null
    ? expiryInfo.days_remaining
    : (localStorage.getItem('syariah_radar_days_remaining') ? parseInt(localStorage.getItem('syariah_radar_days_remaining')) : null);
  let isLifetime = expiryInfo?.is_lifetime ?? (localStorage.getItem('syariah_radar_is_lifetime') === 'true');

  if (isAdmin) {
    isLifetime = true;
    expiryStr = 'Selamanya (Lifetime)';
    daysRemaining = null;
  }

  if (el) {
    let badgeHtml = '';
    if (isAdmin) {
      badgeHtml = `<span class="text-[9px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1.5 py-0.5 rounded ml-1 font-semibold">👑 Admin</span>`;
    } else if (isLifetime) {
      badgeHtml = `<span class="text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded ml-1 font-semibold">👑 Lifetime</span>`;
    } else if (daysRemaining !== null && daysRemaining <= 5) {
      badgeHtml = `<span class="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded ml-1 font-bold animate-pulse" title="Masa aktif s.d ${expiryStr}">⚠️ ${daysRemaining} Hari</span>`;
    } else if (daysRemaining !== null) {
      badgeHtml = `<span class="text-[9px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-1.5 py-0.5 rounded ml-1 font-semibold" title="Masa aktif s.d ${expiryStr}">⏳ ${daysRemaining} Hari</span>`;
    } else {
      badgeHtml = `<span class="text-[9px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-1.5 py-0.5 rounded ml-1 font-semibold">Member</span>`;
    }
    el.innerHTML = `${username || 'Galunk'} ${badgeHtml}`;
  }

  const mobileEl = document.getElementById('mobileUserName');
  if (mobileEl) mobileEl.innerText = username || 'Galunk';

  const mobileRoleBadge = document.getElementById('mobileUserRoleBadge');
  if (mobileRoleBadge) {
    mobileRoleBadge.innerText = isAdmin ? 'Admin' : 'Member';
    mobileRoleBadge.className = isAdmin
      ? 'text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30'
      : 'text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30';
  }

  const mobileExpiryStatus = document.getElementById('mobileUserExpiryStatus');
  if (mobileExpiryStatus) {
    if (isAdmin) {
      mobileExpiryStatus.innerText = '👑 Administrator • Akses Penuh Radar';
    } else if (isLifetime) {
      mobileExpiryStatus.innerText = '👑 VIP Lifetime • Akses Tanpa Batas';
    } else if (daysRemaining !== null && daysRemaining <= 5) {
      mobileExpiryStatus.innerHTML = `<span class="text-amber-400 font-semibold"><i class="fa-solid fa-clock"></i> Segera Berakhir: s.d ${expiryStr} (Sisa ${daysRemaining} Hari)</span>`;
    } else if (daysRemaining !== null) {
      mobileExpiryStatus.innerHTML = `<span class="text-blue-300 font-semibold"><i class="fa-solid fa-hourglass-half"></i> Masa Aktif: s.d ${expiryStr} (Sisa ${daysRemaining} Hari)</span>`;
    } else {
      mobileExpiryStatus.innerText = 'Akses Radar Saham Syariah';
    }
  }
}

function applyRolePermissions(role) {
  const isAdmin = (role === 'admin');

  // Desktop admin dropdown container: only visible for admin
  const adminMenuContainer = document.getElementById('adminMenuContainer');
  if (adminMenuContainer) {
    if (isAdmin) {
      adminMenuContainer.classList.remove('hidden');
    } else {
      adminMenuContainer.classList.add('hidden');
    }
  }

  // Desktop user management button: only visible for admin
  const userMgmtBtn = document.getElementById('adminUserMgmtBtn');
  if (userMgmtBtn) {
    if (isAdmin) {
      userMgmtBtn.classList.remove('hidden');
      userMgmtBtn.classList.add('inline-flex');
    } else {
      userMgmtBtn.classList.add('hidden');
      userMgmtBtn.classList.remove('inline-flex');
    }
  }

  // Admin-only elements (Excel export buttons, Telegram config, Tambah Saham)
  const adminElements = document.querySelectorAll('.admin-only');
  adminElements.forEach(el => {
    if (el.id === 'adminUserMgmtBtn' || el.id === 'adminMenuContainer') return; // Handled separately
    if (isAdmin) {
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  });

  // Notice for mobile non-admin users in Arsip
  const nonAdminNotice = document.getElementById('mobileNonAdminExcelNotice');
  if (nonAdminNotice) {
    if (isAdmin) {
      nonAdminNotice.classList.add('hidden');
    } else {
      nonAdminNotice.classList.remove('hidden');
    }
  }
}

function toggleAdminDropdown(event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById('adminDropdownMenu');
  if (menu) {
    menu.classList.toggle('hidden');
  }
}

function closeAdminDropdown() {
  const menu = document.getElementById('adminDropdownMenu');
  if (menu) {
    menu.classList.add('hidden');
  }
}

document.addEventListener('click', (event) => {
  const container = document.getElementById('adminMenuContainer');
  if (container && !container.contains(event.target)) {
    closeAdminDropdown();
  }
});

function togglePasswordVisibility() {
  const input = document.getElementById('loginPassword');
  const icon = document.getElementById('pwdToggleIcon');
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    icon.className = 'fa-regular fa-eye-slash text-xs';
  } else {
    input.type = 'password';
    icon.className = 'fa-regular fa-eye text-xs';
  }
}

async function handleLoginSubmit(event) {
  if (event && event.preventDefault) event.preventDefault();
  const usernameInput = document.getElementById('loginUsername');
  const passwordInput = document.getElementById('loginPassword');
  const submitBtn = document.getElementById('loginSubmitBtn');
  const errAlert = document.getElementById('loginErrorAlert');
  const errText = document.getElementById('loginErrorText');
  const expiredAction = document.getElementById('loginExpiredActionBox');

  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();
  const device_id = getOrCreateDeviceId();

  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Memverifikasi...</span>';
  errAlert.classList.add('hidden');
  if (expiredAction) expiredAction.classList.add('hidden');

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, device_id })
    });
    const data = await res.json();
    if (res.ok && data.status === 'ok') {
      localStorage.setItem('syariah_radar_token', data.token);
      localStorage.setItem('syariah_radar_user', data.username);
      localStorage.setItem('syariah_radar_role', data.role || 'user');
      if (data.expiry_str) localStorage.setItem('syariah_radar_expiry_str', data.expiry_str);
      if (data.days_remaining !== undefined && data.days_remaining !== null) {
        localStorage.setItem('syariah_radar_days_remaining', data.days_remaining);
      } else {
        localStorage.removeItem('syariah_radar_days_remaining');
      }
      localStorage.setItem('syariah_radar_is_lifetime', String(Boolean(data.is_lifetime)));

      hideLoginScreen();
      sanitizeSearchInput();
      setTimeout(sanitizeSearchInput, 100);
      setTimeout(sanitizeSearchInput, 400);
      updateUserBadge(data.username, data.role, data);
      applyRolePermissions(data.role);
      showToast(`Selamat datang, ${data.username}!`);
      loadHistoryDates();
      fetchResults(true);
      syncUserDataWithServer();
    } else {
      errText.innerText = data.detail || 'Username atau password salah.';
      if (expiredAction) {
        if (res.status === 403 || (data.detail && data.detail.includes('Masa aktif'))) {
          expiredAction.classList.remove('hidden');
        } else {
          expiredAction.classList.add('hidden');
        }
      }
      errAlert.classList.remove('hidden');
    }
  } catch (err) {
    errText.innerText = 'Gagal terhubung ke server. Periksa koneksi internet Anda.';
    if (expiredAction) expiredAction.classList.add('hidden');
    errAlert.classList.remove('hidden');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i><span>Masuk ke Radar</span>';
  }
}

async function handleLogout() {
  const token = localStorage.getItem('syariah_radar_token');
  try {
    if (token) {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Device-Id': getOrCreateDeviceId()
        }
      });
    }
  } catch (e) {}
  localStorage.removeItem('syariah_radar_token');
  localStorage.removeItem('syariah_radar_role');
  localStorage.removeItem('syariah_radar_expiry_str');
  localStorage.removeItem('syariah_radar_days_remaining');
  localStorage.removeItem('syariah_radar_is_lifetime');
  showLoginScreen('Anda telah berhasil keluar.');
}

async function checkAuthStatus() {
  const token = localStorage.getItem('syariah_radar_token');
  const savedUser = localStorage.getItem('syariah_radar_user') || 'Galunk';
  const savedRole = localStorage.getItem('syariah_radar_role') || 'user';
  if (!token) {
    showLoginScreen();
    return;
  }
  try {
    const res = await fetch('/api/auth/verify', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Device-Id': getOrCreateDeviceId()
      }
    });
    if (res.ok) {
      const data = await res.json();
      const role = data.role || savedRole;
      localStorage.setItem('syariah_radar_role', role);
      if (data.expiry_str) localStorage.setItem('syariah_radar_expiry_str', data.expiry_str);
      if (data.days_remaining !== undefined && data.days_remaining !== null) {
        localStorage.setItem('syariah_radar_days_remaining', data.days_remaining);
      } else {
        localStorage.removeItem('syariah_radar_days_remaining');
      }
      localStorage.setItem('syariah_radar_is_lifetime', String(Boolean(data.is_lifetime)));

      hideLoginScreen();
      sanitizeSearchInput();
      setTimeout(sanitizeSearchInput, 100);
      setTimeout(sanitizeSearchInput, 400);
      updateUserBadge(data.username || savedUser, role, data);
      applyRolePermissions(role);
      loadHistoryDates();
      fetchResults();
      syncUserDataWithServer();
    } else {
      const errData = await res.json().catch(() => ({}));
      localStorage.removeItem('syariah_radar_token');
      localStorage.removeItem('syariah_radar_role');
      showLoginScreen(errData.detail || 'Sesi Anda telah kedaluwarsa atau akun telah login di perangkat lain.');
      const expiredAction = document.getElementById('loginExpiredActionBox');
      if (expiredAction && (res.status === 403 || (errData.detail && errData.detail.includes('Masa aktif')))) {
        expiredAction.classList.remove('hidden');
      }
    }
  } catch (e) {
    hideLoginScreen();
    sanitizeSearchInput();
    setTimeout(sanitizeSearchInput, 100);
    setTimeout(sanitizeSearchInput, 400);
    updateUserBadge(savedUser, savedRole);
    applyRolePermissions(savedRole);
    loadHistoryDates();
    fetchResults();
    syncUserDataWithServer();
  }
}

let isSyncingUserData = false;
let syncUserTimer = null;

async function syncUserDataWithServer(forceOverwriteTrades = false) {
  if (isSyncingUserData) return;
  const token = localStorage.getItem('syariah_radar_token');
  if (!token) return;

  isSyncingUserData = true;
  try {
    const localWatchlist = watchlist || [];
    const localTrades = (typeof getJournalTrades === 'function') ? getJournalTrades() : [];
    const localCap = parseFloat(localStorage.getItem('user_trading_capital')) || 50000000;

    const res = await authFetch('/api/user/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        watchlist: localWatchlist,
        trades: localTrades,
        capital: localCap,
        overwrite_trades: forceOverwriteTrades
      })
    });

    if (res.ok) {
      const data = await res.json();
      if (data.status === 'ok') {
        // Hydrate Watchlist
        if (Array.isArray(data.watchlist)) {
          watchlist = data.watchlist;
          localStorage.setItem('sharia_radar_watchlist', JSON.stringify(watchlist));
          updateWatchlistCounter();
          renderCandidates();
          updateModalWatchlistBtn();
        }

        // Hydrate Jurnal Trades
        if (Array.isArray(data.trades)) {
          const key = 'syariah_radar_journal_' + getJournalUserKey();
          localStorage.setItem(key, JSON.stringify(data.trades));
          updateJournalBadges();
          if (typeof renderJournalView === 'function') {
            renderJournalView();
          }
        }

        if (data.capital) {
          localStorage.setItem('user_trading_capital', data.capital);
        }
      }
    }
  } catch (err) {
    console.warn("Background user sync skipped:", err);
  } finally {
    isSyncingUserData = false;
  }
}

function debouncedSyncUserData(forceOverwriteTrades = false) {
  if (syncUserTimer) clearTimeout(syncUserTimer);
  syncUserTimer = setTimeout(() => {
    syncUserDataWithServer(forceOverwriteTrades);
  }, 400);
}

let watchlist = [];
try {
  watchlist = JSON.parse(localStorage.getItem('sharia_radar_watchlist')) || [];
} catch (e) {
  watchlist = [];
}

function updateWatchlistCounter() {
  const el = document.getElementById('watchlistCount');
  if (el) el.innerText = watchlist.length;
  const mobileBadge = document.getElementById('mobileWatchlistBadge');
  if (mobileBadge) {
    mobileBadge.innerText = watchlist.length;
    if (watchlist.length > 0) {
      mobileBadge.classList.remove('hidden');
      mobileBadge.classList.add('flex');
    } else {
      mobileBadge.classList.add('hidden');
      mobileBadge.classList.remove('flex');
    }
  }
}

function isWatchlisted(code) {
  return watchlist.includes(code);
}

function toggleWatchlist(code, event = null) {
  if (event) event.stopPropagation();
  if (isWatchlisted(code)) {
    watchlist = watchlist.filter(c => c !== code);
    showToast(`⭐ ${code} dihapus dari Watchlist`);
  } else {
    watchlist.push(code);
    showToast(`⭐ ${code} disimpan ke Watchlist!`);
  }
  localStorage.setItem('sharia_radar_watchlist', JSON.stringify(watchlist));
  updateWatchlistCounter();
  renderCandidates();
  updateModalWatchlistBtn();
  debouncedSyncUserData();
}

function toggleModalWatchlist() {
  if (!currentOpenStock) return;
  toggleWatchlist(currentOpenStock.code);
}

function updateModalWatchlistBtn() {
  if (!currentOpenStock) return;
  const icon = document.getElementById('modalWatchlistIcon');
  if (icon) {
    icon.className = isWatchlisted(currentOpenStock.code) 
      ? 'fa-solid fa-star text-amber-400 text-sm' 
      : 'fa-regular fa-star text-sm';
  }
}

// -------------------------------------------------------------
// TOAST NOTIFICATIONS & CLIPBOARD COPYING
// -------------------------------------------------------------
function showToast(message) {
  const toast = document.getElementById('toastNotification');
  const text = document.getElementById('toastText');
  if (!toast || !text) return;
  text.innerText = message;
  toast.classList.remove('hidden');
  toast.classList.add('flex');
  clearTimeout(window._toastTimeout);
  window._toastTimeout = setTimeout(() => {
    toast.classList.add('hidden');
    toast.classList.remove('flex');
  }, 2600);
}

function copyToClipboard(text, successMsg = "Berhasil disalin ke clipboard!") {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(successMsg);
    }).catch(() => fallbackCopy(text, successMsg));
  } else {
    fallbackCopy(text, successMsg);
  }
}

function fallbackCopy(text, successMsg) {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try {
    document.execCommand('copy');
    showToast(successMsg);
  } catch (err) {
    console.error('Fallback copy error:', err);
  }
  document.body.removeChild(textArea);
}

function generateStockSignalText(stock) {
  if (!stock) return '';
  const s = stock;
  const plan = s.trading_plan || {
    entry: s.price,
    stop_loss: roundToIDXTick(s.price * 0.95),
    tp1: roundToIDXTick(s.price * 1.06),
    tp2: roundToIDXTick(s.price * 1.12),
    risk_pct: 5.0,
    tp1_pct: 6.0,
    tp2_pct: 12.0
  };

  let setupName = 'Swing Trend Following';
  if (s.setup_type === 'STAGE2_BREAKOUT') {
    setupName = '🚀 Breakout Retest (Stage 2 Uptrend)';
  } else if (s.setup_type === 'UPTREND_PULLBACK') {
    setupName = '📈 Pullback Support MA20/MA50';
  } else if (s.setup_type === 'RS_LEADER') {
    setupName = '👑 Leader Kuat di Atas MA200';
  } else if (s.setup_type === 'OVERSOLD_REVERSAL') {
    setupName = '⚡ Reversal Pantulan Oversold';
  }

  let riskLabel = '🛡️ Grade A+ (Paling Aman)';
  if (s.risk_level === 'MEDIUM_RISK') riskLabel = '⚖️ Grade B (Moderat)';
  else if (s.risk_level === 'HIGH_RISK') riskLabel = '⚠️ Spekulatif';

  const bandar = s.bandarmologi || {};
  const bandarLabel = bandar.label || (s.bandar_score >= 80 ? 'Akumulasi Jumbo' : (s.bandar_score >= 65 ? 'Akumulasi Sedang' : 'Netral'));

  const ff = s.foreign_flow || {};
  let brokerFlowText = 'Smart Money Terdeteksi';
  if (ff.top1_broker && ff.top1_broker !== '-') {
    brokerFlowText = `Top 1: ${ff.top1_broker} (${ff.top1_category}) | Top 2: ${ff.top2_broker} (${ff.top2_category})`;
  }

  let foreignText = 'Netral / Domestik Driven';
  if (ff.is_accum) {
    foreignText = `Akumulasi Asing Net: ${ff.net_val_str || 'Positif'}${ff.foreign_brokers_str ? ' via ' + ff.foreign_brokers_str : ''}`;
  }

  const dateStr = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

  return `🚀 SINYAL SWING RADAR SYARIAH
📅 Tanggal: ${dateStr}
━━━━━━━━━━━━━━━━━━━━━━
📌 Emiten : ${s.code} - ${s.name || ''}
🏛️ Sektor : ${s.sector || 'BEI Syariah'} (ISSI)
🎯 Setup  : ${setupName}
⭐ Skor   : ${s.score || 80}/100 (${riskLabel})
━━━━━━━━━━━━━━━━━━━━━━
📍 Area Beli (Entry)  : Rp ${formatIDR(plan.entry)}
⛔ Stop Loss (Proteksi): Rp ${formatIDR(plan.stop_loss)} (-${plan.risk_pct}%)
🎯 Target Profit 1    : Rp ${formatIDR(plan.tp1)} (+${plan.tp1_pct}%)
🚀 Target Profit 2    : Rp ${formatIDR(plan.tp2)} (+${plan.tp2_pct}%)
⚖️ Risk / Reward      : 1 : 2.5
━━━━━━━━━━━━━━━━━━━━━━
🕵️‍♂️ BANDARMOLOGI & FLOW:
• Status Akumulasi : ${bandarLabel} (Skor: ${s.bandar_score || bandar.score || 80}/100)
• Broker Penggerak : ${brokerFlowText}
• Aliran Asing     : ${foreignText}
━━━━━━━━━━━━━━━━━━━━━━
📱 Analisa otomatis via Syariah Swing Radar Pro
🔗 https://syariah-radar.vercel.app/
⚠️ Disclaimer On: Riset mandiri & selalu disiplin Stop Loss.`;
}

function openWhatsAppModal(stock, text) {
  const modal = document.getElementById('whatsappShareModal');
  if (!modal) return;

  const tickerEl = document.getElementById('waModalTicker');
  const previewEl = document.getElementById('waModalPreviewText');
  const linkEl = document.getElementById('waModalDirectLink');

  if (tickerEl) tickerEl.innerText = stock.code || 'SAHAM';
  if (previewEl) previewEl.value = text;
  
  const waUrl = 'https://api.whatsapp.com/send?text=' + encodeURIComponent(text);
  if (linkEl) linkEl.href = waUrl;

  modal.classList.remove('hidden');

  // Also auto-copy to clipboard
  copyToClipboard(text, `📲 Sinyal ${stock.code} Berhasil Disalin!`);

  // Direct trigger attempt via temporary anchor element
  try {
    const directLink = document.createElement('a');
    directLink.href = waUrl;
    directLink.target = '_blank';
    directLink.rel = 'noopener noreferrer';
    document.body.appendChild(directLink);
    directLink.click();
    document.body.removeChild(directLink);
  } catch (e) {
    console.warn('Direct popup prevented, modal is open for user click:', e);
  }
}

function closeWhatsAppModal() {
  const modal = document.getElementById('whatsappShareModal');
  if (modal) modal.classList.add('hidden');
}

function copyWAModalText() {
  const previewEl = document.getElementById('waModalPreviewText');
  if (previewEl && previewEl.value) {
    copyToClipboard(previewEl.value, '✅ Teks Sinyal Berhasil Disalin ke Clipboard!');
  }
}

// -------------------------------------------------------------
// BAROMETER KESEHATAN PASAR (IHSG & SYARIAH TRAFFIC LIGHT)
// -------------------------------------------------------------
let currentMarketHealth = null;

function renderMarketHealth(health) {
  if (!health) return;
  currentMarketHealth = health;

  const section = document.getElementById('marketHealthSection');
  if (!section) return;

  const regime = health.regime || 'NEUTRAL';
  const score = health.score || 50;
  const color = health.color || 'amber'; // 'emerald', 'amber', 'rose'

  // Dynamic container styling based on regime
  section.className = `border rounded-2xl p-4 md:p-5 shadow-sm transition-all duration-300 ${
    color === 'emerald'
      ? 'bg-[#161b22] border-emerald-500/40 shadow-emerald-950/20'
      : color === 'amber'
      ? 'bg-[#161b22] border-amber-500/40 shadow-amber-950/20'
      : 'bg-[#161b22] border-rose-500/40 shadow-rose-950/20'
  }`;

  // Icon box
  const iconBox = document.getElementById('mhRegimeIconBox');
  if (iconBox) {
    iconBox.className = `w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border text-2xl transition-all duration-300 ${
      color === 'emerald'
        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
        : color === 'amber'
        ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
        : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
    }`;
  }

  const emojiEl = document.getElementById('mhRegimeEmoji');
  if (emojiEl) {
    emojiEl.textContent = color === 'emerald' ? '🟢' : color === 'amber' ? '🟡' : '🔴';
  }

  // Badge & Score
  const badgeEl = document.getElementById('mhRegimeBadge');
  if (badgeEl) {
    badgeEl.textContent = health.badge || regime;
    badgeEl.className = `text-xs font-black uppercase tracking-wider px-2.5 py-0.5 rounded-lg border ${
      color === 'emerald'
        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
        : color === 'amber'
        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
        : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
    }`;
  }

  const scoreBadge = document.getElementById('mhScoreBadge');
  if (scoreBadge) {
    scoreBadge.textContent = `Skor: ${score}/100`;
    scoreBadge.className = `text-xs font-bold ${
      color === 'emerald' ? 'text-emerald-400' : color === 'amber' ? 'text-amber-400' : 'text-rose-400'
    }`;
  }

  // Action Title & Guidance
  const actionTitle = document.getElementById('mhActionTitle');
  if (actionTitle) {
    actionTitle.textContent = health.action_title || health.label || 'Kondisi Pasar';
  }

  const guidanceText = document.getElementById('mhGuidanceText');
  if (guidanceText) {
    guidanceText.textContent = health.guidance || '';
  }

  // IHSG Ticker & Change
  const ihsgClose = document.getElementById('mhIHSGClose');
  const ihsgChg = document.getElementById('mhIHSGChg');
  if (health.ihsg) {
    if (ihsgClose) {
      ihsgClose.textContent = health.ihsg.close ? health.ihsg.close_fmt : '-';
    }
    if (ihsgChg) {
      const chg = health.ihsg.change_pct;
      const chgSign = chg > 0 ? '+' : '';
      const chgColor = chg > 0 ? 'text-emerald-400' : chg < 0 ? 'text-rose-400' : 'text-gray-400';
      ihsgChg.className = `text-[10.5px] font-bold block ${chgColor}`;
      ihsgChg.textContent = `${chgSign}${chg}%`;
    }
  }

  // Breadth Syariah MA50
  const syariahMA50Pct = document.getElementById('mhSyariahMA50Pct');
  const syariahMA50Count = document.getElementById('mhSyariahMA50Count');
  if (health.breadth) {
    if (syariahMA50Pct) {
      syariahMA50Pct.textContent = `${health.breadth.above_ma50_pct}%`;
      syariahMA50Pct.className = `text-sm font-black font-mono block ${
        health.breadth.above_ma50_pct >= 50 ? 'text-emerald-400' : health.breadth.above_ma50_pct >= 30 ? 'text-amber-400' : 'text-rose-400'
      }`;
    }
    if (syariahMA50Count) {
      syariahMA50Count.textContent = `${health.breadth.above_ma50_count}/${health.breadth.total_stocks} saham`;
    }
  }

  // Cash / Allocation Pill
  const cashPct = document.getElementById('mhCashPct');
  const capPct = document.getElementById('mhCapPct');
  if (cashPct) {
    cashPct.textContent = `${health.cash_pct}% Cash`;
    cashPct.className = `text-sm font-black font-mono block ${
      color === 'emerald' ? 'text-emerald-400' : color === 'amber' ? 'text-amber-400' : 'text-rose-400'
    }`;
  }
  if (capPct) {
    capPct.textContent = `Maks Modal ${health.allocation_pct}%`;
  }

  // Progress Bar
  const scoreBar = document.getElementById('mhScoreBar');
  if (scoreBar) {
    scoreBar.style.width = `${Math.min(Math.max(score, 5), 100)}%`;
    scoreBar.className = `h-full rounded-full transition-all duration-500 ${
      color === 'emerald' ? 'bg-emerald-500' : color === 'amber' ? 'bg-amber-500' : 'bg-rose-500'
    }`;
  }

  const statusPill = document.getElementById('mhStatusPill');
  if (statusPill) {
    statusPill.textContent = health.label || regime;
    statusPill.className = `shrink-0 font-mono font-bold text-xs ${
      color === 'emerald' ? 'text-emerald-400' : color === 'amber' ? 'text-amber-400' : 'text-rose-400'
    }`;
  }
}

function openMarketHealthModal() {
  const modal = document.getElementById('marketHealthModal');
  if (!modal) return;
  modal.classList.remove('hidden');
  document.body.classList.add('overflow-hidden');

  if (currentMarketHealth) {
    const mh = currentMarketHealth;
    const modalRegimeBadge = document.getElementById('mhModalCurrentRegime');
    if (modalRegimeBadge) {
      modalRegimeBadge.textContent = `${mh.badge} (Skor ${mh.score}/100)`;
      modalRegimeBadge.className = `text-xs font-black uppercase px-2.5 py-1 rounded-lg border inline-block mt-1 ${
        mh.color === 'emerald'
          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
          : mh.color === 'amber'
          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
          : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
      }`;
    }
  }
}

function closeMarketHealthModal() {
  const modal = document.getElementById('marketHealthModal');
  if (!modal) return;
  modal.classList.add('hidden');
  document.body.classList.remove('overflow-hidden');
}

function shareStockSignal(code) {
  const upper = (code || '').trim().toUpperCase();
  const stock = currentCandidates.find(c => (c.code || '').trim().toUpperCase() === upper) ||
                allTrackedStocks.find(s => (s.code || '').trim().toUpperCase() === upper) ||
                currentOpenStock;
  if (!stock) {
    showToast("Data saham tidak ditemukan.");
    return;
  }

  const text = generateStockSignalText(stock);
  openWhatsAppModal(stock, text);
}

function shareCurrentModalToWhatsApp() {
  if (!currentOpenStock) return;
  const text = generateStockSignalText(currentOpenStock);
  openWhatsAppModal(currentOpenStock, text);
}

function copyCurrentModalPlan() {
  if (!currentOpenStock) return;
  const s = currentOpenStock;
  const baseText = generateStockSignalText(s);

  const lots = document.getElementById('calcLots')?.innerText;
  const shares = document.getElementById('calcShares')?.innerText;
  const allocated = document.getElementById('calcAllocated')?.innerText;
  const allocPct = document.getElementById('calcAllocPct')?.innerText;
  const maxRisk = document.getElementById('calcMaxRisk')?.innerText;
  const riskPct = document.getElementById('calcRiskPct')?.value || 2;

  let fullText = baseText;
  if (lots && lots !== '0 Lot' && lots !== '0 Lot') {
    const mmBlock = `━━━━━━━━━━━━━━━━━━━━━━
💰 MONEY MANAGEMENT (${riskPct}% Risiko Portofolio):
• Ukuran Posisi : ${lots} ${shares}
• Modal Alokasi : ${allocated} ${allocPct}
• Risiko Maksimal: ${maxRisk} jika kena SL`;
    fullText = fullText.replace('━━━━━━━━━━━━━━━━━━━━━━\n📱 Analisa otomatis', `${mmBlock}\n━━━━━━━━━━━━━━━━━━━━━━\n📱 Analisa otomatis`);
  }

  copyToClipboard(fullText, `✅ Sinyal & Trading Plan ${s.code} Lengkap Berhasil Disalin!`);
}

function copyStandalonePlan() {
  const code = document.getElementById('calcStockSelector').value || 'SAHAM';
  const entry = parseFloat(document.getElementById('scEntry').value);
  const stopLoss = parseFloat(document.getElementById('scStopLoss').value);
  const capital = parseFloat(document.getElementById('scCapital').value) || 50000000;
  const riskPct = parseFloat(document.getElementById('scRiskPct').value) || 2.0;

  if (!entry || !stopLoss) {
    showToast('⚠️ Masukkan harga Entry & Stop Loss terlebih dahulu.');
    return;
  }

  const lots = document.getElementById('scResultLots').innerText;
  const shares = document.getElementById('scResultShares').innerText;
  const allocated = document.getElementById('scResultAlloc').innerText;
  const allocPct = document.getElementById('scResultAllocPct').innerText;
  const maxRisk = document.getElementById('scResultMaxRisk').innerText;
  const profitTP1 = document.getElementById('scResultProfitTP1').innerText;
  const profitTP2 = document.getElementById('scResultProfitTP2').innerText;

  const riskPerShare = entry - stopLoss;
  const tp1 = Math.round(entry + (1.5 * riskPerShare));
  const tp2 = Math.round(entry + (2.5 * riskPerShare));

  const text = `📌 SWING PLAN & LOT SIZING: ${code}
────────────────────────────
📍 Entry Price : ${formatIDR(entry)}
⛔ Stop Loss   : ${formatIDR(stopLoss)} (-${((riskPerShare/entry)*100).toFixed(1)}%)
🎯 Target TP1  : ${formatIDR(tp1)} (${profitTP1})
🚀 Target TP2  : ${formatIDR(tp2)} (${profitTP2})
⚖️ Risk/Reward : 1 : 2.5
────────────────────────────
💰 Ukuran Posisi (${riskPct}% Risiko dari ${formatIDR(capital)}):
- Jumlah Lot   : ${lots} ${shares}
- Total Modal  : ${allocated} ${allocPct}
- Maksimal Rugi: ${maxRisk} (Terkunci jika terkena SL)
────────────────────────────
💡 Sumber: Syariah Swing Radar Pro`;

  copyToClipboard(text, `✅ Rencana Trading ${code} Berhasil Disalin!`);
}

function formatIDR(val) {
  if (val === null || val === undefined || isNaN(val)) return '-';
  return 'Rp ' + Math.round(Number(val)).toLocaleString('id-ID');
}

// -------------------------------------------------------------
// PWA INSTALLATION SUPPORT (FOR ANDROID & MOBILE)
// -------------------------------------------------------------
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  console.log('[PWA] beforeinstallprompt event captured');
  const directBtn = document.getElementById('directInstallMobileBtn');
  if (directBtn) {
    directBtn.classList.remove('hidden');
  }
});

window.addEventListener('appinstalled', () => {
  console.log('[PWA] Application successfully installed');
  showToast('Aplikasi Syariah Radar berhasil dipasang di HP!');
  deferredInstallPrompt = null;
  closeMobileAppModal();
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then((reg) => {
      console.log('Service Worker Registered (v1.0.0)');
      if (reg) reg.update();
    })
    .catch((err) => console.log('Service Worker Failed:', err));
}

function handleInstallAppClick() {
  if (deferredInstallPrompt) {
    triggerDirectInstall();
  } else {
    openMobileAppModal();
  }
}

async function triggerDirectInstall() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    if (outcome === 'accepted') {
      showToast('Aplikasi sedang dipasang ke HP...');
    }
    deferredInstallPrompt = null;
    closeMobileAppModal();
  } else {
    openMobileAppModal();
  }
}

async function openMobileAppModal() {
  const modal = document.getElementById('mobileAppModal');
  if (!modal) return;
  modal.classList.remove('hidden');

  try {
    const res = await fetch('/api/system/info');
    if (res.ok) {
      const data = await res.json();
      const mobileUrl = data.mobile_url || window.location.origin;
      const urlEl = document.getElementById('mobileAppUrlText');
      if (urlEl) urlEl.innerText = mobileUrl;
      const qrEl = document.getElementById('mobileAppQrImg');
      if (qrEl) {
        qrEl.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(mobileUrl)}`;
      }
    }
  } catch (e) {
    console.warn('Could not fetch system info:', e);
    const fallbackUrl = window.location.origin;
    const urlEl = document.getElementById('mobileAppUrlText');
    if (urlEl) urlEl.innerText = fallbackUrl;
    const qrEl = document.getElementById('mobileAppQrImg');
    if (qrEl) {
      qrEl.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(fallbackUrl)}`;
    }
  }
}

function closeMobileAppModal() {
  const modal = document.getElementById('mobileAppModal');
  if (modal) modal.classList.add('hidden');
}

function copyMobileUrl() {
  const urlEl = document.getElementById('mobileAppUrlText');
  if (!urlEl) return;
  const text = urlEl.innerText;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('Link HP berhasil disalin!');
    }).catch(() => {
      fallbackCopy(text);
      showToast('Link HP berhasil disalin!');
    });
  } else {
    fallbackCopy(text);
    showToast('Link HP berhasil disalin!');
  }
}

// -------------------------------------------------------------
// SEARCH FILTERING
// -------------------------------------------------------------
function sanitizeSearchInput() {
  const input = document.getElementById('searchInput');
  const clearBtn = document.getElementById('clearSearchBtn');
  if (!input) return;

  const currentVal = input.value.trim().toLowerCase();
  const savedUser = (localStorage.getItem('syariah_radar_user') || 'galunk').toLowerCase();

  // If the search input got autofilled with username or 'galunk'
  if (currentVal === savedUser || currentVal === 'galunk') {
    input.value = '';
    searchKeyword = '';
    if (clearBtn) clearBtn.classList.add('hidden');
  } else {
    searchKeyword = currentVal;
    if (currentVal.length > 0 && clearBtn) {
      clearBtn.classList.remove('hidden');
    }
  }
}

function handleSearch() {
  const input = document.getElementById('searchInput');
  const clearBtn = document.getElementById('clearSearchBtn');
  if (!input) return;

  const val = input.value.trim().toLowerCase();
  const savedUser = (localStorage.getItem('syariah_radar_user') || 'galunk').toLowerCase();

  // Guard against browser autofilling credential username into screener search bar
  if (val === savedUser || val === 'galunk') {
    input.value = '';
    searchKeyword = '';
    if (clearBtn) clearBtn.classList.add('hidden');
    renderCandidates();
    return;
  }

  searchKeyword = val;

  if (searchKeyword.length > 0) {
    if (clearBtn) clearBtn.classList.remove('hidden');
  } else {
    if (clearBtn) clearBtn.classList.add('hidden');
  }

  renderCandidates();
}

function clearSearch() {
  const input = document.getElementById('searchInput');
  const clearBtn = document.getElementById('clearSearchBtn');
  if (input) input.value = '';
  searchKeyword = '';
  if (clearBtn) clearBtn.classList.add('hidden');
  renderCandidates();
}

// -------------------------------------------------------------
// HISTORICAL DATABASE & ARCHIVE MANAGEMENT
// -------------------------------------------------------------
async function loadHistoryDates() {
  const select = document.getElementById('historyDateSelect');
  const mobileSelect = document.getElementById('mobileHistoryDateSelect');
  if (!select && !mobileSelect) return;

  try {
    const res = await authFetch('/api/history/dates');
    if (!res.ok) return;
    const data = await res.json();
    historyDatesList = Array.isArray(data) ? data : (data.dates || []);

    const currentVal = selectedHistoryDate || (select ? select.value : '');

    if (select) select.innerHTML = '<option value="">🟢 Terkini (Hari Ini)</option>';
    if (mobileSelect) mobileSelect.innerHTML = '<option value="">🟢 Terkini (Hari Ini)</option>';

    historyDatesList.forEach(item => {
      const count = item.total_candidates !== undefined ? item.total_candidates : (item.candidate_count || 0);
      const text = `📅 ${item.market_date} (${count} Saham)`;

      if (select) {
        const opt = document.createElement('option');
        opt.value = item.market_date;
        opt.textContent = text;
        if (item.market_date === currentVal) opt.selected = true;
        select.appendChild(opt);
      }

      if (mobileSelect) {
        const mOpt = document.createElement('option');
        mOpt.value = item.market_date;
        mOpt.textContent = text;
        if (item.market_date === currentVal) mOpt.selected = true;
        mobileSelect.appendChild(mOpt);
      }
    });
  } catch (e) {
    console.warn("Could not load history dates:", e);
  }
}

async function handleHistoryDateChange(date) {
  selectedHistoryDate = date || '';
  const badge = document.getElementById('historicalBadge');
  const exportBtn = document.getElementById('exportExcelBtn');

  if (selectedHistoryDate) {
    if (badge) {
      badge.textContent = `Arsip: ${selectedHistoryDate}`;
      badge.classList.remove('hidden');
    }
    if (exportBtn) {
      exportBtn.innerHTML = `<i class="fa-solid fa-file-excel text-emerald-200"></i><span>Export Excel (${selectedHistoryDate})</span>`;
    }

    const stockList = document.getElementById('stockList');
    if (stockList) {
      stockList.innerHTML = `
        <div class="text-center py-12 text-gray-400">
          <i class="fa-solid fa-spinner fa-spin text-2xl text-emerald-400 mb-3"></i>
          <p class="text-sm">Membuka arsip database tanggal ${selectedHistoryDate}...</p>
        </div>
      `;
    }

    try {
      const res = await authFetch(`/api/history/results?date=${encodeURIComponent(selectedHistoryDate)}`);
      if (!res.ok) throw new Error("Gagal mengambil data arsip tanggal tersebut");

      const data = await res.json();
      currentCandidates = data.candidates || [];
      allTrackedStocks = data.candidates || [];

      document.getElementById('statScanned').innerText = data.scanned_count || currentCandidates.length;
      document.getElementById('statCandidates').innerText = currentCandidates.length;

      const lowRiskCount = currentCandidates.filter(c => c.risk_level === 'LOW_RISK').length;
      document.getElementById('statLowRisk').innerText = lowRiskCount;

      const accumCount = currentCandidates.filter(c => c.bandarmologi && (c.bandarmologi.status === 'BIG_ACCUMULATION' || c.bandarmologi.status === 'ACCUMULATION')).length;
      document.getElementById('statAccumulation').innerText = accumCount;

      if (data.market_health) {
        renderMarketHealth(data.market_health);
      }

      populateCalculatorDropdown();
      populateBroksumStockDropdown();
      renderCandidates();
      showToast(`Arsip ${selectedHistoryDate} dimuat (${currentCandidates.length} saham)`);
    } catch (err) {
      console.error("Error loading historical results:", err);
      if (stockList) {
        stockList.innerHTML = `
          <div class="text-center py-8 text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-4">
            <i class="fa-solid fa-triangle-exclamation text-2xl mb-2"></i>
            <p class="font-semibold text-sm">Gagal memuat arsip tanggal ${selectedHistoryDate}</p>
            <p class="text-xs text-gray-400 mt-1">${err.message}</p>
            <button onclick="handleHistoryDateChange('${selectedHistoryDate}')" class="mt-3 px-3 py-1 bg-gray-800 text-xs rounded hover:bg-gray-700 text-white">Coba Lagi</button>
          </div>
        `;
      }
    }
  } else {
    if (badge) badge.classList.add('hidden');
    if (exportBtn) {
      exportBtn.innerHTML = `<i class="fa-solid fa-file-excel text-emerald-200"></i><span>Export Excel (.xlsx)</span>`;
    }
    fetchResults();
  }
}

// -------------------------------------------------------------
// EXCEL EXPORT HANDLER
// -------------------------------------------------------------
async function downloadExcelExport() {
  const exportBtn = document.getElementById('exportExcelBtn');
  const originalHtml = exportBtn ? exportBtn.innerHTML : '';
  if (exportBtn) {
    exportBtn.disabled = true;
    exportBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-emerald-200"></i><span>Mengunduh...</span>';
  }

  showToast('Menyiapkan file Excel (.xlsx)...');

  try {
    let url = '/api/screener/export-excel';
    if (selectedHistoryDate) {
      url += `?date=${encodeURIComponent(selectedHistoryDate)}`;
    }

    const res = await authFetch(url);
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.detail || `Gagal mengunduh file Excel (${res.status})`);
    }

    const blob = await res.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;

    const dateLabel = selectedHistoryDate || (new Date()).toISOString().split('T')[0];
    a.download = `Radar_Saham_Syariah_${dateLabel}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(downloadUrl);

    showToast(`✅ File Excel (${a.download}) berhasil diunduh!`);
  } catch (err) {
    console.error("Excel download error:", err);
    showToast(`⚠️ Gagal mengunduh Excel: ${err.message}`);
  } finally {
    if (exportBtn) {
      exportBtn.disabled = false;
      exportBtn.innerHTML = originalHtml;
    }
  }
}

// -------------------------------------------------------------
// FETCH SCREENER DATA
// -------------------------------------------------------------
async function fetchResults(forceRefresh = false) {
  const refreshBtn = document.getElementById('refreshBtn');
  const refreshIcon = document.getElementById('refreshIcon');
  const stockList = document.getElementById('stockList');

  if (forceRefresh && selectedHistoryDate) {
    selectedHistoryDate = '';
    const dateSelect = document.getElementById('historyDateSelect');
    if (dateSelect) dateSelect.value = '';
    const badge = document.getElementById('historicalBadge');
    if (badge) badge.classList.add('hidden');
    const exportBtn = document.getElementById('exportExcelBtn');
    if (exportBtn) {
      exportBtn.innerHTML = `<i class="fa-solid fa-file-excel text-emerald-200"></i><span>Export Excel (.xlsx)</span>`;
    }
  }

  if (refreshIcon) refreshIcon.classList.add('fa-spin');
  if (refreshBtn) refreshBtn.disabled = true;
  const mRefreshIcon = document.getElementById('mobileRefreshIcon');
  const mRefreshBtn = document.getElementById('mobileRefreshBtn');
  if (mRefreshIcon) mRefreshIcon.classList.add('fa-spin');
  if (mRefreshBtn) mRefreshBtn.disabled = true;

  try {
    const url = `/api/screener/results?min_score=50${forceRefresh ? '&force_refresh=true' : ''}`;
    const res = await authFetch(url);
    if (!res.ok) throw new Error("Gagal mengambil data dari server");

    const data = await res.json();
    currentCandidates = data.candidates || [];
    allTrackedStocks = data.all_stocks || [];

    // Update Summary Stats
    document.getElementById('statScanned').innerText = data.summary.total_scanned || 0;
    document.getElementById('statCandidates').innerText = data.summary.total_candidates || 0;
    document.getElementById('statLowRisk').innerText = data.summary.risk_counts.LOW_RISK || 0;

    const accumCount = currentCandidates.filter(c => c.bandarmologi && (c.bandarmologi.status === 'BIG_ACCUMULATION' || c.bandarmologi.status === 'ACCUMULATION')).length;
    document.getElementById('statAccumulation').innerText = accumCount;

    const foreignCount = currentCandidates.filter(c => c.foreign_flow && c.foreign_flow.is_accum).length;
    const foreignEl = document.getElementById('foreignFlowCount');
    if (foreignEl) foreignEl.innerText = foreignCount;

    // Update Market Health Traffic Light Barometer
    if (data.market_health) {
      renderMarketHealth(data.market_health);
    }

    updateWatchlistCounter();
    updateJournalBadges();
    populateCalculatorDropdown();
    populateBroksumStockDropdown();
    renderCandidates();
    if (currentMainView === 'heatmap') {
      renderSectorHeatmap();
    } else if (currentMainView === 'broksum') {
      loadBrokerSummary(currentBroksumStock, currentBroksumPeriod);
      loadCandidatesBroksumQuickView(currentBroksumPeriod);
    }
    checkScheduledMarketAlert();
    loadHistoryDates(); // refresh archive dates list with new snapshot
  } catch (err) {
    console.error("Error fetching results:", err);
    stockList.innerHTML = `
      <div class="text-center py-8 text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-4">
        <i class="fa-solid fa-triangle-exclamation text-2xl mb-2"></i>
        <p class="font-semibold text-sm">Gagal memuat hasil screening</p>
        <p class="text-xs text-gray-400 mt-1">${err.message}</p>
        <button onclick="fetchResults()" class="mt-3 px-3 py-1 bg-gray-800 text-xs rounded hover:bg-gray-700 text-white">Coba Lagi</button>
      </div>
    `;
  } finally {
    if (refreshIcon) refreshIcon.classList.remove('fa-spin');
    if (refreshBtn) refreshBtn.disabled = false;
    if (mRefreshIcon) mRefreshIcon.classList.remove('fa-spin');
    if (mRefreshBtn) mRefreshBtn.disabled = false;
  }
}

function setFilter(filterType) {
  currentFilter = filterType;
  document.querySelectorAll('.filter-pill').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById(`filter-${filterType}`);
  if (activeBtn) {
    activeBtn.classList.add('active');
    activeBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }

  if (filterType === 'WATCHLIST') {
    updateMobileNavActive('Watchlist');
  } else {
    updateMobileNavActive('Radar');
  }

  renderCandidates();
}

// Helper: Emiten Avatar Gradient based on sector
function getStockAvatarStyle(code, sector) {
  const s = (sector || '').toLowerCase();
  if (s.includes('energy') || s.includes('energi')) {
    return 'bg-gradient-to-br from-amber-500 to-amber-700 text-amber-100 shadow-amber-900/30';
  } else if (s.includes('basic') || s.includes('bahan')) {
    return 'bg-gradient-to-br from-cyan-600 to-teal-800 text-cyan-100 shadow-teal-900/30';
  } else if (s.includes('consumer non') || s.includes('primer')) {
    return 'bg-gradient-to-br from-emerald-600 to-green-800 text-emerald-100 shadow-emerald-900/30';
  } else if (s.includes('consumer') || s.includes('siklikal')) {
    return 'bg-gradient-to-br from-blue-600 to-indigo-800 text-blue-100 shadow-blue-900/30';
  } else if (s.includes('health') || s.includes('kesehatan')) {
    return 'bg-gradient-to-br from-rose-500 to-pink-700 text-rose-100 shadow-rose-900/30';
  } else if (s.includes('financial') || s.includes('keuangan')) {
    return 'bg-gradient-to-br from-blue-700 to-sky-900 text-blue-100 shadow-sky-900/30';
  } else if (s.includes('property') || s.includes('properti')) {
    return 'bg-gradient-to-br from-purple-600 to-fuchsia-800 text-purple-100 shadow-purple-900/30';
  } else if (s.includes('tech') || s.includes('teknologi')) {
    return 'bg-gradient-to-br from-violet-600 to-indigo-900 text-violet-100 shadow-violet-900/30';
  } else if (s.includes('infra') || s.includes('infrastruktur')) {
    return 'bg-gradient-to-br from-teal-600 to-cyan-800 text-teal-100 shadow-cyan-900/30';
  } else if (s.includes('transport') || s.includes('logistik')) {
    return 'bg-gradient-to-br from-orange-500 to-amber-700 text-orange-100 shadow-orange-900/30';
  }
  return 'bg-gradient-to-br from-emerald-700 to-teal-900 text-emerald-100 shadow-emerald-900/30';
}

function renderCandidates() {
  const container = document.getElementById('stockList');
  let list = currentCandidates;

  // 1. Filter by category
  if (currentFilter === 'WATCHLIST') {
    list = list.filter(c => watchlist.includes(c.code));
  } else if (currentFilter === 'LOW_RISK') {
    list = list.filter(c => c.risk_level === 'LOW_RISK');
  } else if (currentFilter === 'FOREIGN_FLOW') {
    list = list.filter(c => c.foreign_flow && c.foreign_flow.is_accum);
  } else if (currentFilter === 'BIG_ACCUMULATION') {
    list = list.filter(c => c.bandarmologi && (c.bandarmologi.status === 'BIG_ACCUMULATION' || c.bandarmologi.status === 'ACCUMULATION'));
  } else if (currentFilter === 'JII') {
    list = list.filter(c => c.indices && c.indices.includes('JII'));
  } else if (currentFilter === 'TIGHT_SL') {
    list = list.filter(c => c.trading_plan && c.trading_plan.risk_pct <= 4.0);
  } else if (currentFilter !== 'ALL') {
    list = list.filter(c => c.setup_type === currentFilter);
  }

  // 2. Filter by Search Keyword (with autofill sanitization)
  const searchEl = document.getElementById('searchInput');
  if (searchEl) {
    const v = searchEl.value.trim().toLowerCase();
    const u = (localStorage.getItem('syariah_radar_user') || 'galunk').toLowerCase();
    if (v === u || v === 'galunk') {
      searchEl.value = '';
      searchKeyword = '';
      const clearBtn = document.getElementById('clearSearchBtn');
      if (clearBtn) clearBtn.classList.add('hidden');
    }
  }

  if (searchKeyword.length > 0) {
    list = list.filter(c => 
      c.code.toLowerCase().includes(searchKeyword) ||
      (c.name && c.name.toLowerCase().includes(searchKeyword)) ||
      (c.sector && c.sector.toLowerCase().includes(searchKeyword))
    );
  }

  if (list.length === 0) {
    if (currentFilter === 'WATCHLIST' && searchKeyword.length === 0) {
      const nonCandWatchlist = allTrackedStocks.filter(s => watchlist.includes(s.code) && !currentCandidates.some(c => c.code === s.code));
      if (nonCandWatchlist.length === 0) {
        container.innerHTML = `
          <div class="text-center py-12 bg-[#161b22] border border-gray-800 rounded-2xl p-6 text-gray-400">
            <i class="fa-regular fa-star text-4xl mb-3 text-amber-400"></i>
            <h3 class="text-base font-bold text-gray-200">Watchlist Anda Masih Kosong</h3>
            <p class="text-xs md:text-sm text-gray-400 mt-1 max-w-sm mx-auto">Klik ikon bintang (⭐) pada kartu saham mana pun untuk menyimpannya ke daftar pantauan pribadi Anda.</p>
          </div>
        `;
        return;
      }
    }

    let matchingTracked = [];
    if (searchKeyword.length > 0) {
      matchingTracked = allTrackedStocks.filter(s =>
        s.code.toLowerCase().includes(searchKeyword) ||
        (s.name && s.name.toLowerCase().includes(searchKeyword)) ||
        (s.sector && s.sector.toLowerCase().includes(searchKeyword))
      );
    } else if (currentFilter === 'WATCHLIST') {
      matchingTracked = allTrackedStocks.filter(s => watchlist.includes(s.code) && !currentCandidates.some(c => c.code === s.code));
    }

    if (matchingTracked.length > 0) {
      let diagHtml = `
        <div class="space-y-3.5">
          <div class="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-xs md:text-sm text-amber-200">
            <div class="flex items-start gap-3">
              <i class="fa-solid fa-shield-halved text-amber-400 text-xl mt-0.5 shrink-0"></i>
              <div>
                <h4 class="font-bold text-amber-300 text-sm md:text-base">Saham Terdaftar di Radar, Namun Belum Lolos Sinyal Beli Hari Ini</h4>
                <p class="text-gray-300 mt-1 leading-relaxed">Sistem menyaring saham ini demi keamanan modal Anda agar terhindar dari risiko beli di fase turun tajam (*falling knife*) atau downtrend.</p>
              </div>
            </div>
          </div>
      `;

      matchingTracked.forEach(s => {
        const isUp = s.change_pct >= 0;
        const changeColor = isUp ? 'text-emerald-400' : 'text-red-400';
        const changeSign = isUp ? '+' : '';

        diagHtml += `
          <div class="bg-[#161b22] border border-gray-800 rounded-2xl p-4 md:p-5 shadow-sm space-y-3.5">
            <div class="flex items-start justify-between gap-3">
              <div class="space-y-1.5 min-w-0 flex-1">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-xl md:text-2xl font-black text-white tracking-wide">${s.code}</span>
                  <span class="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-bold">
                    ⚠️ Belum Lolos Sinyal Beli
                  </span>
                  <span class="text-xs text-gray-400 px-2 py-0.5 rounded-md bg-gray-800">${s.sector}</span>
                </div>
                <p class="text-xs md:text-sm text-gray-300 font-medium truncate">${s.name}</p>
              </div>

              <div class="flex items-center gap-2 shrink-0">
                <button onclick="toggleWatchlist('${s.code}', event)" class="w-9 h-9 rounded-xl bg-gray-800/80 hover:bg-gray-700 text-amber-400 flex items-center justify-center transition border border-gray-700/60 shadow-sm" title="${isWatchlisted(s.code) ? 'Hapus dari Watchlist' : 'Tambah ke Watchlist'}">
                  <i class="${isWatchlisted(s.code) ? 'fa-solid fa-star text-amber-400' : 'fa-regular fa-star text-gray-400'} text-xs"></i>
                </button>
                <div class="text-right pl-1">
                  <span class="text-xl md:text-2xl font-black text-white font-mono block leading-tight">${formatIDR(s.price)}</span>
                  <span class="inline-block mt-0.5 px-2 py-0.5 rounded-lg text-xs md:text-sm font-bold ${changeColor}">${changeSign}${s.change_pct}%</span>
                </div>
              </div>
            </div>

            <!-- DIAGNOSTIC REASONS BOX -->
            <div class="bg-[#0e1117] p-3.5 rounded-2xl border border-gray-800 space-y-2 text-xs md:text-sm">
              <span class="font-bold text-gray-300 block flex items-center gap-2">
                <i class="fa-solid fa-clipboard-check text-amber-400"></i>
                Diagnosa Sistem Radar Hari Ini:
              </span>
              <ul class="space-y-1.5 text-gray-300 pl-1 text-xs md:text-sm">
                ${(s.rejection_reasons || []).map(r => `<li class="flex items-start gap-2"><span class="text-amber-400 mt-0.5 font-bold">•</span><span>${r}</span></li>`).join('')}
              </ul>
              <div class="pt-2 border-t border-gray-800/80 text-xs md:text-sm text-emerald-400 font-medium">
                💡 Saran Swing: ${s.safety_advice || 'Wait & See. Tunggu konfirmasi pantulan support (candle hijau/hammer) sebelum entry.'}
              </div>
            </div>

            <!-- ACTION BUTTONS -->
            <div class="flex items-center justify-between pt-1 text-xs md:text-sm">
              <span class="text-xs text-gray-400 font-mono">Turnover: ${s.turnover_str} • RSI: ${s.rsi || '-'}</span>
              <div class="flex items-center gap-2">
                <button onclick='openModal(${JSON.stringify(s).replace(/'/g, "&apos;")})' class="px-3.5 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-xs md:text-sm font-semibold border border-gray-700 transition flex items-center gap-2 shadow-sm">
                  <i class="fa-solid fa-chart-line text-emerald-400"></i>
                  <span>Lihat Chart</span>
                </button>
                <button onclick='openStandaloneCalcModal("${s.code}")' class="px-3.5 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 rounded-xl text-xs md:text-sm font-bold border border-emerald-500/30 transition flex items-center gap-2 shadow-sm">
                  <i class="fa-solid fa-calculator text-emerald-400"></i>
                  <span>Kalkulator</span>
                </button>
              </div>
            </div>
          </div>
        `;
      });

      diagHtml += '</div>';
      container.innerHTML = diagHtml;
      return;
    }

    // Truly not in database
    container.innerHTML = `
      <div class="text-center py-12 bg-[#161b22] border border-gray-800 rounded-2xl p-6 text-gray-400">
        <i class="fa-solid fa-magnifying-glass text-3xl mb-3 text-emerald-500/60"></i>
        <h3 class="text-base font-bold text-gray-200">Tidak ada saham yang cocok</h3>
        <p class="text-xs md:text-sm text-gray-400 mt-1">${searchKeyword ? `Saham "${searchKeyword.toUpperCase()}" belum terdaftar dalam 75 saham radar syariah.` : 'Coba pilih tab filter lain di atas atau lakukan scan ulang.'}</p>
        ${searchKeyword ? `
          <div class="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button onclick="clearSearch()" class="px-3.5 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs md:text-sm font-medium rounded-xl transition">Hapus Pencarian</button>
            <button onclick="openAddStockModal('${searchKeyword.toUpperCase()}')" class="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs md:text-sm font-bold rounded-xl transition flex items-center gap-2 shadow">
              <i class="fa-solid fa-plus"></i>
              <span>Tambah ${searchKeyword.toUpperCase()} ke Radar</span>
            </button>
          </div>
        ` : ''}
      </div>
    `;
    return;
  }

  let html = '';
  list.forEach(c => {
    const isUp = c.change_pct >= 0;
    const changeColor = isUp ? 'text-emerald-400' : 'text-red-400';
    const changeSign = isUp ? '+' : '';

    // Setup Badge
    let setupBadge = '';
    if (c.setup_type === 'STAGE2_BREAKOUT') {
      setupBadge = '<span class="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[11px] md:text-xs font-semibold">🚀 Breakout</span>';
    } else if (c.setup_type === 'UPTREND_PULLBACK') {
      setupBadge = '<span class="px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[11px] md:text-xs font-semibold">📈 Pullback</span>';
    } else if (c.setup_type === 'RS_LEADER') {
      setupBadge = '<span class="px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-400 border border-purple-500/30 text-[11px] md:text-xs font-semibold">👑 Leader >MA200</span>';
    } else {
      setupBadge = '<span class="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[11px] md:text-xs font-semibold">⚡ Rebound</span>';
    }

    // Risk Badge
    let riskBadge = '';
    if (c.risk_level === 'LOW_RISK') {
      riskBadge = '<span class="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[11px] md:text-xs font-bold">🛡️ Grade A+</span>';
    } else if (c.risk_level === 'MEDIUM_RISK') {
      riskBadge = '<span class="px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[11px] md:text-xs font-medium">⚖️ Moderat</span>';
    } else {
      riskBadge = '<span class="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] md:text-xs font-medium">⚠️ Spekulatif</span>';
    }

    // Bandarmologi Badge
    const bandar = c.bandarmologi || {};
    let bandarChip = '';
    if (bandar.status === 'BIG_ACCUMULATION') {
      bandarChip = '<span class="px-2 py-0.5 rounded-md bg-emerald-950/70 text-emerald-400 border border-emerald-700/60 text-[11px] md:text-xs font-semibold">💰 Akumulasi Jumbo</span>';
    } else if (bandar.status === 'ACCUMULATION') {
      bandarChip = '<span class="px-2 py-0.5 rounded-md bg-blue-950/70 text-blue-400 border border-blue-700/60 text-[11px] md:text-xs font-semibold">🕵️ Akumulasi</span>';
    }

    // Foreign Flow Badge
    const ff = c.foreign_flow || {};
    let foreignChip = '';
    if (ff.is_accum) {
      const brokerText = ff.foreign_brokers_str ? ` (${ff.foreign_brokers_str})` : '';
      foreignChip = `<span class="px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-300 border border-rose-500/30 text-[11px] md:text-xs font-semibold flex items-center gap-1 shrink-0" title="Top Net Buyer didominasi broker Asing (7 Hari)"><i class="fa-solid fa-landmark text-rose-400"></i><span>Asing${brokerText}</span></span>`;
    }

    // Fundamental Highlights
    const fund = c.fundamental || {};
    let fundText = '';
    if (fund.roe) fundText += `ROE: ${fund.roe}% • `;
    if (fund.pbv) fundText += `PBV: ${fund.pbv}x • `;
    if (fund.der !== null && fund.der !== undefined) fundText += `DER: ${fund.der}%`;
    if (!fundText) fundText = fund.cap_category || 'Saham Syariah';

    const maBadge = c.ma_aligned 
      ? '<span class="text-[11px] md:text-xs px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 font-mono border border-emerald-500/20">MA50>100>200</span>' 
      : (c.is_above_ma200 ? '<span class="text-[11px] md:text-xs px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-300 font-mono border border-blue-500/20">>MA200</span>' : '');

    // Trading Plan Strip (Stockbit Style)
    const plan = c.trading_plan || {};
    const entryFormatted = plan.entry ? formatIDR(plan.entry) : formatIDR(c.price);
    const slFormatted = plan.stop_loss ? formatIDR(plan.stop_loss) : '-';
    const tp1Formatted = plan.tp1 ? formatIDR(plan.tp1) : '-';
    const riskPctStr = plan.risk_pct ? `(-${plan.risk_pct}%)` : '';
    const tp1PctStr = plan.tp1_pct ? `(+${plan.tp1_pct}%)` : '';

    html += `
      <div class="stock-card bg-[#161b22] border border-gray-800 hover:border-emerald-500/40 rounded-2xl p-4 md:p-5 shadow-sm space-y-3.5 cursor-pointer" onclick='openModal(${JSON.stringify(c).replace(/'/g, "&apos;")})'>
        
        <!-- HEADER ROW: TICKER, BADGES, PRICE & QUICK ACTIONS -->
        <div class="flex items-start justify-between gap-3">
          <div class="space-y-1.5 min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-xl md:text-2xl font-black text-white tracking-wide">${c.code}</span>
              <span class="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[11px] md:text-xs font-bold">ISSI</span>
              ${riskBadge}
              ${setupBadge}
              ${bandarChip}
              ${foreignChip}
              ${maBadge}
            </div>
            <p class="text-xs md:text-sm text-gray-300 font-medium truncate">${c.name} <span class="text-gray-500">• ${c.sector}</span></p>
          </div>

          <div class="flex items-center gap-1.5 shrink-0">
            <button onclick="event.stopPropagation(); shareStockSignal('${c.code}')" class="w-9 h-9 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/25 text-emerald-400 flex items-center justify-center transition border border-emerald-500/30 shadow-sm" title="Share Sinyal ke WhatsApp">
              <i class="fa-brands fa-whatsapp text-sm"></i>
            </button>
            <button onclick="event.stopPropagation(); quickAddStockToJournal('${c.code}')" class="w-9 h-9 rounded-xl bg-gray-800/80 hover:bg-emerald-500/20 text-gray-400 hover:text-emerald-400 flex items-center justify-center transition border border-gray-700/60 shadow-sm" title="Catat ke Jurnal Trading (Simulasi Beli)">
              <i class="fa-solid fa-book-bookmark text-xs"></i>
            </button>
            <button onclick="toggleWatchlist('${c.code}', event)" class="w-9 h-9 rounded-xl bg-gray-800/80 hover:bg-gray-700 text-amber-400 flex items-center justify-center transition border border-gray-700/60 shadow-sm" title="${isWatchlisted(c.code) ? 'Hapus dari Watchlist' : 'Tambah ke Watchlist'}">
              <i class="${isWatchlisted(c.code) ? 'fa-solid fa-star text-amber-400' : 'fa-regular fa-star text-gray-400'} text-xs"></i>
            </button>
            <div class="text-right pl-1">
              <span class="text-xl md:text-2xl font-black text-white font-mono block leading-tight">${formatIDR(c.price)}</span>
              <span class="inline-block mt-0.5 px-2 py-0.5 rounded-lg text-xs md:text-sm font-bold ${isUp ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/15 text-red-400 border border-red-500/30'}">
                ${changeSign}${c.change_pct}%
              </span>
            </div>
          </div>
        </div>

        <!-- 3-PILLAR SCORE ROW (STOCKBIT CAPSULES) -->
        <div class="grid grid-cols-4 gap-2 bg-[#0e1117] p-2.5 md:p-3 rounded-2xl border border-gray-800/80 text-center">
          <div class="space-y-0.5">
            <span class="text-gray-400 text-xs block font-medium">Skor Total</span>
            <span class="text-sm md:text-base font-extrabold text-emerald-400">${c.score}/100</span>
          </div>
          <div class="space-y-0.5">
            <span class="text-gray-400 text-xs block font-medium">Bandar</span>
            <span class="text-sm md:text-base font-bold ${c.bandar_score >= 65 ? 'text-blue-400' : 'text-gray-300'}">${c.bandar_score}/100</span>
          </div>
          <div class="space-y-0.5">
            <span class="text-gray-400 text-xs block font-medium">Fundamental</span>
            <span class="text-sm md:text-base font-bold ${c.fund_score >= 65 ? 'text-purple-400' : 'text-gray-300'}">${c.fund_score}/100</span>
          </div>
          <div class="space-y-0.5">
            <span class="text-gray-400 text-xs block font-medium">Vol Spike</span>
            <span class="text-sm md:text-base font-bold text-emerald-400">${c.vol_ratio}x</span>
          </div>
        </div>

        <!-- TRADING PLAN PREVIEW (STOCKBIT STYLE) -->
        <div class="bg-[#0e1117] px-3.5 py-2.5 rounded-2xl border border-gray-800/80 flex items-center justify-between text-xs md:text-sm font-mono flex-wrap gap-2">
          <div class="flex items-center gap-1.5">
            <span class="text-gray-400 text-xs font-sans font-medium">Area Beli:</span>
            <span class="text-white font-bold text-xs md:text-sm">${entryFormatted}</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-red-400 text-xs font-sans font-medium">Stop Loss:</span>
            <span class="text-red-400 font-bold text-xs md:text-sm">${slFormatted} <span class="text-[11px] font-sans opacity-90">${riskPctStr}</span></span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-emerald-400 text-xs font-sans font-medium">Target TP1:</span>
            <span class="text-emerald-400 font-bold text-xs md:text-sm">${tp1Formatted} <span class="text-[11px] font-sans opacity-90">${tp1PctStr}</span></span>
          </div>
        </div>

        <!-- FOOTER: METRIC & DETAIL CTA -->
        <div class="flex items-center justify-between pt-0.5 text-xs md:text-sm">
          <div class="text-xs md:text-sm text-gray-300 truncate max-w-[65%] font-medium">
            <span>${fundText}</span>
          </div>
          <span class="text-xs md:text-sm font-bold text-emerald-400 flex items-center gap-1.5 hover:underline shrink-0">
            <span>Chart & Lot</span>
            <i class="fa-solid fa-chevron-right text-[10px]"></i>
          </span>
        </div>

      </div>
    `;
  });

  container.innerHTML = html;
}

// -------------------------------------------------------------
// STANDALONE LOT SIZING CALCULATOR
// -------------------------------------------------------------
function populateCalculatorDropdown() {
  const selects = [
    document.getElementById('calcStockSelector'),
    document.getElementById('pyramidStockSelector')
  ].filter(Boolean);

  if (selects.length === 0) return;

  let options = '<option value="">-- Pilih Saham atau Ketik Manual di Bawah --</option>';
  if (currentCandidates.length > 0) {
    options += '<optgroup label="⭐ Sinyal Lolos Hari Ini">';
    currentCandidates.forEach(c => {
      options += `<option value="${c.code}">${c.code} - ${c.name} (Entry: Rp ${c.price.toLocaleString('id-ID')})</option>`;
    });
    options += '</optgroup>';
  }
  const nonPassed = allTrackedStocks.filter(s => !currentCandidates.some(c => c.code === s.code));
  if (nonPassed.length > 0) {
    options += '<optgroup label="📋 Saham Pantauan Lainnya di Radar">';
    nonPassed.forEach(s => {
      options += `<option value="${s.code}">${s.code} - ${s.name} (Harga: Rp ${s.price.toLocaleString('id-ID')})</option>`;
    });
    options += '</optgroup>';
  }

  selects.forEach(sel => {
    const prevVal = sel.value;
    sel.innerHTML = options;
    if (prevVal) sel.value = prevVal;
  });
}

function openStandaloneCalcModal(preselectedCode = null) {
  const modal = document.getElementById('standaloneCalcModal');
  if (!modal) return;
  modal.classList.remove('hidden');

  // Load capital setting from localStorage
  const savedCap = localStorage.getItem('user_trading_capital');
  if (savedCap) {
    document.getElementById('scCapital').value = savedCap;
  }

  populateCalculatorDropdown();

  if (preselectedCode) {
    document.getElementById('calcStockSelector').value = preselectedCode;
    handleStockSelection(preselectedCode);
    const pyrSel = document.getElementById('pyramidStockSelector');
    if (pyrSel) {
      pyrSel.value = preselectedCode;
      handlePyramidStockSelection(preselectedCode);
    }
  } else if (!document.getElementById('scEntry').value && currentCandidates.length > 0) {
    // Default to first candidate if empty
    const first = currentCandidates[0];
    document.getElementById('calcStockSelector').value = first.code;
    handleStockSelection(first.code);
    const pyrSel = document.getElementById('pyramidStockSelector');
    if (pyrSel) {
      pyrSel.value = first.code;
      handlePyramidStockSelection(first.code);
    }
  } else {
    runStandaloneCalc();
    runPyramidCalc();
  }
}

function closeStandaloneCalcModal() {
  const modal = document.getElementById('standaloneCalcModal');
  if (modal) modal.classList.add('hidden');
}

function switchCalcTab(mode) {
  const singleBtn = document.getElementById('tabCalcSingleBtn');
  const pyramidBtn = document.getElementById('tabCalcPyramidBtn');
  const singleContainer = document.getElementById('calcSingleContainer');
  const pyramidContainer = document.getElementById('calcPyramidContainer');

  if (!singleBtn || !pyramidBtn || !singleContainer || !pyramidContainer) return;

  if (mode === 'pyramid') {
    singleBtn.className = 'py-2.5 px-3 font-semibold border-b-2 border-transparent text-gray-400 hover:text-gray-200 flex items-center gap-1.5 transition';
    pyramidBtn.className = 'py-2.5 px-3 font-bold border-b-2 border-blue-500 text-blue-400 flex items-center gap-1.5 transition';
    singleContainer.classList.add('hidden');
    pyramidContainer.classList.remove('hidden');

    populateCalculatorDropdown();
    const currCode = document.getElementById('calcStockSelector').value;
    const pyrSel = document.getElementById('pyramidStockSelector');
    if (currCode && pyrSel && !pyrSel.value) {
      pyrSel.value = currCode;
      handlePyramidStockSelection(currCode);
    } else {
      runPyramidCalc();
    }
  } else {
    singleBtn.className = 'py-2.5 px-3 font-bold border-b-2 border-emerald-500 text-emerald-400 flex items-center gap-1.5 transition';
    pyramidBtn.className = 'py-2.5 px-3 font-semibold border-b-2 border-transparent text-gray-400 hover:text-gray-200 flex items-center gap-1.5 transition';
    pyramidContainer.classList.add('hidden');
    singleContainer.classList.remove('hidden');
    runStandaloneCalc();
  }
}

function handleStockSelection(code) {
  if (!code) return;
  const stock = currentCandidates.find(c => c.code === code) || allTrackedStocks.find(s => s.code === code);
  if (!stock) return;

  const plan = stock.trading_plan || {
    entry: stock.price,
    stop_loss: roundToIDXTick(stock.price * 0.95),
    tp1: roundToIDXTick(stock.price * 1.06)
  };

  document.getElementById('scEntry').value = plan.entry;
  document.getElementById('scStopLoss').value = plan.stop_loss;
  runStandaloneCalc();

  // Also sync to pyramid tab if not set
  const pyrSel = document.getElementById('pyramidStockSelector');
  if (pyrSel && !pyrSel.value) {
    pyrSel.value = code;
    handlePyramidStockSelection(code);
  }
}

function setStandaloneRisk(pct) {
  document.getElementById('scRiskPct').value = pct;
  document.querySelectorAll('.sc-risk-btn').forEach(btn => {
    btn.className = 'sc-risk-btn flex-1 py-2 bg-gray-800 text-[10px] rounded border border-gray-700 text-gray-300';
    if (btn.innerText.includes(`${pct}%`)) {
      btn.className = 'sc-risk-btn flex-1 py-2 bg-emerald-500/20 text-emerald-400 font-bold text-[10px] rounded border border-emerald-500';
    }
  });
  runStandaloneCalc();
}

function runStandaloneCalc() {
  const entry = parseFloat(document.getElementById('scEntry').value);
  const stopLoss = parseFloat(document.getElementById('scStopLoss').value);
  const capital = parseFloat(document.getElementById('scCapital').value) || 50000000;
  const riskPct = parseFloat(document.getElementById('scRiskPct').value) || 2.0;

  // Save capital
  localStorage.setItem('user_trading_capital', capital);

  const adviceEl = document.getElementById('scAdvice');

  if (!entry || !stopLoss) {
    document.getElementById('scResultLots').innerText = '0 Lot';
    document.getElementById('scResultShares').innerText = '(0 Lembar)';
    document.getElementById('scResultAlloc').innerText = 'Rp 0';
    document.getElementById('scResultAllocPct').innerText = '(0% Portofolio)';
    document.getElementById('scResultMaxRisk').innerText = 'Rp 0';
    document.getElementById('scResultProfitTP1').innerText = '+Rp 0';
    document.getElementById('scResultProfitTP2').innerText = '+Rp 0';
    if (adviceEl) adviceEl.innerText = 'Silakan masukkan harga Entry dan Stop Loss.';
    return;
  }

  if (entry <= stopLoss) {
    if (adviceEl) adviceEl.innerText = '⚠️ Peringatan: Harga Stop Loss harus lebih rendah dari harga Entry!';
    return;
  }

  const maxLossIdr = capital * (riskPct / 100);
  const riskPerShare = entry - stopLoss;

  let totalShares = Math.floor(maxLossIdr / riskPerShare);
  let totalLots = Math.floor(totalShares / 100);

  if (totalLots < 1) {
    totalLots = 1;
    totalShares = 100;
  } else {
    totalShares = totalLots * 100;
  }

  const capitalAllocated = totalShares * entry;
  const allocPct = ((capitalAllocated / capital) * 100).toFixed(1);
  const actualMaxLoss = totalShares * riskPerShare;

  const targetTP1 = entry + (1.5 * riskPerShare);
  const targetTP2 = entry + (2.5 * riskPerShare);
  const profitTP1 = totalShares * (targetTP1 - entry);
  const profitTP2 = totalShares * (targetTP2 - entry);

  document.getElementById('scResultLots').innerText = `${totalLots.toLocaleString('id-ID')} Lot`;
  document.getElementById('scResultShares').innerText = `(${totalShares.toLocaleString('id-ID')} Lembar)`;
  document.getElementById('scResultAlloc').innerText = formatIDR(capitalAllocated);
  document.getElementById('scResultAllocPct').innerText = `(${allocPct}% Portofolio)`;
  document.getElementById('scResultMaxRisk').innerText = formatIDR(actualMaxLoss);
  document.getElementById('scResultProfitTP1').innerText = `+${formatIDR(profitTP1)} (+${((targetTP1-entry)/entry*100).toFixed(1)}%)`;
  document.getElementById('scResultProfitTP2').innerText = `+${formatIDR(profitTP2)} (+${((targetTP2-entry)/entry*100).toFixed(1)}%)`;

  if (adviceEl) adviceEl.innerText = `✅ Aman! Jika Stop Loss di ${formatIDR(stopLoss)} terkena, risiko Anda terkunci aman di ${formatIDR(actualMaxLoss)} (${riskPct}% modal).`;
}

// =============================================================
// PIRAMIDA 3-TAHAP (MULTI-TRANCHE AVERAGING SWING) ENGINE
// =============================================================
function setPyramidBudget(amount) {
  const input = document.getElementById('pyrTotalBudget');
  if (input) {
    input.value = amount;
    runPyramidCalc();
  }
}

function handlePyramidStockSelection(code) {
  if (!code) return;
  const stock = currentCandidates.find(c => c.code === code) || allTrackedStocks.find(s => s.code === code);
  if (!stock) return;

  const plan = stock.trading_plan || {
    entry: stock.price,
    stop_loss: roundToIDXTick(stock.price * 0.95),
    tp1: roundToIDXTick(stock.price * 1.06)
  };

  const p1 = roundToIDXTick(plan.entry || stock.price);
  const sl = roundToIDXTick(plan.stop_loss || Math.round(p1 * 0.95));
  
  // Smart tranche levels:
  // Tahap 2: confirm support / test (+2%)
  const p2 = roundToIDXTick(p1 * 1.02);
  // Tahap 3: breakout resisten / TP1 (+5% - 6%)
  const p3 = roundToIDXTick(plan.tp1 || p1 * 1.06);

  document.getElementById('pyrPrice1').value = p1;
  document.getElementById('pyrPrice2').value = p2;
  document.getElementById('pyrPrice3').value = p3;
  document.getElementById('pyrInitialSL').value = sl;

  runPyramidCalc();
}

function runPyramidCalc() {
  const budget = parseFloat(document.getElementById('pyrTotalBudget')?.value) || 20000000;
  const p1 = parseFloat(document.getElementById('pyrPrice1')?.value) || 0;
  const p2 = parseFloat(document.getElementById('pyrPrice2')?.value) || 0;
  const p3 = parseFloat(document.getElementById('pyrPrice3')?.value) || 0;
  const sl1 = parseFloat(document.getElementById('pyrInitialSL')?.value) || 0;

  const budgetDisplay = document.getElementById('pyrBudgetDisplay');
  if (budgetDisplay) budgetDisplay.innerText = formatIDR(budget);

  // Update budget quick buttons active style
  document.querySelectorAll('.pyr-budget-btn').forEach(btn => {
    const valStr = btn.innerText.replace(/[^0-9]/g, '');
    const num = parseInt(valStr) * 1000000;
    if (num === budget) {
      btn.className = 'pyr-budget-btn px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/40 font-bold text-[10px]';
    } else {
      btn.className = 'pyr-budget-btn px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-[10px] text-gray-300 border border-gray-700';
    }
  });

  // Tahap 1: 30% Modal
  const b1 = budget * 0.30;
  let lots1 = p1 > 0 ? Math.floor(b1 / (p1 * 100)) : 0;
  if (p1 > 0 && lots1 < 1 && b1 >= p1 * 100) lots1 = 1;
  const shares1 = lots1 * 100;
  const val1 = shares1 * p1;
  const risk1 = (sl1 > 0 && p1 > sl1) ? (p1 - sl1) * shares1 : 0;
  const riskPct1 = budget > 0 ? (risk1 / budget * 100).toFixed(1) : '0.0';

  const t1LotsEl = document.getElementById('pyrT1Lots');
  const t1ValEl = document.getElementById('pyrT1Val');
  const t1RiskEl = document.getElementById('pyrT1Risk');
  const t1RiskPctEl = document.getElementById('pyrT1RiskPct');

  if (t1LotsEl) t1LotsEl.innerText = `${lots1.toLocaleString('id-ID')} Lot (${shares1.toLocaleString('id-ID')} Lbr)`;
  if (t1ValEl) t1ValEl.innerText = formatIDR(val1);
  if (t1RiskEl) t1RiskEl.innerText = risk1 > 0 ? `-${formatIDR(risk1)}` : 'Rp 0';
  if (t1RiskPctEl) t1RiskPctEl.innerText = `(-${riskPct1}% Budget)`;

  // Tahap 2: 40% Modal
  const b2 = budget * 0.40;
  let lots2 = p2 > 0 ? Math.floor(b2 / (p2 * 100)) : 0;
  if (p2 > 0 && lots2 < 1 && b2 >= p2 * 100) lots2 = 1;
  const shares2 = lots2 * 100;
  const val2 = shares2 * p2;

  const totShares12 = shares1 + shares2;
  const totVal12 = val1 + val2;
  const avg12 = totShares12 > 0 ? roundToIDXTick(totVal12 / totShares12) : 0;
  
  // Recommended SL Tahap 2:
  // If p2 >= p1, ratchet SL to near p1 (BEP tranche 1)
  // If p2 < p1, keep SL near sl1 or support low
  let recSL2 = 0;
  if (sl1 > 0 && p1 > 0) {
    recSL2 = (p2 >= p1) ? roundToIDXTick(Math.max(sl1, p1 * 0.99)) : roundToIDXTick(Math.min(sl1, p2 * 0.96));
  }

  const t2LotsEl = document.getElementById('pyrT2Lots');
  const t2ValEl = document.getElementById('pyrT2Val');
  const t2AvgEl = document.getElementById('pyrT2Avg');
  const t2NewSLEl = document.getElementById('pyrT2NewSL');

  if (t2LotsEl) t2LotsEl.innerText = `${lots2.toLocaleString('id-ID')} Lot (${shares2.toLocaleString('id-ID')} Lbr)`;
  if (t2ValEl) t2ValEl.innerText = formatIDR(val2);
  if (t2AvgEl) t2AvgEl.innerText = `Avg: Rp ${formatIDR(avg12)}`;
  if (t2NewSLEl) t2NewSLEl.innerText = recSL2 > 0 ? `SL Baru: Rp ${formatIDR(recSL2)}` : 'SL Baru: -';

  // Tahap 3: 30% Modal
  const b3 = budget * 0.30;
  let lots3 = p3 > 0 ? Math.floor(b3 / (p3 * 100)) : 0;
  if (p3 > 0 && lots3 < 1 && b3 >= p3 * 100) lots3 = 1;
  const shares3 = lots3 * 100;
  const val3 = shares3 * p3;

  const totShares123 = shares1 + shares2 + shares3;
  const totLots123 = lots1 + lots2 + lots3;
  const totVal123 = val1 + val2 + val3;
  const finalAvg = totShares123 > 0 ? roundToIDXTick(totVal123 / totShares123) : 0;

  // Recommended SL Tahap 3:
  // Ratchet to finalAvg (Zero Risk / BEP) or p2 (lock in profit)
  const recSL3 = finalAvg > 0 ? (p2 > finalAvg ? roundToIDXTick(p2) : finalAvg) : 0;

  const t3LotsEl = document.getElementById('pyrT3Lots');
  const t3ValEl = document.getElementById('pyrT3Val');
  const t3AvgEl = document.getElementById('pyrT3Avg');
  const t3NewSLEl = document.getElementById('pyrT3NewSL');

  if (t3LotsEl) t3LotsEl.innerText = `${lots3.toLocaleString('id-ID')} Lot (${shares3.toLocaleString('id-ID')} Lbr)`;
  if (t3ValEl) t3ValEl.innerText = formatIDR(val3);
  if (t3AvgEl) t3AvgEl.innerText = `Avg: Rp ${formatIDR(finalAvg)}`;
  if (t3NewSLEl) t3NewSLEl.innerText = recSL3 >= finalAvg && recSL3 > 0 ? `🔒 SL: Rp ${formatIDR(recSL3)} (BEP)` : '🔒 Risk-Free';

  // Summary Metrics
  const totLotsEl = document.getElementById('pyrTotalLots');
  const totSharesEl = document.getElementById('pyrTotalShares');
  const totCostEl = document.getElementById('pyrTotalCost');
  const costPctEl = document.getElementById('pyrCostPct');
  const finalAvgEl = document.getElementById('pyrFinalAvg');
  const avgDiffEl = document.getElementById('pyrAvgDiff');
  const benefitEl = document.getElementById('pyrBenefitText');
  const protSLEl = document.getElementById('pyrProtectedSL');
  const protStatusEl = document.getElementById('pyrProtectionStatus');

  if (totLotsEl) totLotsEl.innerText = `${totLots123.toLocaleString('id-ID')} Lot`;
  if (totSharesEl) totSharesEl.innerText = `(${totShares123.toLocaleString('id-ID')} Lembar)`;
  if (totCostEl) totCostEl.innerText = formatIDR(totVal123);
  const costPct = budget > 0 ? ((totVal123 / budget) * 100).toFixed(1) : '0';
  if (costPctEl) costPctEl.innerText = `(${costPct}% Budget)`;
  if (finalAvgEl) finalAvgEl.innerText = `Rp ${formatIDR(finalAvg)}`;

  // Comparison benefit
  if (p3 > finalAvg && totShares123 > 0) {
    const savedPerShare = p3 - finalAvg;
    const totalSaved = savedPerShare * totShares123;
    if (avgDiffEl) avgDiffEl.innerText = `Hemat Rp ${formatIDR(savedPerShare)}/lbr vs All-in Puncak`;
    if (benefitEl) {
      benefitEl.innerHTML = `
        🛡️ <b>Hasil Luar Biasa:</b> Dibandingkan beli <i>All-In</i> di harga breakout Tahap 3 (Rp ${formatIDR(p3)}), strategi Piramida menghemat modal <b>Rp ${formatIDR(totalSaved)}</b> dengan harga rata-rata modal hanya <b>Rp ${formatIDR(finalAvg)}</b>. Stop Loss digeser ke <b>Rp ${formatIDR(recSL3)}</b>, posisi Anda kini <span class="text-emerald-400 font-bold">100% BEBAS RISIKO (Risk-Free Trade)</span>!
      `;
    }
  } else {
    if (avgDiffEl) avgDiffEl.innerText = 'Optimal Terhitung';
    if (benefitEl) {
      benefitEl.innerHTML = `
        Jika harga koreksi setelah Tahap 1, Anda hanya rugi 30% modal pertama. Namun begitu tren saham terkonfirmasi naik dan Tahap 3 masuk, Stop Loss digeser ke harga Average (BEP), menjadikan posisi Anda 100% aman!
      `;
    }
  }

  if (protSLEl) protSLEl.innerText = recSL3 > 0 ? `Rp ${formatIDR(recSL3)}` : '-';
  if (protStatusEl) protStatusEl.innerText = recSL3 >= finalAvg && recSL3 > 0 ? '🔒 BEP / Bebas Rugi' : 'Disiplin Proteksi';
}

function copyPyramidPlan() {
  const code = document.getElementById('pyramidStockSelector')?.value || document.getElementById('calcStockSelector')?.value || 'SAHAM';
  const budget = parseFloat(document.getElementById('pyrTotalBudget')?.value) || 20000000;
  const p1 = parseFloat(document.getElementById('pyrPrice1')?.value) || 0;
  const p2 = parseFloat(document.getElementById('pyrPrice2')?.value) || 0;
  const p3 = parseFloat(document.getElementById('pyrPrice3')?.value) || 0;
  const sl1 = parseFloat(document.getElementById('pyrInitialSL')?.value) || 0;

  if (!p1) {
    showToast("⚠️ Masukkan harga Beli Tahap 1 terlebih dahulu.");
    return;
  }

  const t1Lots = document.getElementById('pyrT1Lots')?.innerText || '0 Lot';
  const t1Val = document.getElementById('pyrT1Val')?.innerText || 'Rp 0';
  const t2Lots = document.getElementById('pyrT2Lots')?.innerText || '0 Lot';
  const t2Val = document.getElementById('pyrT2Val')?.innerText || 'Rp 0';
  const t2SL = document.getElementById('pyrT2NewSL')?.innerText || '';
  const t3Lots = document.getElementById('pyrT3Lots')?.innerText || '0 Lot';
  const t3Val = document.getElementById('pyrT3Val')?.innerText || 'Rp 0';
  const t3SL = document.getElementById('pyrT3NewSL')?.innerText || '';

  const totLots = document.getElementById('pyrTotalLots')?.innerText || '0 Lot';
  const totShares = document.getElementById('pyrTotalShares')?.innerText || '(0 Lembar)';
  const totVal = document.getElementById('pyrTotalCost')?.innerText || 'Rp 0';
  const finalAvg = document.getElementById('pyrFinalAvg')?.innerText || 'Rp 0';
  const protectedSL = document.getElementById('pyrProtectedSL')?.innerText || '-';

  const text = `📊 RENCANA SWING TRADING: PIRAMIDA 3-TAHAP (30% - 40% - 30%)
Saham: ${code}
Total Alokasi Modal: ${formatIDR(budget)}

🔹 Tahap 1 (30% Modal - Initial Entry):
• Harga Beli: Rp ${formatIDR(p1)}
• Jumlah Posisi: ${t1Lots} (~${t1Val})
• Stop Loss Awal: Rp ${formatIDR(sl1)}

🔹 Tahap 2 (40% Modal - Konfirmasi Support):
• Harga Beli: Rp ${formatIDR(p2)}
• Jumlah Posisi: ${t2Lots} (~${t2Val})
• ${t2SL}

🔹 Tahap 3 (30% Modal - Breakout Resisten):
• Harga Beli: Rp ${formatIDR(p3)}
• Jumlah Posisi: ${t3Lots} (~${t3Val})
• ${t3SL}

🎯 HASIL AKUMULASI PENUH:
• Total Posisi: ${totLots} ${totShares}
• Total Modal Terpakai: ${totVal}
• Modal Rata-Rata (Avg): ${finalAvg}
• Stop Loss Terlindungi: ${protectedSL} (Bebas Risiko Rugi)

Generated by Syariah Swing Radar Pro`;

  navigator.clipboard.writeText(text).then(() => {
    showToast(`✅ Rencana Piramida 3-Tahap ${code} berhasil disalin!`);
  }).catch(() => {
    showToast("Gagal menyalin rencana piramida.");
  });
}

function addPyramidStage1ToJournal() {
  const code = document.getElementById('pyramidStockSelector')?.value || document.getElementById('calcStockSelector')?.value || '';
  const p1 = parseFloat(document.getElementById('pyrPrice1')?.value) || 0;
  const sl1 = parseFloat(document.getElementById('pyrInitialSL')?.value) || 0;
  const lots1Text = document.getElementById('pyrT1Lots')?.innerText || '';
  const lots1 = parseInt(lots1Text.replace(/[^0-9]/g, '')) || 1;
  const finalAvg = document.getElementById('pyrFinalAvg')?.innerText || '';

  if (!code) {
    showToast("Pilih kode saham terlebih dahulu.");
    return;
  }

  closeStandaloneCalcModal();
  openTradeEntryModal();

  document.getElementById('entryTradeId').value = '';
  document.getElementById('entryTicker').value = code;
  handleEntryTickerChange();

  document.getElementById('entryDate').value = new Date().toISOString().split('T')[0];
  if (p1 > 0) document.getElementById('entryPrice').value = p1;
  if (lots1 > 0) document.getElementById('entryLots').value = lots1;
  if (sl1 > 0) document.getElementById('entrySL').value = sl1;
  
  // Set trading note
  document.getElementById('entryNotes').value = `Piramida Tahap 1 (30% Modal) • Target Avg: ${finalAvg}`;
  calcEntryModalCapital();

  showToast(`📝 Tahap 1 Piramida ${code} (${lots1} Lot @ Rp ${formatIDR(p1)}) siap dicatat ke Jurnal.`);
}

// -------------------------------------------------------------
// STOCK DETAIL MODAL
// -------------------------------------------------------------
function openModal(stock) {
  currentOpenStock = stock;
  const modal = document.getElementById('detailModal');
  const plan = stock.trading_plan;
  const bandar = stock.bandarmologi || {};
  const fund = stock.fundamental || {};

  document.getElementById('modalStockCode').innerHTML = `
    ${stock.code}
    <span class="text-xs font-normal text-gray-400 px-2 py-0.5 rounded bg-gray-800">${stock.sector}</span>
  `;
  document.getElementById('modalStockName').innerText = stock.name;
  document.getElementById('modalScoreVal').innerText = stock.score;
  updateModalWatchlistBtn();

  // 3-Pillar scores
  document.getElementById('modalTechScore').innerText = `${stock.tech_score || 80}/100`;
  document.getElementById('modalBandarScore').innerText = `${stock.bandar_score || 50}/100`;
  document.getElementById('modalFundScore').innerText = `${stock.fund_score || 50}/100`;

  // Risk Banner styling
  const banner = document.getElementById('modalRiskBanner');
  const title = document.getElementById('modalRiskTitle');
  const subtitle = document.getElementById('modalRiskSubtitle');
  const icon = document.getElementById('modalRiskIcon');

  if (stock.passed_screener === false) {
    banner.className = 'p-3 rounded-xl border border-amber-500/40 bg-amber-500/10 flex items-center justify-between';
    title.className = 'font-bold text-sm block text-amber-400';
    title.innerText = 'Status: Belum Lolos Sinyal Beli Hari Ini';
    subtitle.innerText = stock.safety_advice || 'Menunggu konfirmasi reversal candle / hammer sebelum entry.';
    icon.className = 'fa-solid fa-triangle-exclamation text-xl text-amber-400';
  } else if (stock.risk_level === 'LOW_RISK') {
    banner.className = 'p-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 flex items-center justify-between';
    title.className = 'font-bold text-sm block text-emerald-400';
    title.innerText = 'Tingkat Keamanan: Paling Aman (Grade A+)';
    subtitle.innerText = 'Tren terkonfirmasi, akumulasi bandar terdeteksi, dan SL ketat.';
    icon.className = 'fa-solid fa-shield-check text-xl text-emerald-400';
  } else if (stock.risk_level === 'MEDIUM_RISK') {
    banner.className = 'p-3 rounded-xl border border-blue-500/40 bg-blue-500/10 flex items-center justify-between';
    title.className = 'font-bold text-sm block text-blue-400';
    title.innerText = 'Tingkat Keamanan: Moderat (Grade B)';
    subtitle.innerText = 'Sinyal positif terbentuk, perhatikan disiplin eksekusi Stop Loss.';
    icon.className = 'fa-solid fa-scale-balanced text-xl text-blue-400';
  } else {
    banner.className = 'p-3 rounded-xl border border-amber-500/40 bg-amber-500/10 flex items-center justify-between';
    title.className = 'font-bold text-sm block text-amber-400';
    title.innerText = 'Tingkat Keamanan: Spekulatif (Tunggu Reversal Sempurna)';
    subtitle.innerText = 'Oversold ekstrem, tunggu munculnya candle hijau sebelum melakukan pembelian.';
    icon.className = 'fa-solid fa-triangle-exclamation text-xl text-amber-400';
  }

  // Trading plan
  document.getElementById('modalEntry').innerText = formatIDR(plan.entry);
  document.getElementById('modalSL').innerText = formatIDR(plan.stop_loss);
  document.getElementById('modalSLPct').innerText = `(-${plan.risk_pct}%)`;
  document.getElementById('modalTP1').innerText = formatIDR(plan.tp1);
  document.getElementById('modalTP1Pct').innerText = `(+${plan.tp1_pct}%)`;
  document.getElementById('modalTP2').innerText = formatIDR(plan.tp2);
  document.getElementById('modalTP2Pct').innerText = `(+${plan.tp2_pct}%)`;

  // Bandarmologi metrics
  document.getElementById('modalBandarBadge').innerText = bandar.label || 'Netral';
  document.getElementById('modalVWAP').innerText = formatIDR(bandar.vwap_20);
  document.getElementById('modalBuyVol').innerText = `${bandar.buy_volume_pct_5d || 50}%`;
  document.getElementById('modalMFI').innerText = `${stock.mfi || 50} / 100`;

  // Fundamental Syariah metrics
  document.getElementById('modalMarketCap').innerText = fund.market_cap_str || '-';
  document.getElementById('modalPER').innerText = fund.pe ? `${fund.pe}x` : '-';
  document.getElementById('modalPBV').innerText = fund.pbv ? `${fund.pbv}x` : '-';
  document.getElementById('modalROE').innerText = fund.roe ? `${fund.roe}%` : '-';
  document.getElementById('modalDER').innerText = fund.der !== null && fund.der !== undefined ? `${fund.der}%` : '-';

  // Safety list
  const safetyList = document.getElementById('modalSafety');
  if (stock.passed_screener === false && stock.rejection_reasons && stock.rejection_reasons.length > 0) {
    safetyList.innerHTML = stock.rejection_reasons.map(s => `
      <li class="flex items-start gap-2 text-amber-300">
        <i class="fa-solid fa-triangle-exclamation text-amber-400 mt-0.5"></i>
        <span>${s}</span>
      </li>
    `).join('');
  } else {
    const safetyItems = stock.safety_confirmations && stock.safety_confirmations.length > 0 
      ? stock.safety_confirmations 
      : ['Menunggu konfirmasi pembalikan arah tambahan'];
    safetyList.innerHTML = safetyItems.map(s => `
      <li class="flex items-start gap-2">
        <i class="fa-solid fa-check text-emerald-400 mt-0.5"></i>
        <span>${s}</span>
      </li>
    `).join('');
  }

  // Capital in modal
  const savedCap = localStorage.getItem('user_trading_capital');
  if (savedCap) {
    document.getElementById('calcCapitalInput').value = savedCap;
  }

  updateLotCalculation();

  modal.classList.remove('hidden');

  // Load interactive chart
  loadStockChart(stock.code);
}

function closeModal() {
  document.getElementById('detailModal').classList.add('hidden');
  currentOpenStock = null;
  cleanupTVChart();
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }
}

function setRiskPct(pct) {
  document.getElementById('calcRiskPct').value = pct;
  document.querySelectorAll('.risk-btn').forEach(btn => {
    btn.className = 'risk-btn px-2 py-1.5 bg-gray-800 text-[10px] rounded border border-gray-700 hover:border-emerald-500 text-gray-300';
    if (btn.innerText.includes(`${pct}%`)) {
      btn.className = 'risk-btn px-2 py-1.5 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold rounded border border-emerald-500';
    }
  });
  updateLotCalculation();
}

function updateLotCalculation() {
  if (!currentOpenStock) return;
  const plan = currentOpenStock.trading_plan;
  const entry = plan.entry;
  const stopLoss = plan.stop_loss;

  const capInput = parseFloat(document.getElementById('calcCapitalInput').value) || 50000000;
  const riskPct = parseFloat(document.getElementById('calcRiskPct').value) || 2.0;

  localStorage.setItem('user_trading_capital', capInput);

  if (entry <= stopLoss) return;

  const maxLossIdr = capInput * (riskPct / 100);
  const riskPerShare = entry - stopLoss;

  let totalShares = Math.floor(maxLossIdr / riskPerShare);
  let totalLots = Math.floor(totalShares / 100);

  if (totalLots < 1) {
    totalLots = 1;
    totalShares = 100;
  } else {
    totalShares = totalLots * 100;
  }

  const capitalAllocated = totalShares * entry;
  const allocPct = ((capitalAllocated / capInput) * 100).toFixed(1);
  const actualMaxLoss = totalShares * riskPerShare;

  document.getElementById('calcLots').innerText = `${totalLots.toLocaleString('id-ID')} Lot`;
  document.getElementById('calcShares').innerText = `(${totalShares.toLocaleString('id-ID')} Lembar)`;
  document.getElementById('calcAllocated').innerText = formatIDR(capitalAllocated);
  document.getElementById('calcAllocPct').innerText = `(${allocPct}% Portofolio)`;
  document.getElementById('calcMaxRisk').innerText = formatIDR(actualMaxLoss);
}

// -------------------------------------------------------------
// ADD CUSTOM STOCK MODAL
// -------------------------------------------------------------
function openAddStockModal(prefill = '') {
  document.getElementById('addStockModal').classList.remove('hidden');
  const input = document.getElementById('newStockCode');
  input.value = typeof prefill === 'string' ? prefill : '';
  document.getElementById('addStockAlert').className = 'hidden';
  if (prefill && typeof prefill === 'string') {
    input.focus();
  }
}

function closeAddStockModal() {
  document.getElementById('addStockModal').classList.add('hidden');
}

async function submitAddStock() {
  const codeInput = document.getElementById('newStockCode');
  const code = codeInput.value.trim().toUpperCase();
  const alertBox = document.getElementById('addStockAlert');
  const btn = document.getElementById('addStockBtn');

  if (!code) return;

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

  try {
    const res = await authFetch('/api/sharia-stocks/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Gagal menambahkan saham");

    alertBox.className = 'p-2.5 rounded-lg text-xs mt-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
    alertBox.innerText = data.message;
    alertBox.classList.remove('hidden');

    setTimeout(() => {
      closeAddStockModal();
      fetchResults(true);
    }, 1500);
  } catch (err) {
    alertBox.className = 'p-2.5 rounded-lg text-xs mt-2 bg-amber-500/20 text-amber-300 border border-amber-500/40 text-left';
    alertBox.innerHTML = `
      <div class="space-y-1.5">
        <p class="font-medium text-amber-200">${err.message}</p>
        <button type="button" onclick="closeAddStockModal(); document.getElementById('searchInput').value='${code}'; handleSearch();" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-[11px] font-bold border border-amber-500/40 transition">
          <i class="fa-solid fa-magnifying-glass"></i>
          <span>Lihat Diagnosa Saham ${code}</span>
        </button>
      </div>
    `;
    alertBox.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>Tambah</span>';
  }
}

// -------------------------------------------------------------
// TELEGRAM NOTIFICATION MODAL
// -------------------------------------------------------------
async function openTelegramModal() {
  const modal = document.getElementById('telegramModal');
  modal.classList.remove('hidden');
  document.getElementById('tgAlertMessage').className = 'hidden';

  try {
    const res = await authFetch('/api/telegram/config');
    const data = await res.json();
    if (data.configured) {
      document.getElementById('tgChatId').value = data.chat_id || '';
      document.getElementById('tgBotToken').placeholder = `Tersimpan: ${data.masked_token}`;
    }
  } catch (e) {
    console.error("Gagal load config telegram:", e);
  }
}

function closeTelegramModal() {
  document.getElementById('telegramModal').classList.add('hidden');
}

async function saveTelegramConfig() {
  const token = document.getElementById('tgBotToken').value.trim();
  const cid = document.getElementById('tgChatId').value.trim();
  const alertBox = document.getElementById('tgAlertMessage');

  if (!cid) {
    alertBox.className = 'p-2.5 rounded-lg text-xs mt-2 bg-red-500/20 text-red-400 border border-red-500/30';
    alertBox.innerText = 'Chat ID Telegram tidak boleh kosong.';
    alertBox.classList.remove('hidden');
    return;
  }

  try {
    const res = await authFetch('/api/telegram/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bot_token: token, chat_id: cid, enabled: true })
    });
    const data = await res.json();
    alertBox.className = 'p-2.5 rounded-lg text-xs mt-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
    alertBox.innerText = data.message;
    alertBox.classList.remove('hidden');
  } catch (err) {
    alertBox.className = 'p-2.5 rounded-lg text-xs mt-2 bg-red-500/20 text-red-400 border border-red-500/30';
    alertBox.innerText = err.message;
    alertBox.classList.remove('hidden');
  }
}

async function testSendTelegramAlert() {
  const alertBox = document.getElementById('tgAlertMessage');
  alertBox.className = 'p-2.5 rounded-lg text-xs mt-2 bg-blue-500/20 text-blue-300 border border-blue-500/30';
  alertBox.innerText = 'Mengirim tes sinyal ke Telegram...';
  alertBox.classList.remove('hidden');

  try {
    const res = await authFetch('/api/telegram/send-alert', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Gagal mengirim tes alert");

    alertBox.className = 'p-2.5 rounded-lg text-xs mt-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
    alertBox.innerText = '✅ Pesan sinyal berhasil masuk ke Telegram Anda!';
  } catch (err) {
    alertBox.className = 'p-2.5 rounded-lg text-xs mt-2 bg-red-500/20 text-red-400 border border-red-500/30';
    alertBox.innerText = `Gagal: ${err.message}`;
  }
}

// -------------------------------------------------------------
// TRADINGVIEW LIGHTWEIGHT CHARTS ENGINE (CANDLESTICK & VOLUME)
// -------------------------------------------------------------
let tvChartInstance = null;
let tvCandleSeries = null;
let tvLineSeries = null;
let tvVolumeSeries = null;
let tvMASeries = {};
let tvPriceLines = [];
let currentChartType = 'candlestick'; // 'candlestick' or 'line'
let showChartMA = true;
let showChartPlan = true;
let currentChartData = null;
let currentStockCode = '';
let tvResizeObserver = null;

function cleanupTVChart() {
  if (tvResizeObserver) {
    tvResizeObserver.disconnect();
    tvResizeObserver = null;
  }
  if (tvChartInstance) {
    try {
      tvChartInstance.remove();
    } catch (e) {}
    tvChartInstance = null;
  }
  tvCandleSeries = null;
  tvLineSeries = null;
  tvVolumeSeries = null;
  tvMASeries = {};
  tvPriceLines = [];
}

async function loadStockChart(code) {
  currentStockCode = code;
  const container = document.getElementById('tvChartContainer');
  const spinner = document.getElementById('chartLoadingSpinner');
  if (!container) return;

  if (spinner) spinner.classList.remove('hidden');

  try {
    const res = await authFetch(`/api/stock/${code}`);
    if (!res.ok) throw new Error("Gagal mengambil data historis saham.");
    const data = await res.json();
    currentChartData = data;
    renderTVChart();
  } catch (err) {
    console.error("Gagal load TradingView chart:", err);
    if (spinner) {
      spinner.innerHTML = `
        <div class="text-center text-red-400 p-3">
          <i class="fa-solid fa-triangle-exclamation text-lg mb-1"></i>
          <p class="text-xs">Gagal memuat grafik: ${err.message}</p>
        </div>
      `;
    }
  }
}

function renderTVChart() {
  const container = document.getElementById('tvChartContainer');
  const spinner = document.getElementById('chartLoadingSpinner');
  if (!container || !currentChartData) return;

  cleanupTVChart();

  const isLight = (document.documentElement.classList.contains('light-theme') || (document.body && document.body.classList.contains('light-theme')));
  const history = currentChartData.history || [];

  if (history.length === 0) {
    if (spinner) {
      spinner.innerHTML = '<span class="text-xs text-gray-500">Data grafik historis belum tersedia.</span>';
    }
    return;
  }

  // Check if LightweightCharts library is loaded
  if (typeof LightweightCharts === 'undefined') {
    console.warn("LightweightCharts library not loaded yet.");
    return;
  }

  const bgColor = isLight ? '#ffffff' : '#0e1117';
  const textColor = isLight ? '#4b5563' : '#9ca3af';
  const gridColor = isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.04)';
  const borderColor = isLight ? '#e5e7eb' : '#21262d';

  tvChartInstance = LightweightCharts.createChart(container, {
    width: container.clientWidth || 600,
    height: container.clientHeight || 300,
    layout: {
      background: { type: 'solid', color: bgColor },
      textColor: textColor,
      fontSize: 10,
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
    },
    grid: {
      vertLines: { color: gridColor },
      horzLines: { color: gridColor }
    },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal,
      vertLine: {
        color: isLight ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.2)',
        width: 1,
        style: LightweightCharts.LineStyle.Dotted
      },
      horzLine: {
        color: isLight ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.2)',
        width: 1,
        style: LightweightCharts.LineStyle.Dotted
      }
    },
    rightPriceScale: {
      borderColor: borderColor,
      scaleMargins: {
        top: 0.1,
        bottom: 0.25 // leave room for volume
      }
    },
    timeScale: {
      borderColor: borderColor,
      timeVisible: true,
      secondsVisible: false
    },
    handleScroll: {
      mouseWheel: true,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: false
    },
    handleScale: {
      axisPressedMouseMove: true,
      mouseWheel: true,
      pinch: true
    }
  });

  // 1. Add Volume Series (Histogram at bottom)
  tvVolumeSeries = tvChartInstance.addHistogramSeries({
    priceFormat: { type: 'volume' },
    priceScaleId: '', // independent scale overlay
  });
  tvVolumeSeries.priceScale().applyOptions({
    scaleMargins: {
      top: 0.8,
      bottom: 0
    }
  });

  const volumeData = history.map(h => ({
    time: h.date,
    value: h.volume,
    color: (h.close >= h.open) ? 'rgba(16, 185, 129, 0.45)' : 'rgba(239, 68, 68, 0.45)'
  }));
  tvVolumeSeries.setData(volumeData);

  // 2. Add Candlestick or Line Series
  if (currentChartType === 'candlestick') {
    tvCandleSeries = tvChartInstance.addCandlestickSeries({
      upColor: '#10b981',
      downColor: '#ef4444',
      borderUpColor: '#10b981',
      borderDownColor: '#ef4444',
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444'
    });
    const candleData = history.map(h => ({
      time: h.date,
      open: h.open,
      high: h.high,
      low: h.low,
      close: h.close
    }));
    tvCandleSeries.setData(candleData);
  } else {
    tvLineSeries = tvChartInstance.addLineSeries({
      color: '#10b981',
      lineWidth: 2,
      priceLineVisible: true
    });
    const lineData = history.map(h => ({
      time: h.date,
      value: h.close
    }));
    tvLineSeries.setData(lineData);
  }

  // 3. Add MA Series
  if (showChartMA) {
    const maConfigs = [
      { key: 'ma20', color: '#60a5fa', title: 'MA20', width: 1.5, style: LightweightCharts.LineStyle.Dashed },
      { key: 'ma50', color: '#f59e0b', title: 'MA50', width: 1.5, style: LightweightCharts.LineStyle.Solid },
      { key: 'ma100', color: '#06b6d4', title: 'MA100', width: 1.5, style: LightweightCharts.LineStyle.Solid },
      { key: 'ma200', color: '#a855f7', title: 'MA200', width: 1.5, style: LightweightCharts.LineStyle.Solid }
    ];

    maConfigs.forEach(cfg => {
      const series = tvChartInstance.addLineSeries({
        color: cfg.color,
        lineWidth: cfg.width,
        lineStyle: cfg.style,
        title: cfg.title,
        priceLineVisible: false,
        crosshairMarkerVisible: false
      });
      const data = history
        .filter(h => h[cfg.key] !== null && h[cfg.key] !== undefined)
        .map(h => ({ time: h.date, value: h[cfg.key] }));
      series.setData(data);
      tvMASeries[cfg.key] = series;
    });
  }

  // 4. Add Trading Plan Price Lines (Entry, SL, TP1, TP2)
  if (showChartPlan && currentOpenStock && currentOpenStock.trading_plan) {
    const plan = currentOpenStock.trading_plan;
    const targetSeries = tvCandleSeries || tvLineSeries;

    if (targetSeries) {
      if (plan.entry) {
        tvPriceLines.push(targetSeries.createPriceLine({
          price: plan.entry,
          color: '#10b981',
          lineWidth: 1.5,
          lineStyle: LightweightCharts.LineStyle.Dashed,
          axisLabelVisible: true,
          title: `Entry: ${formatIDR(plan.entry)}`
        }));
      }

      if (plan.stop_loss) {
        tvPriceLines.push(targetSeries.createPriceLine({
          price: plan.stop_loss,
          color: '#ef4444',
          lineWidth: 1.5,
          lineStyle: LightweightCharts.LineStyle.Dashed,
          axisLabelVisible: true,
          title: `SL: ${formatIDR(plan.stop_loss)}`
        }));
      }

      if (plan.tp1) {
        tvPriceLines.push(targetSeries.createPriceLine({
          price: plan.tp1,
          color: '#06b6d4',
          lineWidth: 1.5,
          lineStyle: LightweightCharts.LineStyle.Dashed,
          axisLabelVisible: true,
          title: `TP1: ${formatIDR(plan.tp1)}`
        }));
      }

      if (plan.tp2) {
        tvPriceLines.push(targetSeries.createPriceLine({
          price: plan.tp2,
          color: '#a855f7',
          lineWidth: 1.5,
          lineStyle: LightweightCharts.LineStyle.Dashed,
          axisLabelVisible: true,
          title: `TP2: ${formatIDR(plan.tp2)}`
        }));
      }
    }
  }

  // 5. Setup Crosshair / Hover OHLCV Tooltip Bar
  const lastBar = history[history.length - 1];
  updateLegendBar(lastBar);

  tvChartInstance.subscribeCrosshairMove(param => {
    if (!param.time || param.point === undefined) {
      updateLegendBar(lastBar);
      return;
    }

    const currentBar = history.find(h => h.date === param.time);
    if (currentBar) {
      updateLegendBar(currentBar);
    }
  });

  // Fit content
  tvChartInstance.timeScale().fitContent();

  // Setup Resize Observer for responsiveness
  if (window.ResizeObserver) {
    tvResizeObserver = new ResizeObserver(entries => {
      if (!entries || entries.length === 0 || !tvChartInstance) return;
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        tvChartInstance.applyOptions({ width, height });
      }
    });
    tvResizeObserver.observe(container);
  }

  if (spinner) spinner.classList.add('hidden');
}

function updateLegendBar(bar) {
  if (!bar) return;
  const legDate = document.getElementById('legDate');
  const legOpen = document.getElementById('legOpen');
  const legHigh = document.getElementById('legHigh');
  const legLow = document.getElementById('legLow');
  const legClose = document.getElementById('legClose');
  const legVol = document.getElementById('legVol');

  if (legDate) legDate.innerText = bar.date;
  if (legOpen) legOpen.innerText = formatIDR(bar.open);
  if (legHigh) legHigh.innerText = formatIDR(bar.high);
  if (legLow) legLow.innerText = formatIDR(bar.low);

  if (legClose) {
    const diff = bar.close - bar.open;
    const diffPct = bar.open > 0 ? ((diff / bar.open) * 100).toFixed(1) : 0;
    const sign = diff >= 0 ? '+' : '';
    const colorClass = diff >= 0 ? 'text-emerald-400' : 'text-red-400';
    legClose.className = `${colorClass} font-bold`;
    legClose.innerText = `${formatIDR(bar.close)} (${sign}${diffPct}%)`;
  }

  if (legVol) {
    const lots = Math.round(bar.volume / 100);
    legVol.innerText = (lots >= 1000) ? `${(lots / 1000).toFixed(1)}k Lot` : `${lots} Lot`;
  }
}

function setChartType(type) {
  currentChartType = type;
  const candleBtn = document.getElementById('chartTypeCandleBtn');
  const lineBtn = document.getElementById('chartTypeLineBtn');

  if (type === 'candlestick') {
    if (candleBtn) candleBtn.className = 'chart-ctl-btn px-2 py-1 rounded bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/40';
    if (lineBtn) lineBtn.className = 'chart-ctl-btn px-2 py-1 rounded bg-gray-800 text-gray-300 hover:text-white border border-gray-700';
  } else {
    if (candleBtn) candleBtn.className = 'chart-ctl-btn px-2 py-1 rounded bg-gray-800 text-gray-300 hover:text-white border border-gray-700';
    if (lineBtn) lineBtn.className = 'chart-ctl-btn px-2 py-1 rounded bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/40';
  }

  renderTVChart();
}

function toggleChartMA() {
  showChartMA = !showChartMA;
  const btn = document.getElementById('chartToggleMABtn');
  if (btn) {
    if (showChartMA) {
      btn.className = 'chart-ctl-btn px-2 py-1 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 font-semibold';
    } else {
      btn.className = 'chart-ctl-btn px-2 py-1 rounded bg-gray-800 text-gray-400 border border-gray-700 line-through';
    }
  }
  renderTVChart();
}

function toggleChartPlanLines() {
  showChartPlan = !showChartPlan;
  const btn = document.getElementById('chartTogglePlanBtn');
  if (btn) {
    if (showChartPlan) {
      btn.className = 'chart-ctl-btn px-2 py-1 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 font-semibold';
    } else {
      btn.className = 'chart-ctl-btn px-2 py-1 rounded bg-gray-800 text-gray-400 border border-gray-700 line-through';
    }
  }
  renderTVChart();
}

// -------------------------------------------------------------
// STOCKBIT-STYLE MOBILE BOTTOM NAVIGATION & ACTIONS
// -------------------------------------------------------------
function updateMobileNavActive(activeTab) {
  const tabs = ['Radar', 'Watchlist', 'Journal', 'Calc', 'Menu'];
  tabs.forEach(t => {
    const el = document.getElementById(`mobileNav${t}`);
    if (el) {
      if (t.toLowerCase() === activeTab.toLowerCase()) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    }
  });
}

function switchMobileTab(tab) {
  updateMobileNavActive(tab);
  if (tab === 'radar') {
    closeMobileHistoryModal();
    closeMobileMenuModal();
    closeJournalModal();
    switchMainView('list');
    setFilter('ALL');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else if (tab === 'watchlist') {
    closeMobileHistoryModal();
    closeMobileMenuModal();
    closeJournalModal();
    switchMainView('list');
    setFilter('WATCHLIST');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else if (tab === 'journal') {
    closeMobileHistoryModal();
    closeMobileMenuModal();
    openJournalModal();
  } else if (tab === 'history') {
    closeMobileMenuModal();
    closeJournalModal();
    openMobileHistoryModal();
  } else if (tab === 'calc') {
    closeMobileHistoryModal();
    closeMobileMenuModal();
    closeJournalModal();
    openStandaloneCalcModal();
  } else if (tab === 'menu') {
    closeMobileHistoryModal();
    closeJournalModal();
    openMobileMenuModal();
  }
}

function openMobileHistoryModal() {
  const m = document.getElementById('mobileHistoryModal');
  if (m) m.classList.remove('hidden');
}

function closeMobileHistoryModal() {
  const m = document.getElementById('mobileHistoryModal');
  if (m) {
    m.classList.add('hidden');
    updateMobileNavActive(currentFilter === 'WATCHLIST' ? 'Watchlist' : 'Radar');
  }
}

function openMobileMenuModal() {
  const m = document.getElementById('mobileMenuModal');
  if (m) m.classList.remove('hidden');
}

function closeMobileMenuModal() {
  const m = document.getElementById('mobileMenuModal');
  if (m) {
    m.classList.add('hidden');
    updateMobileNavActive(currentFilter === 'WATCHLIST' ? 'Watchlist' : 'Radar');
  }
}

function handleMobileHistoryDateChange(date) {
  const select = document.getElementById('historyDateSelect');
  if (select) select.value = date;
  closeMobileHistoryModal();
  handleHistoryDateChange(date);
}

function toggleMobileSearch() {
  const input = document.getElementById('searchInput');
  const container = document.getElementById('searchContainer');
  if (input) {
    input.focus();
    if (container) {
      container.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
}

// -------------------------------------------------------------
// ADMIN USER MANAGEMENT HANDLERS (ADMIN ONLY)
// -------------------------------------------------------------
let currentResetTarget = '';
let currentExtendTarget = '';

function openUserManagementModal() {
  const role = localStorage.getItem('syariah_radar_role');
  if (role !== 'admin') {
    showToast('⛔ Akses khusus Administrator (Galunk).');
    return;
  }
  const modal = document.getElementById('userManagementModal');
  if (modal) {
    modal.classList.remove('hidden');
    loadAdminUsers();
  }
}

function closeUserManagementModal() {
  const modal = document.getElementById('userManagementModal');
  if (modal) modal.classList.add('hidden');
  cancelResetPassword();
  cancelExtendExpiry();
}

function handleNewUserRoleChange() {
  const roleSelect = document.getElementById('newUserRole');
  const durationSelect = document.getElementById('newUserDuration');
  if (!roleSelect || !durationSelect) return;
  if (roleSelect.value === 'admin') {
    durationSelect.value = '0';
    durationSelect.disabled = true;
  } else {
    durationSelect.disabled = false;
    if (durationSelect.value === '0') durationSelect.value = '30';
  }
}

async function loadAdminUsers() {
  const tbody = document.getElementById('userTableBody');
  const countText = document.getElementById('userCountText');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="6" class="py-4 text-center text-gray-500"><i class="fa-solid fa-spinner fa-spin mr-1.5"></i>Memuat pengguna...</td></tr>`;

  try {
    const res = await authFetch('/api/admin/users');
    const data = await res.json();
    const users = data.users || [];
    if (countText) countText.innerText = users.length;

    if (users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="py-4 text-center text-gray-500">Belum ada pengguna.</td></tr>`;
      return;
    }

    tbody.innerHTML = users.map(u => {
      const isGalunk = (u.username.toLowerCase() === 'galunk');
      const isAdmin = (u.role === 'admin' || isGalunk);
      
      const roleBadge = isAdmin
        ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">Admin</span>`
        : `<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">Member</span>`;

      let expiryBadge = '';
      if (isAdmin || u.is_lifetime) {
        expiryBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1 w-max"><i class="fa-solid fa-crown text-[9px]"></i> Lifetime</span>`;
      } else if (u.is_expired) {
        expiryBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1 w-max"><i class="fa-solid fa-ban text-[9px]"></i> Habis (${u.expiry_str})</span>`;
      } else if (u.days_remaining !== undefined && u.days_remaining !== null && u.days_remaining <= 5) {
        expiryBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1 w-max animate-pulse" title="Aktif s.d ${u.expiry_str}"><i class="fa-solid fa-clock text-[9px]"></i> Sisa ${u.days_remaining} Hari</span>`;
      } else if (u.days_remaining !== undefined && u.days_remaining !== null) {
        expiryBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 w-max" title="Aktif s.d ${u.expiry_str}"><i class="fa-solid fa-hourglass-half text-[9px]"></i> ${u.days_remaining} Hari (${u.expiry_str})</span>`;
      } else {
        expiryBadge = `<span class="text-gray-500 text-[10px]">-</span>`;
      }

      const deviceStatus = isAdmin
        ? `<span class="text-[10px] text-emerald-400 font-semibold flex items-center gap-1"><i class="fa-solid fa-bolt text-amber-400"></i> Multi-Device</span>`
        : (u.has_active_device
            ? `<span class="text-[10px] text-emerald-400 font-semibold flex items-center gap-1"><i class="fa-solid fa-circle-check text-emerald-400"></i> 1 Device Aktif (v${u.session_version})</span>`
            : `<span class="text-[10px] text-gray-500">⚪ Belum login</span>`);

      const lastLoginStr = u.last_login
        ? new Date(u.last_login * 1000).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })
        : 'Belum pernah';

      const actionButtons = `
        <div class="flex items-center justify-end gap-1.5">
          ${isGalunk ? '' : `
          <button onclick="startExtendUser('${u.username}', '${u.expiry_str}', ${u.days_remaining || 0}, ${Boolean(u.is_lifetime || isAdmin)})" class="px-2 py-1 rounded bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 text-[10px] font-semibold border border-blue-500/40 transition flex items-center gap-1" title="Perpanjang Masa Aktif">
            <i class="fa-solid fa-hourglass-half text-[9px]"></i>
            <span class="hidden sm:inline">Perpanjang</span>
          </button>
          `}
          <button onclick="startResetPassword('${u.username}')" class="px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-[10px] font-semibold border border-amber-500/40 transition flex items-center gap-1" title="Reset Password (Kick login lama)">
            <i class="fa-solid fa-key text-[9px]"></i>
            <span class="hidden sm:inline">Reset</span>
          </button>
          ${isGalunk ? '' : `
          <button onclick="deleteUserAccount('${u.username}')" class="px-2 py-1 rounded bg-red-500/20 hover:bg-red-500/30 text-red-400 text-[10px] font-semibold border border-red-500/40 transition flex items-center gap-1" title="Hapus Akun Pengguna">
            <i class="fa-solid fa-trash text-[9px]"></i>
            <span class="hidden sm:inline">Hapus</span>
          </button>
          `}
        </div>
      `;

      return `
        <tr class="hover:bg-gray-800/40 transition">
          <td class="py-2.5 px-3 font-semibold text-white">
            <div class="flex items-center gap-1.5">
              <i class="fa-solid ${isAdmin ? 'fa-user-shield text-amber-400' : 'fa-user text-gray-400'} text-xs"></i>
              <span>${u.username}</span>
            </div>
          </td>
          <td class="py-2.5 px-2">${roleBadge}</td>
          <td class="py-2.5 px-2">${expiryBadge}</td>
          <td class="py-2.5 px-2 hidden sm:table-cell">${deviceStatus}</td>
          <td class="py-2.5 px-2 hidden md:table-cell text-gray-400 text-[11px]">${lastLoginStr}</td>
          <td class="py-2.5 px-3 text-right">${actionButtons}</td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error("Gagal load users:", err);
    tbody.innerHTML = `<tr><td colspan="6" class="py-4 text-center text-red-400">Gagal memuat pengguna: ${err.message}</td></tr>`;
  }
}

async function submitCreateUser(event) {
  event.preventDefault();
  const usernameInput = document.getElementById('newUsername');
  const passwordInput = document.getElementById('newUserPassword');
  const roleSelect = document.getElementById('newUserRole');
  const durationSelect = document.getElementById('newUserDuration');
  const submitBtn = document.getElementById('createUserSubmitBtn');
  const alertBox = document.getElementById('createUserAlert');

  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  const role = roleSelect.value;
  const duration_days = durationSelect ? parseInt(durationSelect.value) || 0 : 30;

  if (!username || !password) return;

  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-xs"></i>';
  alertBox.classList.add('hidden');

  try {
    const res = await authFetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, role, duration_days })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Gagal menambahkan user');

    alertBox.className = 'p-2 rounded-lg text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
    alertBox.innerText = data.message;
    alertBox.classList.remove('hidden');

    usernameInput.value = '';
    passwordInput.value = '';
    if (durationSelect && role !== 'admin') durationSelect.value = '30';
    showToast(`✅ Akun '${username}' berhasil didaftarkan!`);
    loadAdminUsers();
  } catch (err) {
    alertBox.className = 'p-2 rounded-lg text-xs bg-red-500/20 text-red-400 border border-red-500/30';
    alertBox.innerText = err.message;
    alertBox.classList.remove('hidden');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fa-solid fa-plus text-xs"></i><span>Tambah</span>';
  }
}

function startExtendUser(username, expiryStr, daysRemaining, isLifetime) {
  currentExtendTarget = username;
  const box = document.getElementById('extendExpiryBox');
  const targetLabel = document.getElementById('extendTargetUsername');
  const currentText = document.getElementById('extendCurrentExpiryText');
  const alert = document.getElementById('extendAlert');

  if (targetLabel) targetLabel.innerText = username;
  if (currentText) {
    if (isLifetime) {
      currentText.innerHTML = '<span class="text-amber-400 font-bold"><i class="fa-solid fa-crown text-xs mr-1"></i> Selamanya (Lifetime)</span>';
    } else if (daysRemaining > 0) {
      currentText.innerHTML = `<span class="text-emerald-400 font-semibold"><i class="fa-solid fa-circle-check text-xs mr-1"></i> Aktif s.d ${expiryStr} (Sisa ${daysRemaining} Hari)</span>`;
    } else {
      currentText.innerHTML = `<span class="text-red-400 font-bold"><i class="fa-solid fa-circle-xmark text-xs mr-1"></i> Kadaluwarsa (${expiryStr})</span>`;
    }
  }
  if (alert) alert.classList.add('hidden');
  if (box) {
    box.classList.remove('hidden');
    box.scrollIntoView({ behavior: 'smooth' });
  }
}

function cancelExtendExpiry() {
  currentExtendTarget = '';
  const box = document.getElementById('extendExpiryBox');
  if (box) box.classList.add('hidden');
}

async function submitExtendUser(durationDays, mode = 'add') {
  if (!currentExtendTarget) return;
  const alert = document.getElementById('extendAlert');
  if (alert) alert.classList.add('hidden');

  try {
    const res = await authFetch(`/api/admin/users/${encodeURIComponent(currentExtendTarget)}/expiry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duration_days: durationDays, mode: mode })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Gagal memperbarui masa aktif');

    showToast(`✅ Masa aktif '${currentExtendTarget}' berhasil diperbarui!`);
    cancelExtendExpiry();
    loadAdminUsers();
  } catch (err) {
    if (alert) {
      alert.className = 'p-2 rounded-lg text-xs bg-red-500/20 text-red-400 border border-red-500/30';
      alert.innerText = err.message;
      alert.classList.remove('hidden');
    }
  }
}

function startResetPassword(username) {
  currentResetTarget = username;
  const box = document.getElementById('resetPasswordBox');
  const targetLabel = document.getElementById('resetTargetUsername');
  const input = document.getElementById('resetNewPasswordInput');
  const alert = document.getElementById('resetAlert');

  if (targetLabel) targetLabel.innerText = username;
  if (input) input.value = '';
  if (alert) alert.classList.add('hidden');
  if (box) {
    box.classList.remove('hidden');
    box.scrollIntoView({ behavior: 'smooth' });
    if (input) input.focus();
  }
}

function cancelResetPassword() {
  currentResetTarget = '';
  const box = document.getElementById('resetPasswordBox');
  if (box) box.classList.add('hidden');
}

async function submitResetPassword() {
  if (!currentResetTarget) return;
  const input = document.getElementById('resetNewPasswordInput');
  const alert = document.getElementById('resetAlert');
  const newPassword = input ? input.value : '';

  if (!newPassword || newPassword.length < 6) {
    if (alert) {
      alert.className = 'p-2 rounded-lg text-xs bg-red-500/20 text-red-400 border border-red-500/30';
      alert.innerText = 'Password baru minimal 6 karakter.';
      alert.classList.remove('hidden');
    }
    return;
  }

  try {
    const res = await authFetch(`/api/admin/users/${encodeURIComponent(currentResetTarget)}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_password: newPassword })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Gagal mereset password');

    showToast(`✅ Password '${currentResetTarget}' berhasil direset!`);
    cancelResetPassword();
    loadAdminUsers();
  } catch (err) {
    if (alert) {
      alert.className = 'p-2 rounded-lg text-xs bg-red-500/20 text-red-400 border border-red-500/30';
      alert.innerText = err.message;
      alert.classList.remove('hidden');
    }
  }
}

async function deleteUserAccount(username) {
  if (!confirm(`Apakah Anda yakin ingin menghapus akun pengguna '${username}'?`)) {
    return;
  }

  try {
    const res = await authFetch(`/api/admin/users/${encodeURIComponent(username)}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Gagal menghapus user');

    showToast(`✅ Akun '${username}' berhasil dihapus.`);
    loadAdminUsers();
  } catch (err) {
    showToast(`⚠️ Gagal menghapus user: ${err.message}`);
  }
}

// =============================================================
// TRADING JOURNAL & PORTFOLIO SIMULATOR ENGINE
// =============================================================
let currentJournalFilter = 'ALL';
let currentExitTradeId = null;

function getJournalUserKey() {
  const u = localStorage.getItem('syariah_radar_user') || 'default';
  return u.toLowerCase().replace(/[^a-z0-9_-]/g, '');
}

function getJournalTrades() {
  const key = 'syariah_radar_journal_' + getJournalUserKey();
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn("Failed to load journal trades:", e);
    return [];
  }
}

function saveJournalTrades(trades, forceOverwrite = false) {
  const key = 'syariah_radar_journal_' + getJournalUserKey();
  try {
    localStorage.setItem(key, JSON.stringify(trades));
    updateJournalBadges();
    debouncedSyncUserData(forceOverwrite);
  } catch (e) {
    console.error("Failed to save journal trades:", e);
  }
}

function updateJournalBadges() {
  const trades = getJournalTrades();
  const openCount = trades.filter(t => t.status === 'OPEN').length;

  const desktopBadge = document.getElementById('desktopJournalBadge');
  if (desktopBadge) {
    if (openCount > 0) {
      desktopBadge.innerText = openCount;
      desktopBadge.classList.remove('hidden');
    } else {
      desktopBadge.classList.add('hidden');
    }
  }

  const mobileBadge = document.getElementById('mobileJournalBadge');
  if (mobileBadge) {
    if (openCount > 0) {
      mobileBadge.innerText = openCount;
      mobileBadge.classList.remove('hidden');
    } else {
      mobileBadge.classList.add('hidden');
    }
  }
}

let journalRealtimePrices = {};

function findStockLatestPrice(code) {
  if (!code) return null;
  const upper = code.toUpperCase();
  if (journalRealtimePrices[upper] !== undefined && journalRealtimePrices[upper] !== null) {
    return journalRealtimePrices[upper];
  }
  const inCand = currentCandidates.find(c => c.code && c.code.toUpperCase() === upper);
  if (inCand && inCand.price) return inCand.price;
  const inTracked = allTrackedStocks.find(s => s.code && s.code.toUpperCase() === upper);
  if (inTracked && inTracked.price) return inTracked.price;
  return null;
}

async function refreshJournalPrices() {
  const btn = document.getElementById('journalRefreshBtn');
  const icon = document.getElementById('journalRefreshIcon');
  const trades = getJournalTrades();
  const openTrades = trades.filter(t => t.status === 'OPEN');
  
  const codes = [...new Set(openTrades.map(t => (t.code || '').trim().toUpperCase()))].filter(Boolean);

  if (icon) icon.classList.add('fa-spin');
  if (btn) btn.disabled = true;

  try {
    if (codes.length === 0) {
      await fetchResults(true);
      renderJournalView();
      showToast("Data jurnal diperbarui. Tidak ada posisi terbuka yang perlu di-refresh.");
      return;
    }

    const res = await authFetch('/api/journal/refresh-prices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codes })
    });

    if (!res.ok) throw new Error("Gagal mengambil harga pasar terkini.");
    const data = await res.json();

    if (data.status === 'ok' && data.prices) {
      Object.keys(data.prices).forEach(code => {
        const p = data.prices[code];
        journalRealtimePrices[code] = p;
        const cMatch = currentCandidates.find(c => c.code && c.code.toUpperCase() === code);
        if (cMatch) cMatch.price = p;
        const sMatch = allTrackedStocks.find(s => s.code && s.code.toUpperCase() === code);
        if (sMatch) sMatch.price = p;
      });

      renderJournalView();

      const notice = document.getElementById('journalLastUpdatedNotice');
      const timeEl = document.getElementById('journalLastUpdatedTime');
      if (notice && timeEl) {
        timeEl.innerText = data.updated_at || new Date().toLocaleTimeString('id-ID');
        notice.classList.remove('hidden');
      }

      showToast(`Harga realtime ${Object.keys(data.prices).length} saham di Jurnal berhasil di-update!`);

      // Background update screener
      fetchResults(true).catch(e => console.warn("Background screener refresh:", e));
    } else {
      throw new Error(data.detail || "Gagal memperbarui harga.");
    }
  } catch (err) {
    console.error("Error refreshing journal prices:", err);
    showToast("Gagal memperbarui harga realtime. Coba lagi beberapa saat lagi.");
  } finally {
    if (icon) icon.classList.remove('fa-spin');
    if (btn) btn.disabled = false;
  }
}

function openJournalModal(filter = 'ALL') {
  currentJournalFilter = filter;
  const modal = document.getElementById('journalModal');
  if (modal) {
    modal.classList.remove('hidden');
    setJournalFilter(currentJournalFilter);
    syncUserDataWithServer();
  }
}

function closeJournalModal() {
  const modal = document.getElementById('journalModal');
  if (modal) {
    modal.classList.add('hidden');
    updateMobileNavActive(currentFilter === 'WATCHLIST' ? 'Watchlist' : 'Radar');
  }
}

function setJournalFilter(filter) {
  currentJournalFilter = filter;
  document.querySelectorAll('.journal-pill').forEach(btn => {
    btn.className = 'journal-pill px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-800 text-gray-300 hover:text-white border border-gray-700';
  });
  const activeBtn = document.getElementById('jfilter-' + filter);
  if (activeBtn) {
    activeBtn.className = 'journal-pill px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40';
  }
  renderJournalView();
}

// =============================================================
// SMART TRAILING STOP ASSISTANT (IDX TICK & PROTECTION ENGINE)
// =============================================================
let currentTSModalTrade = null;

function roundToIDXTick(price) {
  const p = Math.round(Number(price) || 0);
  if (p <= 0) return 0;
  let tick = 1;
  if (p < 200) tick = 1;
  else if (p < 500) tick = 2;
  else if (p < 2000) tick = 5;
  else if (p < 5000) tick = 10;
  else tick = 25;

  return Math.round(p / tick) * tick;
}

function calculateSmartTrailingStop(trade, currentPrice) {
  if (!trade || trade.status !== 'OPEN') return null;
  const entry = Number(trade.entryPrice) || 0;
  const curr = Number(currentPrice) || 0;
  if (entry <= 0 || curr <= 0) return null;

  const floatingPct = ((curr - entry) / entry) * 100;
  const bepPrice = roundToIDXTick(entry * 1.008); // 0.8% covers typical buy + sell broker fee
  const halfProfitPrice = roundToIDXTick(entry + (curr - entry) * 0.5);

  let suggestedPrice = bepPrice;
  let badgeText = "🛡️ Amankan Modal (BEP)";
  let statusType = "EARLY_PROFIT";

  // Check if reached or near TP1 (within 98% of TP1)
  if (trade.tp1 && curr >= trade.tp1 * 0.98) {
    if (curr >= trade.tp1) {
      suggestedPrice = Math.max(roundToIDXTick(trade.tp1), roundToIDXTick(entry + (curr - entry) * 0.7));
      badgeText = "🎯 Kunci Profit TP1 / 70%";
    } else {
      suggestedPrice = roundToIDXTick(trade.tp1 * 0.98);
      badgeText = "🎯 Mendekati TP1";
    }
    statusType = "TP1_REACHED";
  } else if (floatingPct >= 5.0) {
    suggestedPrice = halfProfitPrice;
    badgeText = "🔒 Kunci 50% Floating Profit";
    statusType = "HEALTHY_PROFIT";
  } else if (floatingPct >= 2.0 && curr > bepPrice) {
    suggestedPrice = bepPrice;
    badgeText = "🛡️ Amankan Modal (BEP)";
    statusType = "EARLY_PROFIT";
  } else {
    // If floating profit is too small, only show if SL is already above entry
    if (!(trade.stopLoss && trade.stopLoss > entry)) {
      return null;
    }
    suggestedPrice = bepPrice;
    badgeText = "🔒 Pengaman Aktif";
    statusType = "CUSTOM";
  }

  const suggestedPct = entry > 0 ? ((suggestedPrice - entry) / entry) * 100 : 0;
  const shares = (trade.lots || 1) * 100;
  const suggestedProfit = (suggestedPrice - entry) * shares;

  return {
    tradeId: trade.id,
    code: trade.code,
    entryPrice: entry,
    currentPrice: curr,
    currentSL: Number(trade.stopLoss) || 0,
    gainPct: floatingPct,
    bepPrice: bepPrice,
    halfPrice: halfProfitPrice,
    suggestedPrice: suggestedPrice,
    suggestedPct: suggestedPct,
    suggestedProfit: suggestedProfit,
    badgeText: badgeText,
    statusType: statusType,
    isTrailingActive: (Number(trade.stopLoss) || 0) > entry
  };
}

function applyTrailingStop(tradeId, targetPrice) {
  const price = roundToIDXTick(Number(targetPrice) || 0);
  if (!price || price <= 0) {
    showToast("Harga Trailing Stop tidak valid.");
    return;
  }

  const trades = getJournalTrades();
  const trade = trades.find(item => item.id === tradeId);
  if (!trade) {
    showToast("Data transaksi tidak ditemukan.");
    return;
  }

  trade.stopLoss = price;
  saveJournalTrades(trades, true);
  renderJournalView();

  const shares = (trade.lots || 1) * 100;
  const lockedProfit = (price - trade.entryPrice) * shares;
  const lockedPct = ((price - trade.entryPrice) / trade.entryPrice) * 100;

  if (price > trade.entryPrice) {
    showToast(`🔒 Trailing Stop ${trade.code} diaktifkan di Rp ${formatIDR(price)}! Profit minimal terkunci +${formatIDR(lockedProfit)} (+${lockedPct.toFixed(1)}%).`);
  } else if (price === trade.entryPrice) {
    showToast(`🛡️ Stop Loss ${trade.code} digeser ke harga modal (BEP Rp ${formatIDR(price)}). Bebas risiko rugi!`);
  } else {
    showToast(`Batas Stop Loss ${trade.code} disesuaikan ke Rp ${formatIDR(price)}.`);
  }
}

function openCustomTSModal(tradeId) {
  const trades = getJournalTrades();
  const trade = trades.find(item => item.id === tradeId);
  if (!trade) return;

  currentTSModalTrade = trade;
  const modal = document.getElementById('trailingStopModal');
  if (!modal) return;

  const latestPrice = findStockLatestPrice(trade.code) || trade.entryPrice;
  const currentPrice = (trade.status === 'OPEN') ? latestPrice : (trade.exitPrice || trade.entryPrice);
  const ts = calculateSmartTrailingStop(trade, currentPrice);

  document.getElementById('customTSTradeId').value = trade.id;
  document.getElementById('tsModalTicker').innerText = trade.code;
  document.getElementById('tsModalEntryPrice').innerText = 'Rp ' + formatIDR(trade.entryPrice);
  document.getElementById('tsModalCurrentPrice').innerText = 'Rp ' + formatIDR(currentPrice);
  document.getElementById('tsModalCurrentSL').innerText = trade.stopLoss ? ('Rp ' + formatIDR(trade.stopLoss)) : '-';

  const bep = ts ? ts.bepPrice : roundToIDXTick(trade.entryPrice * 1.008);
  const half = ts ? ts.halfPrice : roundToIDXTick(trade.entryPrice + (currentPrice - trade.entryPrice) * 0.5);
  const suggested = ts ? ts.suggestedPrice : half;

  document.getElementById('tsPresetBEPPrice').innerText = 'Rp ' + formatIDR(bep);
  document.getElementById('tsPresetHalfPrice').innerText = 'Rp ' + formatIDR(half);
  document.getElementById('tsPresetSuggestedPrice').innerText = 'Rp ' + formatIDR(suggested);

  const defaultVal = suggested > 0 ? suggested : (trade.stopLoss || bep);
  const inputEl = document.getElementById('customTSInput');
  inputEl.value = defaultVal;

  calcCustomTSPreview();
  modal.classList.remove('hidden');
}

function closeCustomTSModal() {
  const modal = document.getElementById('trailingStopModal');
  if (modal) modal.classList.add('hidden');
  currentTSModalTrade = null;
}

function selectTSPreset(type) {
  if (!currentTSModalTrade) return;
  const trade = currentTSModalTrade;
  const latestPrice = findStockLatestPrice(trade.code) || trade.entryPrice;
  const currentPrice = (trade.status === 'OPEN') ? latestPrice : (trade.exitPrice || trade.entryPrice);
  const ts = calculateSmartTrailingStop(trade, currentPrice);

  let targetPrice = 0;
  if (type === 'bep') {
    targetPrice = ts ? ts.bepPrice : roundToIDXTick(trade.entryPrice * 1.008);
  } else if (type === 'half') {
    targetPrice = ts ? ts.halfPrice : roundToIDXTick(trade.entryPrice + (currentPrice - trade.entryPrice) * 0.5);
  } else if (type === 'suggested') {
    targetPrice = ts ? ts.suggestedPrice : roundToIDXTick(trade.entryPrice + (currentPrice - trade.entryPrice) * 0.5);
  }

  if (targetPrice > 0) {
    document.getElementById('customTSInput').value = targetPrice;
    calcCustomTSPreview();
  }
}

function calcCustomTSPreview() {
  if (!currentTSModalTrade) return;
  const trade = currentTSModalTrade;
  const inputVal = Number(document.getElementById('customTSInput').value) || 0;
  const previewText = document.getElementById('customTSPreviewText');
  if (!previewText) return;

  const rounded = roundToIDXTick(inputVal);
  const shares = (trade.lots || 1) * 100;
  const diff = rounded - trade.entryPrice;
  const diffPct = trade.entryPrice > 0 ? (diff / trade.entryPrice) * 100 : 0;
  const diffMoney = diff * shares;

  if (diff > 0) {
    previewText.className = 'text-xs font-bold font-mono text-emerald-400 block';
    previewText.innerText = `🔒 Terkunci Profit Minimum: +${formatIDR(diffMoney)} (+${diffPct.toFixed(1)}%)`;
  } else if (diff === 0) {
    previewText.className = 'text-xs font-bold font-mono text-blue-400 block';
    previewText.innerText = `🛡️ Break-Even Point (Balik Modal)`;
  } else {
    previewText.className = 'text-xs font-bold font-mono text-red-400 block';
    previewText.innerText = `⚠️ Di Bawah Modal (Risiko: ${formatIDR(diffMoney)} / ${diffPct.toFixed(1)}%)`;
  }
}

function handleCustomTSSubmit(event) {
  event.preventDefault();
  const tradeId = document.getElementById('customTSTradeId').value;
  const inputVal = Number(document.getElementById('customTSInput').value) || 0;
  const validPrice = roundToIDXTick(inputVal);

  if (!validPrice || validPrice <= 0) {
    showToast("Masukkan harga Trailing Stop yang valid.");
    return;
  }

  applyTrailingStop(tradeId, validPrice);
  closeCustomTSModal();
}

function renderJournalView() {
  const container = document.getElementById('journalTradesList');
  if (!container) return;

  const trades = getJournalTrades();

  // Sort trades: OPEN trades first (newest to oldest), then CLOSED trades (newest to oldest)
  trades.sort((a, b) => {
    if (a.status === 'OPEN' && b.status !== 'OPEN') return -1;
    if (a.status !== 'OPEN' && b.status === 'OPEN') return 1;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  // Calculate Metrics
  let activeCapital = 0;
  let activeCount = 0;
  let totalFloatingPnL = 0;
  let totalRealizedPnL = 0;
  let closedWins = 0;
  let closedLosses = 0;
  let totalWinPctSum = 0;
  let totalLossPctSum = 0;

  trades.forEach(t => {
    const latestPrice = findStockLatestPrice(t.code) || t.entryPrice;
    const currentPrice = (t.status === 'OPEN') ? latestPrice : (t.exitPrice || t.entryPrice);
    const shares = t.lots * 100;
    const capital = t.entryPrice * shares;

    if (t.status === 'OPEN') {
      activeCapital += capital;
      activeCount++;
      const floating = (currentPrice - t.entryPrice) * shares;
      totalFloatingPnL += floating;
    } else {
      const pnl = Number(t.realizedPnl || 0);
      totalRealizedPnL += pnl;
      const pnlPct = Number(t.realizedPnlPct || 0);
      if (pnl >= 0) {
        closedWins++;
        totalWinPctSum += pnlPct;
      } else {
        closedLosses++;
        totalLossPctSum += Math.abs(pnlPct);
      }
    }
  });

  const totalClosed = closedWins + closedLosses;
  const winRate = totalClosed > 0 ? ((closedWins / totalClosed) * 100).toFixed(1) : '0.0';
  const floatingPct = activeCapital > 0 ? ((totalFloatingPnL / activeCapital) * 100).toFixed(2) : '0.00';

  // Average Win vs Average Loss for Risk-Reward
  const avgWin = closedWins > 0 ? (totalWinPctSum / closedWins) : 0;
  const avgLoss = closedLosses > 0 ? (totalLossPctSum / closedLosses) : 0;
  const rrRatioStr = (avgLoss > 0) ? `Avg Win +${avgWin.toFixed(1)}% vs -${avgLoss.toFixed(1)}% (1 : ${(avgWin/avgLoss).toFixed(1)})` : `${closedWins} Win / ${closedLosses} Loss`;

  // Update KPI UI
  document.getElementById('journalStatActiveCapital').innerText = formatIDR(activeCapital);
  document.getElementById('journalStatActiveCount').innerText = `${activeCount} Saham Berjalan`;

  const floatEl = document.getElementById('journalStatFloatingPnL');
  const floatPctEl = document.getElementById('journalStatFloatingPct');
  if (totalFloatingPnL > 0) {
    floatEl.className = 'text-xs sm:text-sm font-bold text-emerald-400 font-mono block';
    floatEl.innerText = `+${formatIDR(totalFloatingPnL)}`;
    floatPctEl.className = 'text-[10px] text-emerald-400 font-semibold block';
    floatPctEl.innerText = `+${floatingPct}%`;
  } else if (totalFloatingPnL < 0) {
    floatEl.className = 'text-xs sm:text-sm font-bold text-red-400 font-mono block';
    floatEl.innerText = formatIDR(totalFloatingPnL);
    floatPctEl.className = 'text-[10px] text-red-400 font-semibold block';
    floatPctEl.innerText = `${floatingPct}%`;
  } else {
    floatEl.className = 'text-xs sm:text-sm font-bold text-gray-300 font-mono block';
    floatEl.innerText = 'Rp 0';
    floatPctEl.className = 'text-[10px] text-gray-500 block';
    floatPctEl.innerText = '0.00%';
  }

  const realEl = document.getElementById('journalStatRealizedPnL');
  const realCountEl = document.getElementById('journalStatClosedCount');
  if (totalRealizedPnL > 0) {
    realEl.className = 'text-xs sm:text-sm font-bold text-emerald-400 font-mono block';
    realEl.innerText = `+${formatIDR(totalRealizedPnL)}`;
  } else if (totalRealizedPnL < 0) {
    realEl.className = 'text-xs sm:text-sm font-bold text-red-400 font-mono block';
    realEl.innerText = formatIDR(totalRealizedPnL);
  } else {
    realEl.className = 'text-xs sm:text-sm font-bold text-gray-300 font-mono block';
    realEl.innerText = 'Rp 0';
  }
  realCountEl.innerText = `${totalClosed} Trade Selesai`;

  document.getElementById('journalStatWinRate').innerText = `${winRate}%`;
  document.getElementById('journalStatRatio').innerText = rrRatioStr;

  // Update Filter Counters
  const countAll = trades.length;
  const countOpen = trades.filter(t => t.status === 'OPEN').length;
  const countClosed = totalClosed;
  const countWin = closedWins;
  const countLoss = closedLosses;

  document.getElementById('jcount-ALL').innerText = countAll;
  document.getElementById('jcount-OPEN').innerText = countOpen;
  document.getElementById('jcount-CLOSED').innerText = countClosed;
  document.getElementById('jcount-WIN').innerText = countWin;
  document.getElementById('jcount-LOSS').innerText = countLoss;

  // Filter Trades
  let filtered = trades;
  if (currentJournalFilter === 'OPEN') {
    filtered = filtered.filter(t => t.status === 'OPEN');
  } else if (currentJournalFilter === 'CLOSED') {
    filtered = filtered.filter(t => t.status !== 'OPEN');
  } else if (currentJournalFilter === 'WIN') {
    filtered = filtered.filter(t => t.status !== 'OPEN' && Number(t.realizedPnl || 0) >= 0);
  } else if (currentJournalFilter === 'LOSS') {
    filtered = filtered.filter(t => t.status !== 'OPEN' && Number(t.realizedPnl || 0) < 0);
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 bg-[#0e1117] border border-gray-800 rounded-2xl p-6 text-gray-400 space-y-3">
        <div class="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto text-xl border border-emerald-500/20">
          <i class="fa-solid fa-book-open"></i>
        </div>
        <h4 class="text-sm font-bold text-white">Belum Ada Catatan Transaksi di Kategori Ini</h4>
        <p class="text-xs text-gray-500 max-w-sm mx-auto">
          Catat rencana transaksi saham syariah Anda untuk mengevaluasi akurasi, kedisiplinan cut loss, dan pencapaian target profit.
        </p>
        <button onclick="openTradeEntryModal()" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition inline-flex items-center gap-2 shadow">
          <i class="fa-solid fa-plus"></i>
          <span>Catat Transaksi Sekarang</span>
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(t => {
    const isClosed = (t.status !== 'OPEN');
    const latestPrice = findStockLatestPrice(t.code) || t.entryPrice;
    const currentPrice = isClosed ? (t.exitPrice || t.entryPrice) : latestPrice;
    const shares = t.lots * 100;
    const capital = t.entryPrice * shares;

    let pnlAmount = 0;
    let pnlPct = 0;
    let statusBadge = '';
    const ts = (!isClosed) ? calculateSmartTrailingStop(t, currentPrice) : null;
    const isTrailingActive = !isClosed && (t.stopLoss && t.stopLoss > t.entryPrice);

    if (!isClosed) {
      pnlAmount = (currentPrice - t.entryPrice) * shares;
      pnlPct = ((currentPrice - t.entryPrice) / t.entryPrice) * 100;

      // Detection of TP1, TP2, SL
      if (t.tp2 && currentPrice >= t.tp2) {
        statusBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1"><i class="fa-solid fa-rocket text-purple-400"></i> Target TP2 Tercapai!</span>';
      } else if (t.tp1 && currentPrice >= t.tp1) {
        statusBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1"><i class="fa-solid fa-bullseye text-emerald-400"></i> Target TP1 Tercapai!</span>';
      } else if (t.stopLoss && currentPrice <= t.stopLoss) {
        statusBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-300 border border-red-500/30 flex items-center gap-1"><i class="fa-solid fa-triangle-exclamation text-red-400"></i> Kena Stop Loss!</span>';
      } else if (pnlAmount > 0) {
        statusBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1"><i class="fa-solid fa-arrow-trend-up text-emerald-400"></i> Floating Profit</span>';
      } else if (pnlAmount < 0) {
        statusBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20 flex items-center gap-1"><i class="fa-solid fa-arrow-trend-down text-red-400"></i> Floating Loss</span>';
      } else {
        statusBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-medium bg-gray-800 text-gray-300 border border-gray-700 flex items-center gap-1"><i class="fa-solid fa-circle text-[8px] text-blue-400"></i> Posisi Aktif (Hold)</span>';
      }

      if (isTrailingActive) {
        statusBadge += ` <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1"><i class="fa-solid fa-lock text-emerald-400"></i> Terkunci Cuan</span>`;
      }
    } else {
      pnlAmount = Number(t.realizedPnl || 0);
      pnlPct = Number(t.realizedPnlPct || 0);
      if (pnlAmount >= 0) {
        statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1"><i class="fa-solid fa-trophy text-amber-400"></i> SELESAI: WIN (+${pnlPct.toFixed(1)}%)</span>`;
      } else {
        statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-300 border border-red-500/30 flex items-center gap-1"><i class="fa-solid fa-shield-xmark text-red-400"></i> SELESAI: CUT LOSS (${pnlPct.toFixed(1)}%)</span>`;
      }
    }

    const pnlSign = pnlAmount >= 0 ? '+' : '';
    const pnlColorClass = pnlAmount > 0 ? 'text-emerald-400' : (pnlAmount < 0 ? 'text-red-400' : 'text-gray-300');
    const pnlBgClass = pnlAmount > 0 ? 'bg-emerald-500/10 border-emerald-500/20' : (pnlAmount < 0 ? 'bg-red-500/10 border-red-500/20' : 'bg-gray-800/40 border-gray-700');

    return `
      <div class="journal-trade-card bg-[#0e1117] border border-gray-800 rounded-2xl p-3.5 space-y-3 shadow-sm transition">
        
        <!-- CARD HEADER -->
        <div class="flex items-start justify-between gap-2 flex-wrap">
          <div class="space-y-0.5">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-base font-extrabold text-white tracking-wide">${t.code}</span>
              ${statusBadge}
              <span class="text-[10px] text-gray-500">• Beli: ${t.entryDate || '-'}</span>
              ${isClosed ? `<span class="text-[10px] text-gray-500">• Jual: ${t.exitDate || '-'}</span>` : ''}
            </div>
            <p class="text-xs text-gray-400">${t.name || 'Saham Syariah'}</p>
          </div>

          <!-- PNL BADGE -->
          <div class="text-right px-2.5 py-1 rounded-xl border ${pnlBgClass}">
            <span class="text-[10px] text-gray-400 block">${isClosed ? 'Realized P&L' : 'Floating P&L'}</span>
            <span class="text-xs md:text-sm font-bold font-mono ${pnlColorClass} block">
              ${pnlSign}${formatIDR(pnlAmount)}
            </span>
            <span class="text-[10px] font-bold font-mono ${pnlColorClass} block">
              (${pnlSign}${pnlPct.toFixed(2)}%)
            </span>
          </div>
        </div>

        <!-- DETAILS GRID -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-[#161b22] p-2.5 rounded-xl border border-gray-800/80 text-[11px] font-mono">
          <div>
            <span class="text-[10px] text-gray-500 block">Harga Beli (Entry)</span>
            <span class="font-bold text-white">${formatIDR(t.entryPrice)}</span>
          </div>
          <div>
            <span class="text-[10px] text-gray-500 block">Jumlah Posisi</span>
            <span class="font-bold text-white">${t.lots} Lot (${shares.toLocaleString('id-ID')} Lbr)</span>
          </div>
          <div>
            <span class="text-[10px] text-gray-500 block">Modal Pembelian</span>
            <span class="font-bold text-white">${formatIDR(capital)}</span>
          </div>
          <div>
            <span class="text-[10px] text-gray-500 block">${isClosed ? 'Harga Realisasi Jual' : 'Harga Pasar Terkini'}</span>
            <span class="font-bold ${isClosed ? 'text-amber-300' : 'text-blue-300'}">${formatIDR(currentPrice)}</span>
          </div>
        </div>

        <!-- TARGET TRADING PLAN STRIP -->
        <div class="flex items-center justify-between text-[10px] md:text-[11px] px-2 py-1.5 rounded-lg bg-gray-900/60 border border-gray-800 text-gray-400 flex-wrap gap-1">
          <span class="flex items-center gap-1">
            ${isTrailingActive ? `
              <span class="text-emerald-400 font-bold flex items-center gap-1"><i class="fa-solid fa-lock text-[9px]"></i> Trailing Stop:</span>
              <span class="text-emerald-300 font-mono font-bold">${formatIDR(t.stopLoss)} (+${(((t.stopLoss - t.entryPrice) / t.entryPrice) * 100).toFixed(1)}%)</span>
            ` : `
              <span class="text-red-400 font-semibold">Stop Loss:</span>
              <span class="text-white font-mono">${t.stopLoss ? formatIDR(t.stopLoss) : '-'}</span>
            `}
          </span>
          <span class="flex items-center gap-1">
            <span class="text-emerald-400 font-semibold">Target TP1:</span>
            <span class="text-white font-mono">${t.tp1 ? formatIDR(t.tp1) : '-'}</span>
          </span>
          <span class="flex items-center gap-1">
            <span class="text-emerald-400 font-semibold">Target TP2:</span>
            <span class="text-white font-mono">${t.tp2 ? formatIDR(t.tp2) : '-'}</span>
          </span>
        </div>

        <!-- SMART TRAILING STOP ASSISTANT CARD -->
        ${ts ? `
          <div class="p-2.5 sm:p-3 rounded-xl bg-gradient-to-r from-emerald-950/30 via-[#111c1d] to-[#0e1626] border border-emerald-500/30 space-y-2">
            <div class="flex items-center justify-between flex-wrap gap-2">
              <div class="flex items-center gap-2">
                <span class="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs shrink-0">
                  <i class="fa-solid fa-shield-halved"></i>
                </span>
                <div>
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="text-xs font-bold text-white">Smart Trailing Stop</span>
                    <span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">${ts.badgeText}</span>
                  </div>
                  <p class="text-[10px] text-gray-400 leading-tight">
                    ${isTrailingActive 
                      ? `Pengaman cuan aktif di <span class="text-emerald-400 font-mono font-bold">Rp ${formatIDR(t.stopLoss)}</span> (Minimal aman +${formatIDR((t.stopLoss - t.entryPrice) * shares)}).`
                      : `Saham cuan <span class="text-emerald-400 font-mono font-bold">+${ts.gainPct.toFixed(1)}%</span>. Kunci cuan agar tidak berubah minus.`
                    }
                  </p>
                </div>
              </div>
              <button onclick="openCustomTSModal('${t.id}')" class="px-2 py-1 rounded-lg bg-gray-800/90 hover:bg-gray-700 text-gray-300 hover:text-white text-[10px] font-medium border border-gray-700 transition flex items-center gap-1">
                <i class="fa-solid fa-sliders text-emerald-400 text-[10px]"></i>
                <span>Sesuaikan</span>
              </button>
            </div>

            <!-- ONE-CLICK BUTTONS -->
            <div class="flex items-center gap-1.5 flex-wrap text-xs pt-0.5">
              ${ts.suggestedPrice > (t.stopLoss || 0) ? `
                <button onclick="applyTrailingStop('${t.id}', ${ts.suggestedPrice})" class="flex-1 min-w-[150px] py-1.5 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] transition flex items-center justify-center gap-1.5 shadow">
                  <i class="fa-solid fa-lock text-[10px]"></i>
                  <span>Kunci di Rp ${formatIDR(ts.suggestedPrice)} (+${ts.suggestedPct.toFixed(1)}%)</span>
                </button>
              ` : `
                <span class="text-[10px] font-bold text-emerald-400 flex items-center gap-1 px-1">
                  <i class="fa-solid fa-check"></i> Trailing Stop Terkunci Optimal di Rp ${formatIDR(t.stopLoss)}
                </span>
              `}

              ${ts.bepPrice > (t.stopLoss || 0) && ts.bepPrice !== ts.suggestedPrice ? `
                <button onclick="applyTrailingStop('${t.id}', ${ts.bepPrice})" class="py-1.5 px-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700 font-medium text-[11px] transition flex items-center justify-center gap-1">
                  <i class="fa-solid fa-shield text-gray-400 text-[10px]"></i>
                  <span>BEP Rp ${formatIDR(ts.bepPrice)}</span>
                </button>
              ` : ''}
            </div>
          </div>
        ` : ''}

        <!-- NOTES ROW -->
        ${t.notes ? `
          <div class="text-[11px] text-gray-400 italic bg-gray-900/40 px-2.5 py-1 rounded-lg border border-gray-800/60 flex items-center gap-1.5">
            <i class="fa-regular fa-comment-dots text-emerald-400"></i>
            <span>${t.notes}</span>
          </div>
        ` : ''}

        <!-- ACTIONS ROW -->
        <div class="flex items-center justify-between pt-1 border-t border-gray-800/80 text-xs">
          <div>
            ${!isClosed ? `
              <button onclick="openTradeExitModal('${t.id}')" class="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition flex items-center gap-1.5 shadow">
                <i class="fa-solid fa-hand-holding-dollar"></i>
                <span>Tutup / Jual Posisi</span>
              </button>
            ` : `
              <button onclick="reopenTrade('${t.id}')" class="px-2.5 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-[11px] font-medium border border-gray-700 transition flex items-center gap-1">
                <i class="fa-solid fa-rotate-left"></i>
                <span>Buka Kembali Posisi</span>
              </button>
            `}
          </div>

          <div class="flex items-center gap-1.5">
            <button onclick="openTradeEntryModal('${t.id}')" class="px-2 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs border border-gray-700 transition" title="Edit Posisi">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button onclick="deleteTrade('${t.id}')" class="px-2 py-1 rounded-lg bg-gray-800 hover:bg-red-500/20 text-gray-400 hover:text-red-400 text-xs border border-gray-700 transition" title="Hapus Posisi">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>

      </div>
    `;
  }).join('');
}

function openTradeEntryModal(tradeId = null) {
  const modal = document.getElementById('tradeEntryModal');
  if (!modal) return;

  const form = document.getElementById('tradeEntryForm');
  if (form) form.reset();

  document.getElementById('entryTradeId').value = tradeId || '';
  const title = document.getElementById('tradeEntryModalTitle');
  const btnText = document.getElementById('entrySubmitBtnText');

  if (tradeId) {
    const trades = getJournalTrades();
    const t = trades.find(item => item.id === tradeId);
    if (t) {
      document.getElementById('entryTicker').value = t.code;
      document.getElementById('entryName').value = t.name || '';
      document.getElementById('entryDate').value = t.entryDate || '';
      document.getElementById('entryPrice').value = t.entryPrice || '';
      document.getElementById('entryLots').value = t.lots || 1;
      document.getElementById('entrySL').value = t.stopLoss || '';
      document.getElementById('entryTP1').value = t.tp1 || '';
      document.getElementById('entryTP2').value = t.tp2 || '';
      document.getElementById('entryNotes').value = t.notes || '';
      calcEntryModalCapital();

      if (title) title.innerText = `Edit Posisi: ${t.code}`;
      if (btnText) btnText.innerText = `Perbarui Posisi ${t.code}`;
    }
  } else {
    document.getElementById('entryDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('entryLots').value = 10;
    document.getElementById('entryCapitalAllocated').value = 'Rp 0';
    if (title) title.innerText = 'Catat Posisi Beli Baru';
    if (btnText) btnText.innerText = 'Simpan ke Jurnal Trading';
  }

  modal.classList.remove('hidden');
}

function closeTradeEntryModal() {
  const modal = document.getElementById('tradeEntryModal');
  if (modal) modal.classList.add('hidden');
}

function openAddTradeModalFromStock(stock) {
  const s = stock || currentOpenStock;
  if (!s) return;
  closeModal(); // close detail modal if open
  openTradeEntryModal();

  document.getElementById('entryTradeId').value = '';
  document.getElementById('entryTicker').value = s.code;
  document.getElementById('entryName').value = s.name || '';
  document.getElementById('entryDate').value = new Date().toISOString().split('T')[0];

  const plan = s.trading_plan || {};
  const entryPrice = plan.entry || s.price;
  document.getElementById('entryPrice').value = entryPrice;
  document.getElementById('entrySL').value = plan.stop_loss || '';
  document.getElementById('entryTP1').value = plan.tp1 || '';
  document.getElementById('entryTP2').value = plan.tp2 || '';

  // Get lots from modal calculator if set, otherwise default 10
  const calcLotsEl = document.getElementById('calcLots');
  let recLots = 10;
  if (calcLotsEl && calcLotsEl.innerText) {
    const parsed = parseInt(calcLotsEl.innerText.replace(/[^0-9]/g, ''));
    if (!isNaN(parsed) && parsed > 0) recLots = parsed;
  }
  document.getElementById('entryLots').value = recLots;
  calcEntryModalCapital();

  const setupText = s.setup_type ? s.setup_type.replace(/_/g, ' ') : 'Sinyal Radar Saham Syariah';
  document.getElementById('entryNotes').value = `${setupText} • Skor: ${s.score}/100`;

  const title = document.getElementById('tradeEntryModalTitle');
  const btnText = document.getElementById('entrySubmitBtnText');
  if (title) title.innerText = `Catat Posisi Beli: ${s.code}`;
  if (btnText) btnText.innerText = `Simpan Posisi ${s.code} ke Jurnal`;
}

function quickAddStockToJournal(code) {
  const upper = (code || '').toUpperCase();
  const s = currentCandidates.find(c => c.code.toUpperCase() === upper) || allTrackedStocks.find(c => c.code.toUpperCase() === upper);
  if (s) {
    openAddTradeModalFromStock(s);
  } else {
    openTradeEntryModal();
    document.getElementById('entryTicker').value = upper;
    handleEntryTickerChange();
  }
}

function handleEntryTickerChange() {
  const ticker = document.getElementById('entryTicker').value.trim().toUpperCase();
  if (!ticker) return;

  const stock = currentCandidates.find(c => c.code.toUpperCase() === ticker) || allTrackedStocks.find(s => s.code.toUpperCase() === ticker);
  if (stock) {
    const nameEl = document.getElementById('entryName');
    if (nameEl && !nameEl.value) nameEl.value = stock.name || '';

    const priceEl = document.getElementById('entryPrice');
    if (priceEl && !priceEl.value) {
      priceEl.value = (stock.trading_plan && stock.trading_plan.entry) ? stock.trading_plan.entry : stock.price;
      calcEntryModalCapital();
    }

    const slEl = document.getElementById('entrySL');
    if (slEl && !slEl.value && stock.trading_plan && stock.trading_plan.stop_loss) {
      slEl.value = stock.trading_plan.stop_loss;
    }

    const tp1El = document.getElementById('entryTP1');
    if (tp1El && !tp1El.value && stock.trading_plan && stock.trading_plan.tp1) {
      tp1El.value = stock.trading_plan.tp1;
    }

    const tp2El = document.getElementById('entryTP2');
    if (tp2El && !tp2El.value && stock.trading_plan && stock.trading_plan.tp2) {
      tp2El.value = stock.trading_plan.tp2;
    }
  }
}

function calcEntryModalCapital() {
  const price = Number(document.getElementById('entryPrice').value) || 0;
  const lots = Number(document.getElementById('entryLots').value) || 0;
  const total = price * lots * 100;
  const display = document.getElementById('entryCapitalAllocated');
  if (display) display.value = formatIDR(total);
}

function handleTradeEntrySubmit(event) {
  event.preventDefault();
  const tradeId = document.getElementById('entryTradeId').value;
  const code = document.getElementById('entryTicker').value.trim().toUpperCase();
  const name = document.getElementById('entryName').value.trim() || 'Saham Syariah';
  const entryDate = document.getElementById('entryDate').value;
  const entryPrice = Number(document.getElementById('entryPrice').value);
  const lots = Number(document.getElementById('entryLots').value);
  const stopLoss = Number(document.getElementById('entrySL').value) || null;
  const tp1 = Number(document.getElementById('entryTP1').value) || null;
  const tp2 = Number(document.getElementById('entryTP2').value) || null;
  const notes = document.getElementById('entryNotes').value.trim();

  if (!code || !entryPrice || !lots) {
    showToast('⚠️ Harap isi ticker, harga beli, dan jumlah lot.');
    return;
  }

  const trades = getJournalTrades();

  if (tradeId) {
    // Edit existing trade
    const idx = trades.findIndex(t => t.id === tradeId);
    if (idx !== -1) {
      trades[idx].code = code;
      trades[idx].name = name;
      trades[idx].entryDate = entryDate;
      trades[idx].entryPrice = entryPrice;
      trades[idx].lots = lots;
      trades[idx].stopLoss = stopLoss;
      trades[idx].tp1 = tp1;
      trades[idx].tp2 = tp2;
      trades[idx].notes = notes;
      trades[idx].updatedAt = Date.now();

      // Recalculate realized if closed
      if (trades[idx].status !== 'OPEN' && trades[idx].exitPrice) {
        const shares = lots * 100;
        trades[idx].realizedPnl = (trades[idx].exitPrice - entryPrice) * shares;
        trades[idx].realizedPnlPct = ((trades[idx].exitPrice - entryPrice) / entryPrice) * 100;
      }
      showToast(`✅ Posisi ${code} berhasil diperbarui!`);
    }
  } else {
    // Add new trade
    const newTrade = {
      id: 'trade_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      code,
      name,
      entryDate: entryDate || new Date().toISOString().split('T')[0],
      entryPrice,
      lots,
      stopLoss,
      tp1,
      tp2,
      notes,
      status: 'OPEN',
      exitDate: null,
      exitPrice: null,
      realizedPnl: 0,
      realizedPnlPct: 0,
      createdAt: Date.now()
    };
    trades.push(newTrade);
    showToast(`✅ Posisi ${code} (${lots} Lot) berhasil dicatat ke Jurnal!`);
  }

  saveJournalTrades(trades);
  closeTradeEntryModal();
  openJournalModal('OPEN');
}

function openTradeExitModal(tradeId) {
  currentExitTradeId = tradeId;
  const trades = getJournalTrades();
  const t = trades.find(item => item.id === tradeId);
  if (!t) return;

  const modal = document.getElementById('tradeExitModal');
  if (!modal) return;

  document.getElementById('exitTradeId').value = tradeId;
  document.getElementById('exitTickerSub').innerText = `${t.code} • ${t.lots} Lot (${t.lots*100} Lbr) • Beli di ${formatIDR(t.entryPrice)}`;

  const today = new Date().toISOString().split('T')[0];
  document.getElementById('exitDateInput').value = today;

  const latestPrice = findStockLatestPrice(t.code) || t.entryPrice;

  // Set quick labels
  const labelTP1 = document.getElementById('exitLabelTP1');
  const labelTP2 = document.getElementById('exitLabelTP2');
  const labelMarket = document.getElementById('exitLabelMarket');
  const labelSL = document.getElementById('exitLabelSL');

  if (labelTP1) labelTP1.innerText = t.tp1 ? formatIDR(t.tp1) : '-';
  if (labelTP2) labelTP2.innerText = t.tp2 ? formatIDR(t.tp2) : '-';
  if (labelMarket) labelMarket.innerText = formatIDR(latestPrice);
  if (labelSL) labelSL.innerText = t.stopLoss ? formatIDR(t.stopLoss) : '-';

  // Default exit price to current market price or TP1
  const defaultExitPrice = (t.tp1 && latestPrice >= t.tp1) ? t.tp1 : latestPrice;
  document.getElementById('exitPriceInput').value = defaultExitPrice;

  calcExitModalPnL();
  modal.classList.remove('hidden');
}

function closeTradeExitModal() {
  const modal = document.getElementById('tradeExitModal');
  if (modal) modal.classList.add('hidden');
  currentExitTradeId = null;
}

function selectQuickExitPrice(type) {
  if (!currentExitTradeId) return;
  const trades = getJournalTrades();
  const t = trades.find(item => item.id === currentExitTradeId);
  if (!t) return;

  const input = document.getElementById('exitPriceInput');
  const latestPrice = findStockLatestPrice(t.code) || t.entryPrice;

  if (type === 'tp1' && t.tp1) {
    input.value = t.tp1;
  } else if (type === 'tp2' && t.tp2) {
    input.value = t.tp2;
  } else if (type === 'market') {
    input.value = latestPrice;
  } else if (type === 'sl' && t.stopLoss) {
    input.value = t.stopLoss;
  }

  calcExitModalPnL();
}

function calcExitModalPnL() {
  if (!currentExitTradeId) return;
  const trades = getJournalTrades();
  const t = trades.find(item => item.id === currentExitTradeId);
  if (!t) return;

  const exitPrice = Number(document.getElementById('exitPriceInput').value) || 0;
  const shares = t.lots * 100;
  const pnl = (exitPrice - t.entryPrice) * shares;
  const pnlPct = t.entryPrice > 0 ? ((exitPrice - t.entryPrice) / t.entryPrice) * 100 : 0;

  const amountEl = document.getElementById('exitPnLAmount');
  const pctEl = document.getElementById('exitPnLPct');
  const pnlBox = document.getElementById('exitPnLBox');

  const sign = pnl >= 0 ? '+' : '';
  amountEl.innerText = `${sign}${formatIDR(pnl)}`;
  pctEl.innerText = `(${sign}${pnlPct.toFixed(2)}%)`;

  if (pnl > 0) {
    amountEl.className = 'text-base font-extrabold font-mono text-emerald-400 block';
    pctEl.className = 'text-xs font-bold text-emerald-400 block';
    pnlBox.className = 'p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center space-y-0.5';
  } else if (pnl < 0) {
    amountEl.className = 'text-base font-extrabold font-mono text-red-400 block';
    pctEl.className = 'text-xs font-bold text-red-400 block';
    pnlBox.className = 'p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-center space-y-0.5';
  } else {
    amountEl.className = 'text-base font-extrabold font-mono text-gray-300 block';
    pctEl.className = 'text-xs font-bold text-gray-400 block';
    pnlBox.className = 'p-3 rounded-xl bg-[#0e1117] border border-gray-800 text-center space-y-0.5';
  }
}

function handleTradeExitSubmit(event) {
  event.preventDefault();
  if (!currentExitTradeId) return;

  const trades = getJournalTrades();
  const idx = trades.findIndex(item => item.id === currentExitTradeId);
  if (idx === -1) return;

  const exitPrice = Number(document.getElementById('exitPriceInput').value);
  const exitDate = document.getElementById('exitDateInput').value;

  if (!exitPrice) {
    showToast('⚠️ Harap masukkan harga realisasi jual.');
    return;
  }

  const t = trades[idx];
  const shares = t.lots * 100;
  const pnl = (exitPrice - t.entryPrice) * shares;
  const pnlPct = ((exitPrice - t.entryPrice) / t.entryPrice) * 100;

  t.exitPrice = exitPrice;
  t.exitDate = exitDate || new Date().toISOString().split('T')[0];
  t.realizedPnl = pnl;
  t.realizedPnlPct = pnlPct;
  t.status = (pnl >= 0) ? 'WIN' : 'LOSS';
  t.closedAt = Date.now();

  saveJournalTrades(trades);
  closeTradeExitModal();
  renderJournalView();

  if (pnl >= 0) {
    showToast(`🎉 Selamat! Realisasi Profit ${t.code}: +${formatIDR(pnl)} (+${pnlPct.toFixed(1)}%)`);
  } else {
    showToast(`🛡️ Posisi ${t.code} ditutup. Disiplin cut loss menjaga modal trading Anda.`);
  }
}

function reopenTrade(tradeId) {
  const trades = getJournalTrades();
  const t = trades.find(item => item.id === tradeId);
  if (!t) return;

  t.status = 'OPEN';
  t.exitDate = null;
  t.exitPrice = null;
  t.realizedPnl = 0;
  t.realizedPnlPct = 0;

  saveJournalTrades(trades);
  showToast(`Posisi ${t.code} dibuka kembali menjadi posisi aktif.`);
  renderJournalView();
}

function deleteTrade(tradeId) {
  const trades = getJournalTrades();
  const t = trades.find(item => item.id === tradeId);
  const name = t ? t.code : 'ini';

  if (!confirm(`Hapus catatan transaksi ${name} dari jurnal?`)) return;

  const updated = trades.filter(item => item.id !== tradeId);
  saveJournalTrades(updated, true);
  showToast(`Catatan ${name} telah dihapus.`);
  renderJournalView();
}

function exportJournalCSV() {
  const trades = getJournalTrades();
  if (trades.length === 0) {
    showToast('⚠️ Belum ada catatan transaksi di jurnal untuk diekspor.');
    return;
  }

  let csv = 'ID,Kode,Nama,Status,Tanggal Beli,Harga Beli,Jumlah Lot,Total Lembar,Total Modal,Stop Loss,Target TP1,Target TP2,Tanggal Jual,Harga Jual,Realized PnL (Rp),Realized PnL (%),Catatan\n';

  trades.forEach(t => {
    const shares = t.lots * 100;
    const capital = t.entryPrice * shares;
    const row = [
      t.id,
      t.code,
      `"${(t.name || '').replace(/"/g, '""')}"`,
      t.status,
      t.entryDate || '',
      t.entryPrice,
      t.lots,
      shares,
      capital,
      t.stopLoss || '',
      t.tp1 || '',
      t.tp2 || '',
      t.exitDate || '',
      t.exitPrice || '',
      t.realizedPnl || 0,
      (t.realizedPnlPct || 0).toFixed(2),
      `"${(t.notes || '').replace(/"/g, '""')}"`
    ];
    csv += row.join(',') + '\n';
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateStr = new Date().toISOString().split('T')[0];
  a.href = url;
  a.download = `Jurnal_Trading_Syariah_${getJournalUserKey()}_${dateStr}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`✅ File Jurnal (${a.download}) berhasil diunduh!`);
}

// =============================================================
// SEKTOR HEATMAP & ROTASI SEKTOR SYARIAH (TREEMAP) ENGINE
// =============================================================
let currentMainView = 'list'; // 'list' | 'heatmap'

const SECTOR_ICONS = {
  'Energy': '⚡',
  'Basic Materials': '🏭',
  'Industrials': '🏗️',
  'Consumer Non-Cyclical': '🛒',
  'Consumer Cyclical': '🚗',
  'Healthcare': '💊',
  'Financials': '🏛️',
  'Properties & Real Estate': '🏢',
  'Technology': '💻',
  'Infrastructures': '📡',
  'Transportation & Logistics': '📦',
  'Utilities': '💡'
};

function switchMainView(mode) {
  currentMainView = mode;
  const listBtn = document.getElementById('viewModeListBtn');
  const heatmapBtn = document.getElementById('viewModeHeatmapBtn');
  const broksumBtn = document.getElementById('viewModeBroksumBtn');
  const stockList = document.getElementById('stockList');
  const filterPills = document.getElementById('filterPillsContainer');
  const heatmapContainer = document.getElementById('sectorHeatmapContainer');
  const broksumContainer = document.getElementById('brokerSummaryContainer');

  const inactiveBtnCls = 'flex-1 sm:flex-none px-3.5 md:px-4 py-2 rounded-xl text-gray-400 hover:text-white font-medium flex items-center justify-center gap-2 transition text-xs md:text-sm';

  if (listBtn) listBtn.className = inactiveBtnCls;
  if (heatmapBtn) heatmapBtn.className = inactiveBtnCls;
  if (broksumBtn) broksumBtn.className = inactiveBtnCls;

  if (stockList) stockList.classList.add('hidden');
  if (filterPills) filterPills.classList.add('hidden');
  if (heatmapContainer) heatmapContainer.classList.add('hidden');
  if (broksumContainer) broksumContainer.classList.add('hidden');

  if (mode === 'heatmap') {
    if (heatmapBtn) {
      heatmapBtn.className = 'flex-1 sm:flex-none px-3.5 md:px-4 py-2 rounded-xl bg-blue-500/20 text-blue-300 font-bold border border-blue-500/40 flex items-center justify-center gap-2 transition text-xs md:text-sm';
    }
    if (heatmapContainer) {
      heatmapContainer.classList.remove('hidden');
      renderSectorHeatmap();
    }
  } else if (mode === 'broksum') {
    if (broksumBtn) {
      broksumBtn.className = 'flex-1 sm:flex-none px-3.5 md:px-4 py-2 rounded-xl bg-purple-500/20 text-purple-300 font-bold border border-purple-500/40 flex items-center justify-center gap-2 transition text-xs md:text-sm';
    }
    if (broksumContainer) {
      broksumContainer.classList.remove('hidden');
      initBrokerSummaryView();
    }
  } else {
    // default 'list'
    if (listBtn) {
      listBtn.className = 'flex-1 sm:flex-none px-3.5 md:px-4 py-2 rounded-xl bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/40 flex items-center justify-center gap-2 transition text-xs md:text-sm';
    }
    if (stockList) stockList.classList.remove('hidden');
    if (filterPills) filterPills.classList.remove('hidden');
  }
}

function getHeatmapTileColor(pct) {
  if (pct >= 5.0) {
    return {
      bg: 'bg-[#065f46] text-white',
      border: 'border-emerald-400/80',
      textPct: 'text-emerald-200'
    };
  } else if (pct >= 2.0) {
    return {
      bg: 'bg-[#047857] text-white',
      border: 'border-emerald-500/70',
      textPct: 'text-emerald-100'
    };
  } else if (pct > 0.0) {
    return {
      bg: 'bg-[#064e3b]/90 text-emerald-100',
      border: 'border-emerald-600/50',
      textPct: 'text-emerald-300'
    };
  } else if (pct === 0.0) {
    return {
      bg: 'bg-gray-800 text-gray-300',
      border: 'border-gray-700',
      textPct: 'text-gray-400'
    };
  } else if (pct >= -2.0) {
    return {
      bg: 'bg-[#881337]/80 text-rose-100',
      border: 'border-rose-700/60',
      textPct: 'text-rose-300'
    };
  } else if (pct >= -5.0) {
    return {
      bg: 'bg-[#9f1239] text-white',
      border: 'border-rose-500/70',
      textPct: 'text-rose-200'
    };
  } else {
    return {
      bg: 'bg-[#4c0519] text-white',
      border: 'border-rose-400',
      textPct: 'text-rose-100 font-extrabold'
    };
  }
}

function renderSectorHeatmap() {
  const container = document.getElementById('heatmapGrid');
  if (!container) return;

  const scope = document.getElementById('heatmapScopeSelect')?.value || 'candidates';
  const sortBy = document.getElementById('heatmapSortSelect')?.value || 'performance';

  // Choose dataset
  let sourceStocks = (scope === 'all')
    ? (allTrackedStocks && allTrackedStocks.length > 0 ? allTrackedStocks : currentCandidates)
    : currentCandidates;

  if (!sourceStocks || sourceStocks.length === 0) {
    container.innerHTML = `
      <div class="col-span-full py-12 text-center text-gray-400 bg-[#161b22] border border-gray-800 rounded-2xl p-6">
        <i class="fa-solid fa-chart-pie text-2xl text-emerald-400 mb-2"></i>
        <p class="font-semibold text-sm">Belum ada data saham untuk sektor heatmap.</p>
        <p class="text-xs text-gray-500 mt-1">Lakukan scan atau pilih cakupan Semua Saham Syariah.</p>
      </div>
    `;
    return;
  }

  // Group by sector
  const sectorGroups = {};
  sourceStocks.forEach(s => {
    const sec = s.sector || 'Lainnya';
    if (!sectorGroups[sec]) {
      sectorGroups[sec] = [];
    }
    sectorGroups[sec].push(s);
  });

  // Calculate sector metrics
  const sectorList = Object.keys(sectorGroups).map(sec => {
    const list = sectorGroups[sec];
    const totalPct = list.reduce((acc, curr) => acc + (curr.change_pct || 0), 0);
    const avgPct = totalPct / list.length;
    list.sort((a, b) => (b.change_pct || 0) - (a.change_pct || 0));
    return {
      name: sec,
      icon: SECTOR_ICONS[sec] || '📦',
      stocks: list,
      avgPct: avgPct
    };
  });

  // Sort sectors
  if (sortBy === 'performance') {
    sectorList.sort((a, b) => b.avgPct - a.avgPct);
  } else if (sortBy === 'count') {
    sectorList.sort((a, b) => b.stocks.length - a.stocks.length);
  } else if (sortBy === 'name') {
    sectorList.sort((a, b) => a.name.localeCompare(b.name));
  }

  const topSectorName = (sortBy === 'performance' && sectorList.length > 0 && sectorList[0].avgPct > 0)
    ? sectorList[0].name
    : null;

  // Render HTML
  container.innerHTML = sectorList.map(sec => {
    const isTop = (sec.name === topSectorName);
    const avgFormatted = (sec.avgPct >= 0 ? '+' : '') + sec.avgPct.toFixed(2) + '%';
    const avgColor = sec.avgPct >= 0 ? 'text-emerald-400' : 'text-rose-400';

    const tilesHtml = sec.stocks.map(s => {
      const pct = s.change_pct || 0;
      const pctFormatted = (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
      const colors = getHeatmapTileColor(pct);
      const isCand = currentCandidates.some(c => c.code === s.code);

      return `
        <button type="button" onclick="showDetail('${s.code}')" class="heatmap-tile p-2 rounded-xl text-center border ${colors.bg} ${colors.border} flex flex-col justify-between items-center cursor-pointer relative" title="${s.code} - ${s.name || ''} (${pctFormatted})">
          ${isCand ? '<span class="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-emerald-400" title="Kandidat Radar"></span>' : ''}
          <span class="font-extrabold text-xs block tracking-wide">${s.code}</span>
          <span class="text-[10px] font-mono font-bold ${colors.textPct} block">${pctFormatted}</span>
          <span class="text-[9px] font-mono opacity-85 block">Rp ${formatRupiah(s.price || 0)}</span>
        </button>
      `;
    }).join('');

    return `
      <div class="bg-[#161b22] border border-gray-800 rounded-2xl p-3 md:p-3.5 space-y-2.5 flex flex-col justify-between shadow-sm">
        <div class="flex items-center justify-between pb-2 border-b border-gray-800/80">
          <div class="flex items-center gap-1.5 truncate">
            <span class="text-base">${sec.icon}</span>
            <span class="font-bold text-white text-xs truncate">${sec.name}</span>
            ${isTop ? '<span class="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold shrink-0">🔥 Terkuat</span>' : ''}
          </div>
          <div class="flex items-center gap-1 text-[11px] font-mono shrink-0">
            <span class="font-bold ${avgColor}">${avgFormatted}</span>
            <span class="text-[10px] text-gray-500">(${sec.stocks.length})</span>
          </div>
        </div>

        <div class="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
          ${tilesHtml}
        </div>
      </div>
    `;
  }).join('');
}

// =============================================================
// BROKER SUMMARY & BANDARMOLOGI FLOW TRACKER (TOP 3 BROKER)
// =============================================================
let currentBroksumStock = 'AUTO';
let currentBroksumPeriod = '1D';

function getBrokerCategoryStyle(category) {
  const cat = (category || '').toUpperCase();
  if (cat === 'ASING') {
    return {
      key: 'asing',
      label: '🏛️ Asing',
      codeClass: 'broker-code-asing',
      badgeClass: 'broker-badge-asing'
    };
  } else if (cat === 'BUMN') {
    return {
      key: 'bumn',
      label: '🇮🇩 BUMN',
      codeClass: 'broker-code-bumn',
      badgeClass: 'broker-badge-bumn'
    };
  } else if (cat === 'DOMESTIK' || cat === 'INSTITUSI') {
    return {
      key: 'institusi',
      label: '🏢 Institusi',
      codeClass: 'broker-code-institusi',
      badgeClass: 'broker-badge-institusi'
    };
  } else {
    // RETAIL / FAST TRADER / DEFAULT
    return {
      key: 'retail',
      label: '👥 Retail',
      codeClass: 'broker-code-retail',
      badgeClass: 'broker-badge-retail'
    };
  }
}

function initBrokerSummaryView() {
  populateBroksumStockDropdown();
  const select = document.getElementById('broksumStockSelect');
  if (select && select.value) {
    currentBroksumStock = select.value;
  }
  loadBrokerSummary(currentBroksumStock, currentBroksumPeriod);
  loadCandidatesBroksumQuickView(currentBroksumPeriod);
}

function populateBroksumStockDropdown() {
  const select = document.getElementById('broksumStockSelect');
  if (!select) return;

  const currentVal = select.value || currentBroksumStock;
  let html = '';

  if (currentCandidates && currentCandidates.length > 0) {
    html += '<optgroup label="⭐ Kandidat Radar Hari Ini">';
    currentCandidates.forEach(c => {
      const priceStr = c.price ? ` (Rp ${c.price.toLocaleString('id-ID')})` : '';
      html += `<option value="${c.code}">${c.code} - ${c.name || ''}${priceStr}</option>`;
    });
    html += '</optgroup>';
  }

  const otherStocks = (allTrackedStocks || []).filter(s => !currentCandidates.some(c => c.code === s.code));
  if (otherStocks.length > 0) {
    html += '<optgroup label="🏢 Saham Syariah Lainnya di Radar">';
    otherStocks.forEach(s => {
      const priceStr = s.price ? ` (Rp ${s.price.toLocaleString('id-ID')})` : '';
      html += `<option value="${s.code}">${s.code} - ${s.name || ''}${priceStr}</option>`;
    });
    html += '</optgroup>';
  }

  if (!html) {
    const fallbacks = [
      { code: 'AUTO', name: 'Astra Otoparts Tbk' },
      { code: 'CPIN', name: 'Charoen Pokphand Indonesia Tbk' },
      { code: 'SIDO', name: 'Industri Jamu Dan Farmasi Sido Muncul' },
      { code: 'BRIS', name: 'Bank Syariah Indonesia Tbk' },
      { code: 'ACES', name: 'Aspirasi Hidup Indonesia Tbk' },
      { code: 'ADRO', name: 'Adaro Energy Indonesia Tbk' },
      { code: 'ASII', name: 'Astra International Tbk' },
      { code: 'ICBP', name: 'Indofood CBP Sukses Makmur Tbk' },
      { code: 'TLKM', name: 'Telkom Indonesia Tbk' },
      { code: 'UNTR', name: 'United Tractors Tbk' },
      { code: 'PGAS', name: 'Perusahaan Gas Negara Tbk' },
      { code: 'KLBF', name: 'Kalbe Farma Tbk' }
    ];
    html += '<optgroup label="🏢 Saham Syariah Populer">';
    fallbacks.forEach(s => {
      html += `<option value="${s.code}">${s.code} - ${s.name}</option>`;
    });
    html += '</optgroup>';
  }

  select.innerHTML = html;

  if (currentVal && Array.from(select.options).some(o => o.value === currentVal)) {
    select.value = currentVal;
    currentBroksumStock = currentVal;
  } else if (select.options.length > 0) {
    select.selectedIndex = 0;
    currentBroksumStock = select.value;
  }
}

function setBroksumPeriod(period) {
  currentBroksumPeriod = period;
  const periods = ['1D', 'YESTERDAY', '7D', '1M', '3M', '6M'];
  periods.forEach(p => {
    const btn = document.getElementById(`broksum-period-${p}`);
    if (btn) {
      if (p === period) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    }
  });

  if (currentBroksumStock) {
    loadBrokerSummary(currentBroksumStock, period);
  }
  loadCandidatesBroksumQuickView(period);
}

async function loadBrokerSummary(ticker, period = '1D') {
  if (!ticker) return;
  ticker = ticker.toUpperCase();
  currentBroksumStock = ticker;

  const select = document.getElementById('broksumStockSelect');
  if (select && select.value !== ticker) {
    select.value = ticker;
  }

  const container = document.getElementById('broksumDetailContent');
  if (!container) return;

  container.innerHTML = `
    <div class="text-center py-10 bg-[#161b22] border border-gray-800 rounded-2xl p-6 text-gray-400">
      <i class="fa-solid fa-spinner fa-spin text-2xl text-purple-400 mb-2"></i>
      <p class="text-xs md:text-sm font-medium">Menganalisis pergerakan broker & akumulasi ${ticker} (${period})...</p>
    </div>
  `;

  try {
    const res = await authFetch(`/api/broker-summary/${encodeURIComponent(ticker)}?period=${encodeURIComponent(period)}`);
    if (!res.ok) {
      throw new Error(`Gagal memuat data broker summary untuk ${ticker}`);
    }

    const data = await res.json();
    if (data.status === 'error') {
      throw new Error(data.message || 'Terjadi kesalahan pemrosesan');
    }

    renderBrokerSummaryDetail(data);
  } catch (err) {
    console.error("Broker summary fetch error:", err);
    container.innerHTML = `
      <div class="p-5 text-center bg-red-500/10 border border-red-500/30 rounded-2xl text-red-400 text-xs md:text-sm space-y-2">
        <i class="fa-solid fa-circle-exclamation text-xl"></i>
        <p class="font-bold">Gagal memuat data Broker Summary untuk ${ticker}</p>
        <p class="text-gray-400 text-xs">${err.message}</p>
        <button onclick="loadBrokerSummary('${ticker}', '${period}')" class="mt-2 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-white text-xs font-semibold">Coba Lagi</button>
      </div>
    `;
  }
}

function renderBrokerSummaryDetail(data) {
  const container = document.getElementById('broksumDetailContent');
  if (!container) return;

  const dateRangeEl = document.getElementById('broksumDateRangeText');
  if (dateRangeEl) {
    dateRangeEl.innerText = `${data.start_date} s/d ${data.end_date} (${data.days_count} hari bursa)`;
  }

  // Price change HTML
  let changeHtml = '';
  if (data.price_change_idr > 0) {
    changeHtml = `<span class="text-emerald-400 font-bold font-mono">+Rp ${data.price_change_idr.toLocaleString('id-ID')} (+${data.price_change_pct}%)</span>`;
  } else if (data.price_change_idr < 0) {
    changeHtml = `<span class="text-rose-400 font-bold font-mono">-Rp ${Math.abs(data.price_change_idr).toLocaleString('id-ID')} (${data.price_change_pct}%)</span>`;
  } else {
    changeHtml = `<span class="text-gray-400 font-bold font-mono">Rp 0 (0.00%)</span>`;
  }

  // Net flow pill
  let netFlowPill = '';
  if (data.net_val_diff > 0) {
    netFlowPill = `<span class="px-2.5 py-1 rounded-lg text-[11px] md:text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1"><i class="fa-solid fa-arrow-trend-up"></i> Net Inflow +${data.net_val_diff_str}</span>`;
  } else if (data.net_val_diff < 0) {
    netFlowPill = `<span class="px-2.5 py-1 rounded-lg text-[11px] md:text-xs font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30 flex items-center gap-1"><i class="fa-solid fa-arrow-trend-down"></i> Net Outflow -${data.net_val_diff_str}</span>`;
  } else {
    netFlowPill = `<span class="px-2.5 py-1 rounded-lg text-[11px] md:text-xs font-bold bg-gray-800 text-gray-300 border border-gray-700">Net Flow: Rp 0</span>`;
  }

  // Calculation for concentration visual bar
  const buyerPct = data.top3_buyer_pct || 50;
  const sellerPct = data.top3_seller_pct || 50;
  const totalBar = buyerPct + sellerPct || 100;
  const buyerBarWidth = Math.min(85, Math.max(15, Math.round((buyerPct / totalBar) * 100)));
  const sellerBarWidth = 100 - buyerBarWidth;

  const html = `
    <!-- HERO STOCK HEADER -->
    <div class="bg-[#161b22] border border-gray-800 rounded-2xl p-4 md:p-5 space-y-4 shadow-md">
      <div class="flex items-start justify-between flex-wrap gap-3 border-b border-gray-800 pb-3.5">
        <div class="space-y-1">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-2xl md:text-3xl font-black text-white font-mono tracking-tight">${data.ticker}</span>
            <span class="text-xs px-2.5 py-0.5 rounded-lg bg-gray-800 text-gray-300 border border-gray-700 font-medium">${data.sector || 'BEI Syariah'}</span>
            <span class="px-2.5 py-1 rounded-xl text-[11px] md:text-xs font-extrabold border ${data.status_badge}">
              ${data.status_label}
            </span>
          </div>
          <p class="text-xs text-gray-400 font-medium">${data.name || data.ticker}</p>
          <div class="flex items-center gap-2 pt-0.5 text-xs md:text-sm">
            <span class="text-gray-300 font-medium">Harga Terkini:</span>
            <span class="text-white font-bold font-mono">Rp ${data.current_price.toLocaleString('id-ID')}</span>
            <span>•</span>
            ${changeHtml}
          </div>
        </div>

        <div class="flex items-center sm:flex-col sm:items-end gap-2 shrink-0">
          ${netFlowPill}
          <div class="text-[11px] text-gray-400 font-mono text-right">
            <span>Skor Bandarmologi: <b class="text-purple-400 font-bold">${data.bandarmologi_score}/100</b></span>
          </div>
        </div>
      </div>

      <!-- KEY METRICS GRID (4 CARDS) -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
        <div class="p-2.5 rounded-xl bg-[#0e1117] border border-gray-800">
          <span class="text-[10px] text-gray-400 block font-medium">VWAP (Avg Transaksi)</span>
          <span class="text-xs md:text-sm font-bold text-white font-mono mt-0.5 block">Rp ${data.vwap.toLocaleString('id-ID')}</span>
        </div>
        <div class="p-2.5 rounded-xl bg-[#0e1117] border border-gray-800">
          <span class="text-[10px] text-gray-400 block font-medium">Total Volume</span>
          <span class="text-xs md:text-sm font-bold text-emerald-400 font-mono mt-0.5 block">${data.total_volume_str}</span>
        </div>
        <div class="p-2.5 rounded-xl bg-[#0e1117] border border-gray-800">
          <span class="text-[10px] text-gray-400 block font-medium">Nilai Transaksi (Rp)</span>
          <span class="text-xs md:text-sm font-bold text-purple-400 font-mono mt-0.5 block">${data.total_value_str}</span>
        </div>
        <div class="p-2.5 rounded-xl bg-[#0e1117] border border-gray-800">
          <span class="text-[10px] text-gray-400 block font-medium">Money Flow (MFI 14)</span>
          <span class="text-xs md:text-sm font-bold ${data.mfi >= 60 ? 'text-emerald-400' : (data.mfi <= 40 ? 'text-rose-400' : 'text-amber-400')} font-mono mt-0.5 block">${data.mfi}</span>
        </div>
      </div>

      <!-- SMART MONEY VERDICT BANNER -->
      <div class="p-3.5 rounded-xl border flex items-start gap-3 ${data.verdict_badge}">
        <i class="fa-solid ${data.verdict_icon} text-base md:text-lg mt-0.5 shrink-0"></i>
        <div class="space-y-0.5">
          <span class="text-xs font-bold uppercase tracking-wider block">Konfirmasi Bandarmologi & Smart Money:</span>
          <p class="text-xs md:text-sm leading-relaxed">${data.smart_money_verdict}</p>
        </div>
      </div>

      <!-- VISUAL CONCENTRATION BAR: BUYER vs SELLER -->
      <div class="space-y-1.5 pt-1">
        <div class="flex items-center justify-between text-xs font-semibold">
          <span class="text-emerald-400 flex items-center gap-1.5">
            <i class="fa-solid fa-circle-arrow-up"></i>
            <span>Top 3 Buyer: ${data.top3_buyer_pct}% Volume</span>
          </span>
          <span class="text-rose-400 flex items-center gap-1.5">
            <span>Top 3 Seller: ${data.top3_seller_pct}% Volume</span>
            <i class="fa-solid fa-circle-arrow-down"></i>
          </span>
        </div>

        <div class="w-full h-3.5 bg-gray-800 rounded-full overflow-hidden flex shadow-inner">
          <div style="width: ${buyerBarWidth}%" class="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-300" title="Buyer Share: ${data.top3_buyer_pct}%"></div>
          <div style="width: ${sellerBarWidth}%" class="h-full bg-gradient-to-r from-rose-500 to-rose-700 transition-all duration-300" title="Seller Share: ${data.top3_seller_pct}%"></div>
        </div>

        <div class="flex items-center justify-between text-[11px] text-gray-500 font-mono">
          <span>Top 1 Buyer (${data.buyers[0]?.broker_code || '-'}): ${data.top1_buyer_pct}%</span>
          <span>Selisih Net Lot: <b class="${data.net_lot_diff >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${data.net_lot_diff >= 0 ? '+' : '-'}${data.net_lot_diff_str}</b></span>
        </div>
      </div>
    </div>

    <!-- CATEGORY COLOR CODING LEGEND (SEKURITAS STYLE) -->
    <div class="flex items-center justify-between flex-wrap gap-2 text-[11px] px-3 py-2 rounded-xl bg-[#0e1117] border border-gray-800 text-gray-400 shadow-sm">
      <span class="font-semibold flex items-center gap-1.5 text-gray-300">
        <i class="fa-solid fa-palette text-purple-400"></i> Warna Broker Sekuritas:
      </span>
      <div class="flex items-center gap-3.5 flex-wrap">
        <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-red-500 shadow-sm"></span><b class="broker-code-asing">Merah:</b> Asing</span>
        <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm"></span><b class="broker-code-bumn">Hijau:</b> BUMN</span>
        <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-purple-500 shadow-sm"></span><b class="broker-code-institusi">Ungu:</b> Institusi</span>
        <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-sm"></span><b class="broker-code-retail">Kuning:</b> Retail</span>
      </div>
    </div>

    <!-- SIDE-BY-SIDE DUAL BROKER TABLES (BUYER vs SELLER) -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      
      <!-- TOP 3 BUYER CARD -->
      <div class="bg-[#161b22] border border-emerald-500/30 rounded-2xl p-3.5 md:p-4 space-y-3 shadow-md">
        <div class="flex items-center justify-between border-b border-emerald-500/20 pb-2.5">
          <div class="flex items-center gap-2">
            <div class="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-bold">
              <i class="fa-solid fa-cart-shopping"></i>
            </div>
            <div>
              <h4 class="font-extrabold text-emerald-400 text-xs md:text-sm">TOP 3 BUYER (NET BUY)</h4>
              <p class="text-[10px] text-gray-400">Broker dengan akumulasi pembelian terbesar</p>
            </div>
          </div>
          <div class="text-right">
            <span class="text-xs font-bold text-white font-mono block">${data.total_top_buy_val_str}</span>
            <span class="text-[10px] text-emerald-400/80 font-mono">${data.top3_buyer_pct}% Total Pasar</span>
          </div>
        </div>

        <div class="space-y-2">
          ${(data.buyers || []).map(b => {
            const st = getBrokerCategoryStyle(b.category);
            return `
            <div class="p-2.5 rounded-xl bg-[#0e1117] border border-gray-800 hover:border-emerald-500/40 transition flex items-center justify-between gap-2">
              <div class="flex items-center gap-2.5 min-w-0">
                <span class="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 font-black text-xs flex items-center justify-center shrink-0">#${b.rank}</span>
                <div class="min-w-0">
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="text-base tracking-wider font-mono ${st.codeClass}">${b.broker_code}</span>
                    <span class="text-[10px] px-1.5 py-0.5 rounded-md ${st.badgeClass} font-semibold">${b.badge || st.label}</span>
                  </div>
                  <div class="text-[11px] text-gray-400 truncate max-w-[150px] sm:max-w-[210px]" title="${b.broker_name}">${b.broker_name}</div>
                </div>
              </div>
              <div class="text-right shrink-0">
                <div class="font-bold text-emerald-400 font-mono text-xs md:text-sm">${b.val_str}</div>
                <div class="text-[11px] text-gray-400 font-mono">${b.lot_str} Lot • Avg <b class="text-white">Rp ${b.avg_price.toLocaleString('id-ID')}</b></div>
              </div>
            </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- TOP 3 SELLER CARD -->
      <div class="bg-[#161b22] border border-rose-500/30 rounded-2xl p-3.5 md:p-4 space-y-3 shadow-md">
        <div class="flex items-center justify-between border-b border-rose-500/20 pb-2.5">
          <div class="flex items-center gap-2">
            <div class="w-7 h-7 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center text-xs font-bold">
              <i class="fa-solid fa-arrow-up-from-bracket"></i>
            </div>
            <div>
              <h4 class="font-extrabold text-rose-400 text-xs md:text-sm">TOP 3 SELLER (NET SELL)</h4>
              <p class="text-[10px] text-gray-400">Broker dengan distribusi penjualan terbesar</p>
            </div>
          </div>
          <div class="text-right">
            <span class="text-xs font-bold text-white font-mono block">${data.total_top_sell_val_str}</span>
            <span class="text-[10px] text-rose-400/80 font-mono">${data.top3_seller_pct}% Total Pasar</span>
          </div>
        </div>

        <div class="space-y-2">
          ${(data.sellers || []).map(s => {
            const st = getBrokerCategoryStyle(s.category);
            return `
            <div class="p-2.5 rounded-xl bg-[#0e1117] border border-gray-800 hover:border-rose-500/40 transition flex items-center justify-between gap-2">
              <div class="flex items-center gap-2.5 min-w-0">
                <span class="w-6 h-6 rounded-lg bg-rose-500/20 text-rose-400 font-black text-xs flex items-center justify-center shrink-0">#${s.rank}</span>
                <div class="min-w-0">
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="text-base tracking-wider font-mono ${st.codeClass}">${s.broker_code}</span>
                    <span class="text-[10px] px-1.5 py-0.5 rounded-md ${st.badgeClass} font-semibold">${s.badge || st.label}</span>
                  </div>
                  <div class="text-[11px] text-gray-400 truncate max-w-[150px] sm:max-w-[210px]" title="${s.broker_name}">${s.broker_name}</div>
                </div>
              </div>
              <div class="text-right shrink-0">
                <div class="font-bold text-rose-400 font-mono text-xs md:text-sm">${s.val_str}</div>
                <div class="text-[11px] text-gray-400 font-mono">${s.lot_str} Lot • Avg <b class="text-white">Rp ${s.avg_price.toLocaleString('id-ID')}</b></div>
              </div>
            </div>
            `;
          }).join('')}
        </div>
      </div>

    </div>

    <!-- QUICK ACTION TOOLBAR FOR SELECTED STOCK -->
    <div class="flex items-center flex-wrap gap-2.5 pt-1">
      <button onclick="openChartFromBroksum('${data.ticker}')" class="flex-1 py-2.5 px-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition border border-gray-700 shadow-sm">
        <i class="fa-solid fa-chart-candlestick text-emerald-400"></i>
        <span>Buka Candlestick Chart</span>
      </button>
      <button onclick="openCalcFromBroksum('${data.ticker}')" class="flex-1 py-2.5 px-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition border border-gray-700 shadow-sm">
        <i class="fa-solid fa-calculator text-blue-400"></i>
        <span>Hitung Lot Sizing</span>
      </button>
      <button onclick="openJournalFromBroksum('${data.ticker}')" class="flex-1 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition shadow-md">
        <i class="fa-solid fa-book-bookmark"></i>
        <span>Catat ke Jurnal Trading</span>
      </button>
    </div>
  `;

  container.innerHTML = html;
}

async function loadCandidatesBroksumQuickView(period = '1D') {
  const grid = document.getElementById('broksumCandidatesGrid');
  if (!grid) return;

  grid.innerHTML = `
    <div class="col-span-full py-8 text-center text-gray-400">
      <i class="fa-solid fa-spinner fa-spin text-xl text-emerald-400 mb-2"></i>
      <p class="text-xs">Memindai Top 3 Broker untuk kandidat radar...</p>
    </div>
  `;

  try {
    const res = await authFetch(`/api/broker-summary-candidates?period=${encodeURIComponent(period)}`);
    if (!res.ok) throw new Error("Gagal mengambil data kandidat broker summary");

    const data = await res.json();
    const candidates = data.candidates || [];

    if (candidates.length === 0) {
      grid.innerHTML = `
        <div class="col-span-full py-6 text-center text-gray-400 bg-[#0e1117] border border-gray-800 rounded-xl p-4">
          <i class="fa-solid fa-shield-halved text-2xl text-emerald-400 mb-1.5 block"></i>
          <p class="text-xs font-semibold text-gray-300">Belum ada kandidat radar hari ini</p>
          <p class="text-[11px] text-gray-500 mt-0.5">Tekan tombol "Scan Pasar" untuk menjalankan screener 3-pilar BEI.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = candidates.map(c => {
      const topBuyersHtml = (c.buyers || []).slice(0, 2).map(b => {
        const st = getBrokerCategoryStyle(b.category);
        return `<span class="${st.codeClass}">${b.broker_code}</span>`;
      }).join(', ');

      const topSellersHtml = (c.sellers || []).slice(0, 2).map(s => {
        const st = getBrokerCategoryStyle(s.category);
        return `<span class="${st.codeClass}">${s.broker_code}</span>`;
      }).join(', ');

      const isSelected = c.ticker === currentBroksumStock;

      return `
        <div onclick="openBrokerSummaryForStock('${c.ticker}')" class="cursor-pointer p-3.5 rounded-xl bg-[#0e1117] border ${isSelected ? 'border-purple-500 ring-1 ring-purple-500/40 bg-purple-500/5' : 'border-gray-800 hover:border-gray-700'} space-y-2.5 transition shadow-sm">
          <div class="flex items-start justify-between">
            <div>
              <div class="flex items-center gap-1.5">
                <span class="font-extrabold text-white text-base font-mono">${c.ticker}</span>
                <span class="text-[10px] px-1.5 py-0.2 rounded bg-gray-800 text-gray-300">${c.sector || 'BEI'}</span>
              </div>
              <div class="text-[11px] text-gray-400 truncate max-w-[160px]">${c.name || c.ticker}</div>
            </div>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-lg border ${c.status_badge}">
              ${c.status_label.split(' ')[0]}
            </span>
          </div>

          <div class="flex items-center justify-between text-xs pt-1 border-t border-gray-800/80">
            <span class="text-gray-400 font-medium">Harga: <b class="text-white font-mono">Rp ${c.current_price.toLocaleString('id-ID')}</b></span>
            <span class="font-mono ${c.price_change_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'} font-semibold">
              ${c.price_change_pct >= 0 ? '+' : ''}${c.price_change_pct}%
            </span>
          </div>

          <div class="grid grid-cols-2 gap-1.5 text-[11px] bg-gray-900/40 p-2 rounded-lg border border-gray-800/60 font-mono">
            <div>
              <span class="text-gray-400 text-[10px] block">Top Buyer:</span>
              <span class="font-bold">${topBuyersHtml || '-'}</span>
              <span class="text-[10px] text-gray-500">(${c.top3_buyer_pct}%)</span>
            </div>
            <div>
              <span class="text-gray-400 text-[10px] block">Top Seller:</span>
              <span class="font-bold">${topSellersHtml || '-'}</span>
              <span class="text-[10px] text-gray-500">(${c.top3_seller_pct}%)</span>
            </div>
          </div>

          <button type="button" class="w-full py-1.5 rounded-lg bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-300 text-xs font-bold transition flex items-center justify-center gap-1.5">
            <i class="fa-solid fa-users-viewfinder"></i>
            <span>Analisa Detail ${c.ticker} &rarr;</span>
          </button>
        </div>
      `;
    }).join('');

  } catch (err) {
    console.error("Candidates broksum fetch error:", err);
    grid.innerHTML = `
      <div class="col-span-full py-4 text-center text-red-400 text-xs">
        Gagal memuat perbandingan kandidat broker summary.
      </div>
    `;
  }
}

function openBrokerSummaryForStock(code) {
  if (!code) return;
  const upper = code.toUpperCase();
  currentBroksumStock = upper;
  switchMainView('broksum');

  const select = document.getElementById('broksumStockSelect');
  if (select) {
    select.value = upper;
  }

  loadBrokerSummary(upper, currentBroksumPeriod);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openChartFromBroksum(ticker) {
  const stock = (currentCandidates || []).find(c => c.code === ticker) || (allTrackedStocks || []).find(s => s.code === ticker);
  if (stock) {
    openModal(stock);
  } else {
    openModal({
      code: ticker,
      name: ticker,
      sector: 'BEI Syariah',
      score: 75,
      price: 0,
      trading_plan: { entry: 0, stop_loss: 0, tp1: 0, tp2: 0 }
    });
  }
}

function openCalcFromBroksum(ticker) {
  openStandaloneCalcModal(ticker);
}

function openJournalFromBroksum(ticker) {
  quickAddStockToJournal(ticker);
}

// =============================================================
// WEB PUSH NOTIFICATION & SCHEDULED 16:15 WIB ALERT ENGINE
// =============================================================
function openNotificationModal() {
  const modal = document.getElementById('notificationModal');
  if (modal) {
    modal.classList.remove('hidden');
    updatePushStatusUI();
  }
}

function closeNotificationModal() {
  const modal = document.getElementById('notificationModal');
  if (modal) modal.classList.add('hidden');
}

function updatePushStatusUI() {
  const badge = document.getElementById('pushStatusBadge');
  const desc = document.getElementById('pushStatusDesc');
  const btn = document.getElementById('enablePushBtn');
  const btnText = document.getElementById('enablePushBtnText');
  const dot = document.getElementById('notifActiveDot');
  const mDot = document.getElementById('mobileNotifActiveDot');
  const toolbarStatus = document.getElementById('notifToolbarStatus');
  const mMenuStatus = document.getElementById('mobileMenuNotifStatus');

  if (!('Notification' in window)) {
    if (badge) {
      badge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-gray-700 text-gray-400';
      badge.innerText = 'Tidak Didukung Browser';
    }
    if (desc) desc.innerText = 'Peramban ini tidak mendukung Web Notifications API.';
    if (btn) btn.disabled = true;
    return;
  }

  const permission = Notification.permission;
  if (permission === 'granted') {
    if (badge) {
      badge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
      badge.innerText = '🟢 Aktif (Terhubung)';
    }
    if (desc) desc.innerText = 'Notifikasi aktif! Anda akan menerima pop-up sinyal swing saham setiap hari bursa jam 16:15 WIB.';
    if (btn) {
      btn.disabled = true;
      btn.className = 'w-full py-2.5 px-3 rounded-xl bg-emerald-600/30 text-emerald-300 font-bold text-xs cursor-default flex items-center justify-center gap-2 border border-emerald-500/30';
    }
    if (btnText) btnText.innerText = '✅ Notifikasi Sudah Aktif di Perangkat Ini';
    if (dot) dot.classList.remove('hidden');
    if (mDot) mDot.classList.remove('hidden');
    if (toolbarStatus) toolbarStatus.innerText = 'Notifikasi Aktif';
    if (mMenuStatus) mMenuStatus.innerHTML = '<span class="text-emerald-400 font-semibold">🟢 Aktif (Jam 16:15 WIB)</span>';
  } else if (permission === 'denied') {
    if (badge) {
      badge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30';
      badge.innerText = '🔴 Diblokir Browser';
    }
    if (desc) desc.innerText = 'Izin notifikasi diblokir di pengaturan browser. Klik ikon gembok di sebelah URL browser untuk mengizinkan.';
    if (btn) btn.disabled = true;
    if (btnText) btnText.innerText = 'Izin Diblokir di Browser';
    if (dot) dot.classList.add('hidden');
    if (mDot) mDot.classList.add('hidden');
  } else {
    if (badge) {
      badge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30';
      badge.innerText = '🟡 Belum Aktif';
    }
    if (desc) desc.innerText = 'Aktifkan izin notifikasi di peramban HP Anda agar sinyal saham swing otomatis muncul saat penutupan bursa jam 16:15 WIB.';
    if (btn) {
      btn.disabled = false;
      btn.className = 'w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition flex items-center justify-center gap-2 shadow-lg';
    }
    if (btnText) btnText.innerText = 'Aktifkan Notifikasi di Perangkat Ini';
    if (dot) dot.classList.add('hidden');
    if (mDot) mDot.classList.add('hidden');
  }
}

async function requestPushPermission() {
  if (!('Notification' in window)) {
    showToast('⚠️ Peramban Anda tidak mendukung web notification.');
    return;
  }

  try {
    const result = await Notification.requestPermission();
    updatePushStatusUI();

    if (result === 'granted') {
      showToast('✅ Izin notifikasi berhasil diaktifkan!');
      triggerLocalSystemNotification(
        '🔔 Notifikasi Syariah Radar Aktif!',
        'Anda akan menerima peringatan otomatis setiap hari bursa jam 16:15 WIB.'
      );

      try {
        if ('serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.ready;
          const sub = await reg.pushManager.getSubscription();
          if (sub) {
            await authFetch('/api/notifications/subscribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                endpoint: sub.endpoint,
                keys: sub.toJSON().keys,
                device_id: getOrCreateDeviceId()
              })
            });
          }
        }
      } catch (e) {}
    } else {
      showToast('⚠️ Izin notifikasi belum diberikan.');
    }
  } catch (err) {
    console.error('Push permission error:', err);
  }
}

function triggerLocalSystemNotification(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const options = {
    body: body,
    icon: '/static/icon-192.png',
    badge: '/static/icon-192.png',
    tag: 'syariah-radar-alert',
    vibrate: [250, 100, 250],
    data: { url: '/' }
  };

  if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
    navigator.serviceWorker.ready.then(reg => {
      reg.showNotification(title, options);
    }).catch(() => {
      try { new Notification(title, options); } catch (e) {}
    });
  } else {
    try { new Notification(title, options); } catch (e) {}
  }
}

function sendTestPushNotification() {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    requestPushPermission();
    return;
  }

  const sampleCount = (currentCandidates && currentCandidates.length > 0) ? currentCandidates.length : 4;
  const sampleTickers = (currentCandidates && currentCandidates.length > 0)
    ? currentCandidates.slice(0, 3).map(c => c.code).join(', ')
    : 'AUTO, BRPT, ACES';

  triggerLocalSystemNotification(
    '🔔 Radar Saham Syariah (Tes Sinyal)',
    `${sampleCount} saham syariah lolos kriteria Akumulasi & Low Risk (${sampleTickers}). Ketuk untuk buka radar!`
  );

  showToast('📲 Notifikasi uji coba telah dikirim ke layar HP Anda!');
}

function checkScheduledMarketAlert() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const now = new Date();
  const day = now.getDay();
  if (day === 0 || day === 6) return; // Monday-Friday only

  const hours = now.getHours();
  const minutes = now.getMinutes();

  // Trigger between 16:15 and 23:59 WIB
  if (hours > 16 || (hours === 16 && minutes >= 15)) {
    const todayStr = now.toISOString().split('T')[0];
    const lastNotified = localStorage.getItem('syariah_last_scheduled_alert');

    if (lastNotified !== todayStr && currentCandidates && currentCandidates.length > 0) {
      localStorage.setItem('syariah_last_scheduled_alert', todayStr);
      const tickers = currentCandidates.slice(0, 4).map(c => c.code).join(', ');
      triggerLocalSystemNotification(
        `🔔 Sinyal Swing Saham Syariah (${todayStr})`,
        `${currentCandidates.length} saham lolos kriteria Akumulasi & Low Risk hari ini (${tickers}). Ketuk untuk analisa sekarang!`
      );
    }
  }
}

// Initial check on page load
initTheme();
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  sanitizeSearchInput();
  updateWatchlistCounter();
  updateJournalBadges();
  checkAuthStatus();
  updatePushStatusUI();
  checkScheduledMarketAlert();
  setInterval(checkScheduledMarketAlert, 60000);
});

window.addEventListener('load', () => {
  sanitizeSearchInput();
  updateJournalBadges();
  updatePushStatusUI();
  setTimeout(sanitizeSearchInput, 150);
  setTimeout(sanitizeSearchInput, 500);
});
