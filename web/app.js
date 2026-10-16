// IDX Sharia Stock Screener Frontend Application (Pro Suite with Search & Standalone Calculator)

let currentCandidates = [];
let allTrackedStocks = [];
let currentFilter = 'ALL';
let searchKeyword = '';
let currentOpenStock = null;
let chartInstance = null;
let deferredInstallPrompt = null;

let watchlist = [];
try {
  watchlist = JSON.parse(localStorage.getItem('sharia_radar_watchlist')) || [];
} catch (e) {
  watchlist = [];
}

function updateWatchlistCounter() {
  const el = document.getElementById('watchlistCount');
  if (el) el.innerText = watchlist.length;
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

function copyCurrentModalPlan() {
  if (!currentOpenStock) return;
  const s = currentOpenStock;
  const plan = s.trading_plan || {};
  const lots = document.getElementById('calcLots').innerText;
  const shares = document.getElementById('calcShares').innerText;
  const allocated = document.getElementById('calcAllocated').innerText;
  const allocPct = document.getElementById('calcAllocPct').innerText;
  const maxRisk = document.getElementById('calcMaxRisk').innerText;
  const riskPct = document.getElementById('calcRiskPct').value || 2;

  const text = `📌 SWING PLAN: ${s.code} - ${s.name}
🏛️ Sektor: ${s.sector} | Indeks: ${(s.indices || ['ISSI']).join(', ')}
🛡️ Status: ${s.passed_screener !== false ? `Sinyal Lolos (${s.risk_label || 'Paling Aman'}) • Skor ${s.score}/100` : 'Saham Pantauan Radar'}
────────────────────────────
📍 Area Beli (Entry)  : ${formatIDR(plan.entry)}
⛔ Stop Loss (Proteksi): ${formatIDR(plan.stop_loss)} (-${plan.risk_pct}%)
🎯 Target Profit 1    : ${formatIDR(plan.tp1)} (+${plan.tp1_pct}%)
🚀 Target Profit 2    : ${formatIDR(plan.tp2)} (+${plan.tp2_pct}%)
⚖️ Risk / Reward      : 1 : 2.5
────────────────────────────
💰 Money Management (${riskPct}% Risiko Portofolio):
- Ukuran Posisi : ${lots} ${shares}
- Modal Alokasi : ${allocated} ${allocPct}
- Risiko Terkunci: ${maxRisk}
────────────────────────────
💡 Sumber: Syariah Swing Radar Pro`;

  copyToClipboard(text, `✅ Trading Plan ${s.code} Berhasil Disalin!`);
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
function handleSearch() {
  const input = document.getElementById('searchInput');
  const clearBtn = document.getElementById('clearSearchBtn');
  searchKeyword = input.value.trim().toLowerCase();

  if (searchKeyword.length > 0) {
    clearBtn.classList.remove('hidden');
  } else {
    clearBtn.classList.add('hidden');
  }

  renderCandidates();
}

function clearSearch() {
  const input = document.getElementById('searchInput');
  const clearBtn = document.getElementById('clearSearchBtn');
  input.value = '';
  searchKeyword = '';
  clearBtn.classList.add('hidden');
  renderCandidates();
}

// -------------------------------------------------------------
// FETCH SCREENER DATA
// -------------------------------------------------------------
async function fetchResults(forceRefresh = false) {
  const refreshBtn = document.getElementById('refreshBtn');
  const refreshIcon = document.getElementById('refreshIcon');
  const stockList = document.getElementById('stockList');

  if (refreshIcon) refreshIcon.classList.add('fa-spin');
  if (refreshBtn) refreshBtn.disabled = true;

  try {
    const url = `/api/screener/results?min_score=50${forceRefresh ? '&force_refresh=true' : ''}`;
    const res = await fetch(url);
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

    updateWatchlistCounter();
    populateCalculatorDropdown();
    renderCandidates();
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
  }
}

function setFilter(filterType) {
  currentFilter = filterType;
  document.querySelectorAll('.filter-pill').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById(`filter-${filterType}`);
  if (activeBtn) activeBtn.classList.add('active');
  renderCandidates();
}

function renderCandidates() {
  const container = document.getElementById('stockList');
  let list = currentCandidates;

  // 1. Filter by category
  if (currentFilter === 'WATCHLIST') {
    list = list.filter(c => watchlist.includes(c.code));
  } else if (currentFilter === 'LOW_RISK') {
    list = list.filter(c => c.risk_level === 'LOW_RISK');
  } else if (currentFilter === 'BIG_ACCUMULATION') {
    list = list.filter(c => c.bandarmologi && (c.bandarmologi.status === 'BIG_ACCUMULATION' || c.bandarmologi.status === 'ACCUMULATION'));
  } else if (currentFilter === 'JII') {
    list = list.filter(c => c.indices && c.indices.includes('JII'));
  } else if (currentFilter === 'TIGHT_SL') {
    list = list.filter(c => c.trading_plan && c.trading_plan.risk_pct <= 4.0);
  } else if (currentFilter !== 'ALL') {
    list = list.filter(c => c.setup_type === currentFilter);
  }

  // 2. Filter by Search Keyword
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
          <div class="text-center py-12 bg-[#161b22] border border-gray-800 rounded-xl p-6 text-gray-400">
            <i class="fa-regular fa-star text-4xl mb-3 text-amber-400"></i>
            <h3 class="text-sm font-semibold text-gray-200">Watchlist Anda Masih Kosong</h3>
            <p class="text-xs text-gray-500 mt-1 max-w-sm mx-auto">Klik ikon bintang (⭐) pada kartu saham mana pun untuk menyimpannya ke daftar pantauan pribadi Anda.</p>
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
        <div class="space-y-3">
          <div class="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 text-xs text-amber-200">
            <div class="flex items-start gap-2.5">
              <i class="fa-solid fa-shield-halved text-amber-400 text-lg mt-0.5"></i>
              <div>
                <h4 class="font-bold text-amber-300 text-sm">Saham Terdaftar di Radar, Namun Belum Lolos Sinyal Beli Hari Ini</h4>
                <p class="text-gray-400 mt-1">Sistem menyaring saham ini demi keamanan modal Anda agar terhindar dari risiko beli di fase turun tajam (*falling knife*) atau downtrend.</p>
              </div>
            </div>
          </div>
      `;

      matchingTracked.forEach(s => {
        const isUp = s.change_pct >= 0;
        const changeColor = isUp ? 'text-emerald-400' : 'text-red-400';
        const changeSign = isUp ? '+' : '';

        diagHtml += `
          <div class="bg-[#161b22] border border-gray-800 rounded-xl p-4 shadow-sm space-y-3">
            <div class="flex items-start justify-between">
              <div>
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-base font-bold text-white tracking-wide">${s.code}</span>
                  <span class="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold">
                    ⚠️ Belum Lolos Sinyal Beli
                  </span>
                  <span class="text-[10px] text-gray-400 px-2 py-0.5 rounded bg-gray-800">${s.sector}</span>
                </div>
                <p class="text-xs text-gray-400 mt-1">${s.name}</p>
              </div>
              <div class="flex items-center gap-2">
                <button onclick="toggleWatchlist('${s.code}', event)" class="w-8 h-8 rounded-lg bg-gray-800/80 hover:bg-gray-700 text-amber-400 flex items-center justify-center transition border border-gray-700/60" title="${isWatchlisted(s.code) ? 'Hapus dari Watchlist' : 'Tambah ke Watchlist'}">
                  <i class="${isWatchlisted(s.code) ? 'fa-solid fa-star text-amber-400' : 'fa-regular fa-star text-gray-400'} text-xs"></i>
                </button>
                <div class="text-right">
                  <span class="text-base font-bold text-white font-mono block">${formatIDR(s.price)}</span>
                  <span class="text-xs font-semibold ${changeColor}">${changeSign}${s.change_pct}%</span>
                </div>
              </div>
            </div>

            <!-- DIAGNOSTIC REASONS BOX -->
            <div class="bg-[#0e1117] p-3 rounded-xl border border-gray-800 space-y-2 text-xs">
              <span class="text-[11px] font-bold text-gray-300 block flex items-center gap-1.5">
                <i class="fa-solid fa-clipboard-check text-amber-400"></i>
                Diagnosa Sistem Radar Hari Ini:
              </span>
              <ul class="space-y-1.5 text-gray-300 pl-1">
                ${(s.rejection_reasons || []).map(r => `<li class="flex items-start gap-2"><span class="text-amber-400 mt-0.5 font-bold">•</span><span>${r}</span></li>`).join('')}
              </ul>
              <div class="pt-1.5 border-t border-gray-800/80 text-[11px] text-emerald-400 font-medium">
                💡 Saran Swing: ${s.safety_advice || 'Wait & See. Tunggu konfirmasi pantulan support (candle hijau/hammer) sebelum entry.'}
              </div>
            </div>

            <!-- ACTION BUTTONS -->
            <div class="flex items-center justify-between pt-1">
              <span class="text-[11px] text-gray-500 font-mono">Turnover: ${s.turnover_str} • RSI: ${s.rsi || '-'}</span>
              <div class="flex items-center gap-2">
                <button onclick='openModal(${JSON.stringify(s).replace(/'/g, "&apos;")})' class="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-xs font-medium border border-gray-700 transition flex items-center gap-1.5">
                  <i class="fa-solid fa-chart-line text-emerald-400"></i>
                  <span>Lihat Chart</span>
                </button>
                <button onclick='openStandaloneCalcModal("${s.code}")' class="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 rounded-lg text-xs font-semibold border border-emerald-500/30 transition flex items-center gap-1.5">
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
      <div class="text-center py-12 bg-[#161b22] border border-gray-800 rounded-xl p-6 text-gray-400">
        <i class="fa-solid fa-magnifying-glass text-3xl mb-3 text-emerald-500/60"></i>
        <h3 class="text-sm font-semibold text-gray-200">Tidak ada saham yang cocok</h3>
        <p class="text-xs text-gray-500 mt-1">${searchKeyword ? `Saham "${searchKeyword.toUpperCase()}" belum terdaftar dalam 75 saham radar syariah.` : 'Coba pilih tab filter lain di atas atau lakukan scan ulang.'}</p>
        ${searchKeyword ? `
          <div class="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button onclick="clearSearch()" class="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs rounded-lg transition">Hapus Pencarian</button>
            <button onclick="openAddStockModal('${searchKeyword.toUpperCase()}')" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition flex items-center gap-1.5 shadow">
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
      setupBadge = '<span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-semibold">🚀 Breakout</span>';
    } else if (c.setup_type === 'UPTREND_PULLBACK') {
      setupBadge = '<span class="px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[10px] font-semibold">📈 Uptrend Pullback</span>';
    } else if (c.setup_type === 'RS_LEADER') {
      setupBadge = '<span class="px-2 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30 text-[10px] font-semibold">👑 Leader >MA200</span>';
    } else {
      setupBadge = '<span class="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-semibold">⚡ Oversold Rebound</span>';
    }

    // Risk Badge
    let riskBadge = '';
    if (c.risk_level === 'LOW_RISK') {
      riskBadge = '<span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold">🛡️ Paling Aman (Grade A+)</span>';
    } else if (c.risk_level === 'MEDIUM_RISK') {
      riskBadge = '<span class="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[10px] font-medium">⚖️ Moderat</span>';
    } else {
      riskBadge = '<span class="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-medium">⚠️ Spekulatif</span>';
    }

    // Bandarmologi Badge
    const bandar = c.bandarmologi || {};
    let bandarChip = '';
    if (bandar.status === 'BIG_ACCUMULATION') {
      bandarChip = '<span class="px-1.5 py-0.5 rounded bg-emerald-950/70 text-emerald-400 border border-emerald-700/60 text-[10px] font-semibold">💰 Akumulasi Jumbo</span>';
    } else if (bandar.status === 'ACCUMULATION') {
      bandarChip = '<span class="px-1.5 py-0.5 rounded bg-blue-950/70 text-blue-400 border border-blue-700/60 text-[10px] font-semibold">🕵️ Akumulasi</span>';
    }

    // Fundamental Highlights
    const fund = c.fundamental || {};
    let fundText = '';
    if (fund.roe) fundText += `ROE: ${fund.roe}% • `;
    if (fund.pbv) fundText += `PBV: ${fund.pbv}x • `;
    if (fund.der !== null && fund.der !== undefined) fundText += `DER: ${fund.der}%`;
    if (!fundText) fundText = fund.cap_category || 'Saham Syariah';

    const maBadge = c.ma_aligned 
      ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 font-mono border border-emerald-500/20">MA50>100>200</span>' 
      : (c.is_above_ma200 ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-300 font-mono border border-blue-500/20">>MA200</span>' : '');

    html += `
      <div class="stock-card bg-[#161b22] border border-gray-800 rounded-xl p-3.5 shadow-sm space-y-3 cursor-pointer" onclick='openModal(${JSON.stringify(c).replace(/'/g, "&apos;")})'>
        <div class="flex items-start justify-between">
          <div class="space-y-1">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-base font-bold text-white tracking-wide">${c.code}</span>
              ${riskBadge}
              ${setupBadge}
              ${bandarChip}
              ${maBadge}
            </div>
            <p class="text-xs text-gray-400 line-clamp-1">${c.name} • <span class="text-gray-500">${c.sector}</span></p>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="toggleWatchlist('${c.code}', event)" class="w-8 h-8 rounded-lg bg-gray-800/80 hover:bg-gray-700 text-amber-400 flex items-center justify-center transition border border-gray-700/60" title="${isWatchlisted(c.code) ? 'Hapus dari Watchlist' : 'Tambah ke Watchlist'}">
              <i class="${isWatchlisted(c.code) ? 'fa-solid fa-star text-amber-400' : 'fa-regular fa-star text-gray-400'} text-xs"></i>
            </button>
            <div class="text-right">
              <span class="text-base font-bold text-white font-mono block">${formatIDR(c.price)}</span>
              <span class="text-xs font-semibold ${changeColor}">${changeSign}${c.change_pct}%</span>
            </div>
          </div>
        </div>

        <!-- 3-PILLAR SCORE ROW -->
        <div class="grid grid-cols-4 gap-2 bg-[#0e1117] p-2 rounded-lg border border-gray-800 text-center text-[11px]">
          <div>
            <span class="text-gray-500 text-[10px] block">Skor Total</span>
            <span class="font-bold text-emerald-400">${c.score}/100</span>
          </div>
          <div>
            <span class="text-gray-500 text-[10px] block">Bandar</span>
            <span class="font-semibold ${c.bandar_score >= 65 ? 'text-blue-400' : 'text-gray-300'}">${c.bandar_score}/100</span>
          </div>
          <div>
            <span class="text-gray-500 text-[10px] block">Fundamental</span>
            <span class="font-semibold ${c.fund_score >= 65 ? 'text-purple-400' : 'text-gray-300'}">${c.fund_score}/100</span>
          </div>
          <div>
            <span class="text-gray-500 text-[10px] block">Volume</span>
            <span class="font-semibold text-emerald-400">${c.vol_ratio}x Vol 20</span>
          </div>
        </div>

        <!-- FOOTER SUMMARY & ENTRY -->
        <div class="flex items-center justify-between pt-0.5 text-xs">
          <div class="text-[11px] text-gray-400 truncate max-w-[65%]">
            <span class="text-gray-500 font-medium">${fundText}</span>
          </div>
          <span class="text-[11px] font-semibold text-emerald-400 flex items-center gap-1 hover:underline">
            Trading Plan & Lot <i class="fa-solid fa-chevron-right text-[9px]"></i>
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
  const select = document.getElementById('calcStockSelector');
  if (!select) return;

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
  select.innerHTML = options;
}

function openStandaloneCalcModal(preselectedCode = null) {
  const modal = document.getElementById('standaloneCalcModal');
  modal.classList.remove('hidden');

  // Load capital setting from localStorage
  const savedCap = localStorage.getItem('user_trading_capital');
  if (savedCap) {
    document.getElementById('scCapital').value = savedCap;
  }

  if (preselectedCode) {
    document.getElementById('calcStockSelector').value = preselectedCode;
    handleStockSelection(preselectedCode);
  } else if (!document.getElementById('scEntry').value && currentCandidates.length > 0) {
    // Default to first candidate if empty
    const first = currentCandidates[0];
    document.getElementById('calcStockSelector').value = first.code;
    handleStockSelection(first.code);
  } else {
    runStandaloneCalc();
  }
}

function closeStandaloneCalcModal() {
  document.getElementById('standaloneCalcModal').classList.add('hidden');
}

function handleStockSelection(code) {
  if (!code) return;
  const stock = currentCandidates.find(c => c.code === code) || allTrackedStocks.find(s => s.code === code);
  if (!stock) return;

  const plan = stock.trading_plan || {
    entry: stock.price,
    stop_loss: Math.round(stock.price * 0.95)
  };

  document.getElementById('scEntry').value = plan.entry;
  document.getElementById('scStopLoss').value = plan.stop_loss;
  runStandaloneCalc();
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
    adviceEl.innerText = 'Silakan masukkan harga Entry dan Stop Loss.';
    return;
  }

  if (entry <= stopLoss) {
    adviceEl.innerText = '⚠️ Peringatan: Harga Stop Loss harus lebih rendah dari harga Entry!';
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

  adviceEl.innerText = `✅ Aman! Jika Stop Loss di ${formatIDR(stopLoss)} terkena, risiko Anda terkunci aman di ${formatIDR(actualMaxLoss)} (${riskPct}% modal).`;
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
    const res = await fetch('/api/sharia-stocks/add', {
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
    const res = await fetch('/api/telegram/config');
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
    const res = await fetch('/api/telegram/config', {
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
    const res = await fetch('/api/telegram/send-alert', { method: 'POST' });
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
// INTERACTIVE CHART RENDERING
// -------------------------------------------------------------
async function loadStockChart(code) {
  try {
    const res = await fetch(`/api/stock/${code}`);
    if (!res.ok) return;
    const data = await res.json();
    const history = data.history || [];

    const labels = history.map(h => h.date.substring(5));
    const closePrices = history.map(h => h.close);
    const ma20s = history.map(h => h.ma20);
    const ma50s = history.map(h => h.ma50);
    const ma100s = history.map(h => h.ma100);
    const ma200s = history.map(h => h.ma200);

    const ctx = document.getElementById('stockChart').getContext('2d');
    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Close',
            data: closePrices,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            fill: true,
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.1
          },
          {
            label: 'MA20',
            data: ma20s,
            borderColor: '#60a5fa',
            borderWidth: 1.5,
            pointRadius: 0,
            borderDash: [2, 2]
          },
          {
            label: 'MA50',
            data: ma50s,
            borderColor: '#f59e0b',
            borderWidth: 1.5,
            pointRadius: 0
          },
          {
            label: 'MA100',
            data: ma100s,
            borderColor: '#06b6d4',
            borderWidth: 1.5,
            pointRadius: 0
          },
          {
            label: 'MA200',
            data: ma200s,
            borderColor: '#a855f7',
            borderWidth: 1.5,
            pointRadius: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'top',
            labels: { color: '#9ca3af', font: { size: 10 } }
          }
        },
        scales: {
          x: {
            ticks: { color: '#6b7280', maxTicksLimit: 8, font: { size: 10 } },
            grid: { color: 'rgba(255, 255, 255, 0.05)' }
          },
          y: {
            ticks: { color: '#6b7280', font: { size: 10 } },
            grid: { color: 'rgba(255, 255, 255, 0.05)' }
          }
        }
      }
    });
  } catch (e) {
    console.error("Gagal load chart:", e);
  }
}

// Initial fetch on page load
document.addEventListener('DOMContentLoaded', () => {
  updateWatchlistCounter();
  fetchResults();
});
