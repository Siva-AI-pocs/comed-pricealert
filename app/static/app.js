'use strict';

// ── Color helpers ────────────────────────────────────────────────────────────
function priceColor(p) {
  if (p === null || p === undefined) return 'var(--muted)';
  if (p <= 0)  return 'var(--green)';
  if (p <= 3)  return 'var(--blue)';
  if (p <= 8)  return 'var(--orange)';
  return 'var(--red)';
}

function priceColorClass(p) {
  if (p === null || p === undefined) return '';
  if (p <= 0)  return 'green';
  if (p <= 3)  return 'blue';
  if (p <= 8)  return 'orange';
  return 'red';
}

function fmt(p) {
  if (p === null || p === undefined) return '—';
  return p.toFixed(2) + '¢';
}

// ── Theme ────────────────────────────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  document.getElementById('themeBtn').textContent = saved === 'dark' ? '🌙' : '☀️';
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  document.getElementById('themeBtn').textContent = next === 'dark' ? '🌙' : '☀️';
  // Rebuild charts so colors update
  init5MinChart();
  initHourlyChart();
  if (currentUser) { initUsageChart(); loadUsageInsights(); }
}

// Read a CSS variable resolved value from the document root
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// ── Chart state ──────────────────────────────────────────────────────────────
let chart5min   = null;
let chartHourly = null;

// Per-chart time-range drill-down. Each key holds either a preset {hours} window
// or a custom {startMs,endMs} window; renderers turn that into ?start=&end= (ms).
const RANGE_PRESETS = [['1h',1],['4h',4],['12h',12],['24h',24],['48h',48],['72h',72],['7d',168],['30d',720]];
const chartRange = {
  '5min':     { hours: 24 },
  'hourly':   { hours: 24 },
  'usage':    { hours: 720 },
  'insights': { hours: 720 },
};
function chartRenderer(key) {
  return { '5min': init5MinChart, 'hourly': initHourlyChart,
           'usage': initUsageChart, 'insights': loadUsageInsights }[key];
}

// Called each time a chart is built so colors match current theme
function chartDefaults() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: cssVar('--chart-tooltip-bg'),
        borderColor: cssVar('--chart-tooltip-border'),
        borderWidth: 1,
        titleColor: cssVar('--chart-tooltip-title'),
        bodyColor: cssVar('--chart-tooltip-body'),
      },
      zoom: {
        zoom: { drag: { enabled: true, backgroundColor: 'rgba(99,102,241,0.15)' }, mode: 'x' },
        pan: { enabled: false },
      },
    },
    scales: {
      x: {
        type: 'time',
        grid: { color: cssVar('--chart-grid') },
        ticks: { color: cssVar('--chart-tick'), maxTicksLimit: 8 },
      },
      y: {
        grid: { color: cssVar('--chart-grid') },
        ticks: { color: cssVar('--chart-tick'), callback: v => v.toFixed(1) + '¢' },
      },
    },
  };
}

function zeroAnnotation() {
  return {
    plugins: {
      annotation: {
        annotations: {
          zeroline: {
            type: 'line',
            yMin: 0,
            yMax: 0,
            borderColor: 'rgba(34,197,94,0.5)',
            borderWidth: 1,
            borderDash: [4, 4],
            label: { content: '0¢', display: true, color: '#22c55e', font: { size: 10 } },
          },
        },
      },
    },
  };
}

// ── Per-chart range controls (presets + custom + drag-zoom) ──────────────────
function rangeWindow(key) {
  const r = chartRange[key];
  if (r.startMs != null && r.endMs != null) return { start: r.startMs, end: r.endMs };
  const end = Date.now();
  return { start: end - r.hours * 3600e3, end };
}
function rangeParams(key) {
  const { start, end } = rangeWindow(key);
  return `start=${Math.round(start)}&end=${Math.round(end)}`;
}
function timeUnit(key) {
  const { start, end } = rangeWindow(key);
  return (end - start) / 3600e3 <= 48 ? 'hour' : 'day';
}
function mountRangeControls(key) {
  const bar = document.getElementById('range-' + key);
  if (!bar) return;
  const r = chartRange[key];
  const isCustom = r.startMs != null;
  bar.innerHTML =
    RANGE_PRESETS.map(([label, hours]) =>
      `<button class="range-btn${!isCustom && r.hours === hours ? ' active' : ''}" onclick="setChartRange('${key}',${hours},this)">${label}</button>`
    ).join('') +
    `<button class="range-btn${isCustom ? ' active' : ''}" onclick="toggleCustom('${key}')">Custom</button>`;
  const c = document.getElementById('custom-' + key);
  if (c && !c.dataset.built) {
    c.innerHTML =
      `From <input type="datetime-local" id="cstart-${key}"> ` +
      `To <input type="datetime-local" id="cend-${key}"> ` +
      `<button class="range-btn" onclick="applyCustomRange('${key}')">Apply</button>`;
    c.dataset.built = '1';
  }
}
function setChartRange(key, hours, btn) {
  chartRange[key] = { hours };
  const c = document.getElementById('custom-' + key);
  if (c) c.style.display = 'none';
  mountRangeControls(key);
  chartRenderer(key)();
}
function toggleCustom(key) {
  const c = document.getElementById('custom-' + key);
  if (c) c.style.display = c.style.display === 'none' ? '' : 'none';
}
function applyCustomRange(key) {
  const sv = document.getElementById('cstart-' + key).value;
  const ev = document.getElementById('cend-' + key).value;
  if (!sv || !ev) return;
  const startMs = new Date(sv).getTime();
  const endMs = new Date(ev).getTime();
  if (isNaN(startMs) || isNaN(endMs) || startMs >= endMs) return;
  chartRange[key] = { startMs, endMs };
  mountRangeControls(key);
  chartRenderer(key)();
}
function attachZoomReset(canvasId, chart) {
  const cv = document.getElementById(canvasId);
  if (cv) cv.ondblclick = () => chart.resetZoom();
}

// ── 5-Min Chart ──────────────────────────────────────────────────────────────
async function init5MinChart() {
  mountRangeControls('5min');
  const data = await fetchJSON('/api/prices/5min?' + rangeParams('5min')) || [];
  const labels  = data.map(d => new Date(d.millis_utc));
  const values  = data.map(d => d.price_cents);

  const ctx = document.getElementById('chart5min').getContext('2d');
  if (chart5min) chart5min.destroy();

  const merged = mergeDeep({}, chartDefaults(), zeroAnnotation(), {
    scales: { x: { time: { unit: timeUnit('5min'), displayFormats: { hour: 'ha', day: 'MMM d' } } } },
  });

  chart5min = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: values,
        borderColor: cssVar('--chart-line'),
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.2,
        segment: {
          borderColor: ctx2 => {
            const p = ctx2.p1.parsed.y;
            if (p <= 0) return cssVar('--green');
            if (p <= 3) return cssVar('--blue');
            if (p <= 8) return cssVar('--orange');
            return cssVar('--red');
          },
        },
        fill: false,
      }],
    },
    options: merged,
  });
  attachZoomReset('chart5min', chart5min);
}

// ── Hourly Chart ─────────────────────────────────────────────────────────────
async function initHourlyChart() {
  mountRangeControls('hourly');
  const data = await fetchJSON('/api/prices/hourly?' + rangeParams('hourly')) || [];
  const labels = data.map(d => new Date(d.hour_utc + 'Z'));
  const values = data.map(d => d.avg_price_cents);
  const colors = values.map(p => priceColor(p).replace('var(', '').replace(')', ''));

  // Resolve CSS vars to hex for Chart.js bar colors
  const colorMap = {
    '--green':  '#22c55e',
    '--blue':   '#3b82f6',
    '--orange': '#f97316',
    '--red':    '#ef4444',
    '--muted':  '#8b90a8',
  };
  const bgColors = values.map(p => {
    const cv = priceColor(p);
    for (const [k, v] of Object.entries(colorMap)) {
      if (cv.includes(k)) return v + 'cc';
    }
    return '#6366f1cc';
  });

  const ctx = document.getElementById('chartHourly').getContext('2d');
  if (chartHourly) chartHourly.destroy();

  const merged = mergeDeep({}, chartDefaults(), zeroAnnotation(), {
    scales: { x: { time: { unit: timeUnit('hourly'), displayFormats: { hour: 'ha', day: 'MMM d' } } } },
  });

  chartHourly = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: bgColors,
        borderRadius: 3,
        borderSkipped: false,
      }],
    },
    options: merged,
  });
  attachZoomReset('chartHourly', chartHourly);
}


// ── Stats bar ────────────────────────────────────────────────────────────────
async function updateStats() {
  const s = await fetchJSON('/api/prices/stats');
  if (!s) return;

  const p = s.current_price;
  const cls = priceColorClass(p);

  document.getElementById('livePrice').textContent = fmt(p) + '/kWh';
  document.getElementById('statCurrent').textContent = fmt(p);
  document.getElementById('statCurrent').className = 'stat-value ' + cls;
  document.getElementById('cardCurrent').className = 'stat-card ' + cls;

  document.getElementById('statHourAvg').textContent = fmt(s.hourly_avg);
  document.getElementById('statDayMin').textContent  = fmt(s.day_min);
  document.getElementById('statDayMax').textContent  = fmt(s.day_max);
  document.getElementById('statWeekAvg').textContent = fmt(s.week_avg);

  // Update footer with actual data timestamp instead of client fetch time
  if (s.last_updated_utc) {
    const dataTime = new Date(s.last_updated_utc + 'Z').toLocaleTimeString();
    document.getElementById('lastUpdated').textContent = dataTime;
  } else {
    document.getElementById('lastUpdated').textContent = new Date().toLocaleTimeString();
  }

  // Staleness warning
  const stalenessEl = document.getElementById('stalenessWarning');
  if (s.data_age_seconds > 600) {
    const dataTime = s.last_updated_utc
      ? new Date(s.last_updated_utc + 'Z').toLocaleTimeString()
      : '—';
    stalenessEl.textContent = '\u26a0 Data delayed — last updated: ' + dataTime;
    stalenessEl.style.display = '';
  } else {
    stalenessEl.style.display = 'none';
  }

  // Negative price banner
  const negBanner = document.getElementById('negativePriceBanner');
  negBanner.style.display = (p <= 0) ? '' : 'none';
}

// ── Decision Engine Banner ────────────────────────────────────────────────────
async function updateDecision() {
  const banner = document.getElementById('decisionBanner');
  try {
    const d = await fetchJSON('/api/decision');
    if (!d) {
      banner.style.display = 'none';
      return;
    }

    banner.className = 'decision-banner ' + (d.color_class || '');

    if (d.level === 'negative') {
      banner.innerHTML = '<span class="decision-banner-emoji">⚡</span>'
        + '<span class="decision-banner-label" style="color:var(--green);font-weight:800">'
        + 'You\'re being paid to use electricity!'
        + '</span>';
    } else {
      banner.innerHTML = '<span class="decision-banner-emoji">' + (d.emoji || '') + '</span>'
        + '<span class="decision-banner-label">' + (d.label || '') + '</span>'
        + '<span class="decision-banner-rec">' + (d.recommendation || '') + '</span>';
    }

    banner.style.display = '';
  } catch {
    banner.style.display = 'none';
  }
}

// ── 7-Day Daily Summary ───────────────────────────────────────────────────────
async function loadDailySummary() {
  const data = await fetchJSON('/api/prices/daily-summary');
  const el = document.getElementById('dailyTableContainer');
  if (!data || data.length === 0) {
    el.innerHTML = '<p style="color:var(--muted);font-size:13px">No data available.</p>';
    return;
  }

  const rows = data.map(day => {
    const dateStr = new Date(day.date).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
    });
    const minCls = priceColorClass(day.min_price);
    const maxCls = priceColorClass(day.max_price);
    const avgCls = priceColorClass(day.avg_price);
    return `<tr>
      <td>${dateStr}</td>
      <td class="${minCls}">${fmt(day.min_price)}</td>
      <td class="${maxCls}">${fmt(day.max_price)}</td>
      <td class="${avgCls}">${fmt(day.avg_price)}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <table>
      <thead><tr>
        <th>Date</th><th>Low</th><th>High</th><th>Avg</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// ── Auth state ───────────────────────────────────────────────────────────────
let currentUser = null;

async function initAuth() {
  try {
    const resp = await fetch('/auth/me');
    if (resp.ok) {
      currentUser = await resp.json();
    } else {
      currentUser = null;
    }
  } catch {
    currentUser = null;
  }
  updateAuthUI();
}

function updateAuthUI() {
  const loggedOut = document.getElementById('authLoggedOut');
  const loggedIn  = document.getElementById('authLoggedIn');
  const emailEl   = document.getElementById('authUserEmail');
  const subPrompt = document.getElementById('subsLoginPrompt');
  const subTable  = document.getElementById('subsTableContainer');
  const subForm   = document.getElementById('subscribeFormWrapper');
  const subLoginP = document.getElementById('subscribeLoginPrompt');
  const comedSec  = document.getElementById('comedSection');

  if (currentUser) {
    loggedOut.style.display = 'none';
    loggedIn.style.display  = '';
    emailEl.textContent = currentUser.email;
    subPrompt.style.display = 'none';
    subTable.style.display  = '';
    subForm.style.display   = '';
    subLoginP.style.display = 'none';
    comedSec.style.display  = '';
    // Usage / insights card visibility is decided by their loaders based on data.
    initUsageChart();
    loadUsageInsights();
    loadUsageMeters();
  } else {
    loggedOut.style.display = '';
    loggedIn.style.display  = 'none';
    subPrompt.style.display = '';
    subTable.style.display  = 'none';
    subForm.style.display   = 'none';
    subLoginP.style.display = '';
    comedSec.style.display  = 'none';
    // Hide all usage-dependent UI when logged out.
    ['usageChartCard', 'usagePriceCard', 'savingsCard', 'usageCompareWidget', 'usageSavingsNav']
      .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
  }
}

function showAuthModal(mode) {
  document.getElementById('authModal').style.display = '';
  document.getElementById('modalLoginForm').style.display    = mode === 'login' ? '' : 'none';
  document.getElementById('modalRegisterForm').style.display = mode === 'register' ? '' : 'none';
  document.getElementById('modalForgotForm').style.display   = mode === 'forgot' ? '' : 'none';
  document.getElementById('loginMsg').textContent  = '';
  document.getElementById('regMsg').textContent    = '';
  document.getElementById('forgotMsg').textContent = '';
  // Reset the forgot flow back to step 1 (request a code) each time it opens.
  if (mode === 'forgot') {
    document.getElementById('forgotResetFields').style.display = 'none';
    document.getElementById('forgotSendBtn').disabled = false;
  }
}

function closeAuthModal() {
  document.getElementById('authModal').style.display = 'none';
}

function showChangePwModal() {
  ['changeOldPassword', 'changeNewPassword', 'changeConfirmPassword'].forEach((id) => {
    document.getElementById(id).value = '';
  });
  document.getElementById('changePwMsg').textContent = '';
  document.getElementById('changePwModal').style.display = '';
}

function closeChangePwModal() {
  document.getElementById('changePwModal').style.display = 'none';
}

function closeModalOnOverlay(event) {
  if (event.target === document.getElementById('authModal')) closeAuthModal();
  if (event.target === document.getElementById('changePwModal')) closeChangePwModal();
}

async function handleLogin() {
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const msg      = document.getElementById('loginMsg');
  msg.textContent = '';
  try {
    const resp = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (resp.ok) {
      currentUser = await resp.json();
      closeAuthModal();
      updateAuthUI();
      loadSubscriptions();
    } else {
      const err = await resp.json();
      msg.textContent = err.detail || 'Login failed.';
      msg.className = 'form-msg error';
    }
  } catch {
    msg.textContent = 'Network error. Please try again.';
    msg.className = 'form-msg error';
  }
}

async function handleRegister() {
  const email    = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const msg      = document.getElementById('regMsg');
  msg.textContent = '';
  try {
    const resp = await fetch('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (resp.ok) {
      currentUser = await resp.json();
      closeAuthModal();
      updateAuthUI();
      loadSubscriptions();
    } else {
      const err = await resp.json();
      msg.textContent = err.detail || 'Registration failed.';
      msg.className = 'form-msg error';
    }
  } catch {
    msg.textContent = 'Network error. Please try again.';
    msg.className = 'form-msg error';
  }
}

async function handleLogout() {
  await fetch('/auth/logout', { method: 'POST' });
  currentUser = null;
  updateAuthUI();
}

async function handleChangePassword() {
  const oldPassword = document.getElementById('changeOldPassword').value;
  const newPassword = document.getElementById('changeNewPassword').value;
  const confirm     = document.getElementById('changeConfirmPassword').value;
  const msg         = document.getElementById('changePwMsg');
  const btn         = document.getElementById('changePwBtn');
  msg.textContent = '';
  if (newPassword.length < 8) {
    msg.textContent = 'New password must be at least 8 characters.';
    msg.className = 'form-msg error';
    return;
  }
  if (newPassword !== confirm) {
    msg.textContent = 'New passwords do not match.';
    msg.className = 'form-msg error';
    return;
  }
  btn.disabled = true;
  try {
    const resp = await fetch('/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
    });
    if (resp.ok) {
      msg.textContent = 'Password changed successfully.';
      msg.className = 'form-msg success';
      setTimeout(closeChangePwModal, 1200);
    } else {
      const err = await resp.json();
      msg.textContent = err.detail || 'Could not change password.';
      msg.className = 'form-msg error';
    }
  } catch {
    msg.textContent = 'Network error. Please try again.';
    msg.className = 'form-msg error';
  } finally {
    btn.disabled = false;
  }
}

async function handleForgotPassword() {
  const email = document.getElementById('forgotEmail').value.trim();
  const msg   = document.getElementById('forgotMsg');
  const btn   = document.getElementById('forgotSendBtn');
  msg.textContent = '';
  btn.disabled = true;
  try {
    const resp = await fetch('/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await resp.json();
    if (resp.ok) {
      msg.textContent = data.message || 'Reset code sent — check your inbox.';
      msg.className = 'form-msg success';
      document.getElementById('forgotResetFields').style.display = '';
    } else {
      msg.textContent = data.detail || 'Could not send reset code.';
      msg.className = 'form-msg error';
      btn.disabled = false;
    }
  } catch {
    msg.textContent = 'Network error. Please try again.';
    msg.className = 'form-msg error';
    btn.disabled = false;
  }
}

async function handleResetPassword() {
  const email       = document.getElementById('forgotEmail').value.trim();
  const code        = document.getElementById('forgotCode').value.trim();
  const newPassword = document.getElementById('forgotNewPassword').value;
  const confirm     = document.getElementById('forgotConfirmPassword').value;
  const msg         = document.getElementById('forgotMsg');
  const btn         = document.getElementById('forgotResetBtn');
  msg.textContent = '';
  if (newPassword.length < 8) {
    msg.textContent = 'New password must be at least 8 characters.';
    msg.className = 'form-msg error';
    return;
  }
  if (newPassword !== confirm) {
    msg.textContent = 'New passwords do not match.';
    msg.className = 'form-msg error';
    return;
  }
  btn.disabled = true;
  try {
    const resp = await fetch('/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code, new_password: newPassword }),
    });
    const data = await resp.json();
    if (resp.ok) {
      msg.textContent = (data.message || 'Password reset.') + ' Redirecting to login…';
      msg.className = 'form-msg success';
      setTimeout(() => showAuthModal('login'), 1200);
    } else {
      msg.textContent = data.detail || 'Could not reset password.';
      msg.className = 'form-msg error';
    }
  } catch {
    msg.textContent = 'Network error. Please try again.';
    msg.className = 'form-msg error';
  } finally {
    btn.disabled = false;
  }
}

// ── Usage upload + chart ─────────────────────────────────────────────────────
let chartUsage = null;

async function handleUsageUpload(event) {
  event.preventDefault();
  const input = document.getElementById('usageFileInput');
  const btn   = document.getElementById('usageUploadBtn');
  const msg   = document.getElementById('usageUploadMsg');
  const f     = input.files[0];
  if (!f) return;

  btn.disabled = true;
  btn.textContent = 'Uploading…';
  msg.textContent = '';
  msg.className = 'form-msg';

  const form = new FormData();
  form.append('file', f);
  try {
    const resp = await fetch('/api/usage/upload', { method: 'POST', body: form });
    const data = await resp.json();
    if (resp.ok) {
      msg.textContent = `Imported ${data.intervals_inserted} intervals from ${data.range_start_utc?.slice(0,10) || '?'} to ${data.range_end_utc?.slice(0,10) || '?'}.`;
      msg.className = 'form-msg success';
      input.value = '';
      await Promise.all([initUsageChart(), loadUsageInsights(), loadUsageMeters()]);
    } else {
      msg.textContent = data.detail || 'Upload failed.';
      msg.className = 'form-msg error';
    }
  } catch {
    msg.textContent = 'Network error.';
    msg.className = 'form-msg error';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Upload';
  }
}

async function loadUsageMeters() {
  if (!currentUser) return;
  const meters = await fetchJSON('/api/usage/meters');
  const wrap   = document.getElementById('usageMetersWrapper');
  const table  = document.getElementById('usageMetersTable');
  if (!meters || meters.length === 0) {
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = '';
  const rows = meters.map(m => `
    <tr>
      <td>${m.espi_usage_point_id}</td>
      <td>${m.service_kind}</td>
      <td>${m.interval_count}</td>
      <td>${new Date(m.created_at).toLocaleDateString()}</td>
      <td><button class="unsub-btn" onclick="deleteMeter(${m.id})">Delete</button></td>
    </tr>
  `).join('');
  table.innerHTML = `
    <table>
      <thead><tr><th>Usage Point</th><th>Kind</th><th>Intervals</th><th>First imported</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

async function deleteMeter(meterId) {
  if (!confirm('Delete this meter and all its interval data?')) return;
  await fetch(`/api/usage/meter/${meterId}`, { method: 'DELETE' });
  await Promise.all([initUsageChart(), loadUsageMeters()]);
}

async function initUsageChart() {
  if (!currentUser) return;
  mountRangeControls('usage');
  const data = await fetchJSON('/api/usage/hourly?' + rangeParams('usage')) || [];
  const card   = document.getElementById('usageChartCard');
  const canvas = document.getElementById('chartUsage');
  if (!data || data.length === 0) {
    card.style.display = 'none';
    if (chartUsage) { chartUsage.destroy(); chartUsage = null; }
    return;
  }
  card.style.display = '';
  const labels = data.map(d => new Date(d.hour_utc + 'Z'));
  const values = data.map(d => d.kwh);

  const ctx = canvas.getContext('2d');
  if (chartUsage) chartUsage.destroy();

  const merged = mergeDeep({}, chartDefaults(), {
    scales: {
      x: { time: { unit: timeUnit('usage'), displayFormats: { hour: 'ha', day: 'MMM d' } } },
      y: { ticks: { color: cssVar('--chart-tick'), callback: v => v.toFixed(2) + ' kWh' } },
    },
  });

  chartUsage = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: '#6366f1cc',
        borderRadius: 3,
        borderSkipped: false,
      }],
    },
    options: merged,
  });
  attachZoomReset('chartUsage', chartUsage);
}

// ── Usage vs price + savings insights ────────────────────────────────────────
let chartUsagePrice = null;
let shiftPct = 30;            // percent, mirrors #shiftPctSlider
let shiftDebounce = null;

const _usd = c => '$' + (c / 100).toFixed(2);

function onShiftPctChange() {
  const slider = document.getElementById('shiftPctSlider');
  shiftPct = parseInt(slider.value, 10);
  document.getElementById('shiftPctLabel').textContent = shiftPct + '%';
  clearTimeout(shiftDebounce);
  shiftDebounce = setTimeout(loadUsageInsights, 200);
}

async function loadUsageInsights() {
  if (!currentUser) return;
  mountRangeControls('insights');
  const data = await fetchJSON(`/api/usage/insights?${rangeParams('insights')}&shiftable_pct=${(shiftPct / 100).toFixed(2)}`);
  const priceCard = document.getElementById('usagePriceCard');
  const savingsCard = document.getElementById('savingsCard');
  if (!data || !data.hourly || data.hourly.length === 0) {
    priceCard.style.display = 'none';
    savingsCard.style.display = 'none';
    document.getElementById('usageCompareWidget').style.display = 'none';
    document.getElementById('usageSavingsNav').style.display = 'none';
    if (chartUsagePrice) { chartUsagePrice.destroy(); chartUsagePrice = null; }
    return;
  }
  priceCard.style.display = '';
  savingsCard.style.display = '';

  const labels = data.hourly.map(d => new Date(d.hour_utc + 'Z'));
  const usage  = data.hourly.map(d => d.kwh);
  const price  = data.hourly.map(d => d.price_cents);

  const merged = mergeDeep({}, chartDefaults(), {
    plugins: { legend: { display: true } },
    scales: {
      x: { time: { unit: timeUnit('insights'), displayFormats: { hour: 'ha', day: 'MMM d' } } },
      y: { position: 'left', ticks: { color: cssVar('--chart-tick'), callback: v => v.toFixed(1) + ' kWh' } },
      y1: {
        position: 'right',
        grid: { drawOnChartArea: false },
        ticks: { color: cssVar('--chart-tick'), callback: v => v.toFixed(0) + '¢' },
      },
    },
  });

  const ctx = document.getElementById('chartUsagePrice').getContext('2d');
  if (chartUsagePrice) chartUsagePrice.destroy();
  chartUsagePrice = new Chart(ctx, {
    data: {
      labels,
      datasets: [
        { type: 'bar', label: 'Usage (kWh)', data: usage, yAxisID: 'y',
          backgroundColor: '#6366f1aa', borderRadius: 3, borderSkipped: false, order: 2 },
        { type: 'line', label: 'Price (¢/kWh)', data: price, yAxisID: 'y1',
          borderColor: '#ef4444', borderWidth: 2, tension: 0.2, pointRadius: 0, order: 1 },
      ],
    },
    options: merged,
  });
  attachZoomReset('chartUsagePrice', chartUsagePrice);

  const s = data.summary;
  const pct = s.actual_cost_cents > 0 ? Math.round((s.shift_savings_cents / s.actual_cost_cents) * 100) : 0;
  document.getElementById('savingsSummary').innerHTML =
    `<div class="stat-value green">${_usd(s.shift_savings_cents)}</div>` +
    `<div class="stat-label">est. savings on your usage (${pct}%)</div>` +
    `<p class="hint" style="margin-top:8px">Shift ~${s.shiftable_kwh.toFixed(1)} kWh from peak to the cheapest hours: ` +
    `${_usd(s.actual_cost_cents)} → ${_usd(s.optimized_cost_cents)}.</p>`;

  const flatDelta = s.hourly_vs_flat_cents;
  const verdict = flatDelta >= 0
    ? `hourly pricing saved you <b>${_usd(flatDelta)}</b>`
    : `hourly pricing cost <b>${_usd(-flatDelta)}</b> more`;
  document.getElementById('billCompare').innerHTML =
    `<div class="stat-label">Bill comparison</div>` +
    `<p class="hint" style="margin-top:4px">On hourly pricing you paid <b>${_usd(s.actual_cost_cents)}</b>. ` +
    `At a flat ${s.flat_rate_cents}¢/kWh you'd pay <b>${_usd(s.flat_cost_cents)}</b> — ${verdict}.</p>`;

  // Top widget: flat vs hourly cost for the user's usage, click to jump to details.
  const cheaper = flatDelta >= 0;
  document.getElementById('usageCompareWidget').innerHTML =
    `<div class="stat-card"><div class="stat-label">Your usage · hourly pricing</div>` +
      `<div class="stat-value">${_usd(s.actual_cost_cents)}</div></div>` +
    `<div class="stat-card"><div class="stat-label">Same usage · flat ${s.flat_rate_cents}¢/kWh</div>` +
      `<div class="stat-value">${_usd(s.flat_cost_cents)}</div></div>` +
    `<div class="stat-card ${cheaper ? 'green' : 'orange'}">` +
      `<div class="stat-label">${cheaper ? 'Hourly pricing saved' : 'Hourly pricing cost extra'}</div>` +
      `<div class="stat-value ${cheaper ? 'green' : 'orange'}">${_usd(Math.abs(flatDelta))}</div></div>` +
    `<div class="stat-card"><div class="stat-label">Shift-to-cheap savings →</div>` +
      `<div class="stat-value green">${_usd(s.shift_savings_cents)}</div></div>`;
  document.getElementById('usageCompareWidget').style.display = '';
  document.getElementById('usageSavingsNav').style.display = '';
}

function scrollToUsageComparison() {
  const card = document.getElementById('usagePriceCard');
  // If the comparison is live, jump to it; otherwise send the user to the
  // upload card (no overlapping usage/price yet) so they know what to do.
  const target = (card && card.style.display !== 'none')
    ? card
    : document.getElementById('comedSection');
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Subscriptions table ──────────────────────────────────────────────────────
async function loadSubscriptions() {
  if (!currentUser) {
    updateAuthUI();
    return;
  }
  const subs = await fetchJSON('/api/subscriptions');
  const el = document.getElementById('subsTableContainer');
  if (!subs || subs.length === 0) {
    el.innerHTML = '<p style="color:var(--muted);font-size:13px">No subscriptions yet.</p>';
    return;
  }
  const active = subs.filter(s => s.active);
  if (active.length === 0) {
    el.innerHTML = '<p style="color:var(--muted);font-size:13px">No active subscriptions.</p>';
    return;
  }
  const rows = active.map(s => `
    <tr>
      <td>${s.email || '—'}</td>
      <td>${s.telegram_chat_id || '—'}</td>
      <td>${s.whatsapp_number || '—'}</td>
      <td>${s.threshold_cents.toFixed(2)}¢</td>
      <td>${s.last_alerted_at ? new Date(s.last_alerted_at).toLocaleString() : '—'}</td>
      <td style="display:flex;gap:6px">
        <button class="send-now-btn" onclick="sendAlertNow(${s.id}, this)">Send Now</button>
        <button class="unsub-btn" onclick="unsubscribe(${s.id})">Remove</button>
      </td>
    </tr>
  `).join('');
  el.innerHTML = `
    <table>
      <thead><tr>
        <th>Email</th><th>Telegram ID</th><th>WhatsApp</th>
        <th>Threshold</th><th>Last Alert</th><th></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

async function sendAlertNow(id, btn) {
  btn.disabled = true;
  btn.textContent = '…';
  try {
    const resp = await fetch(`/api/subscriptions/${id}/alert`, { method: 'POST' });
    const data = await resp.json();
    if (resp.ok) {
      const results = Object.entries(data.channels).map(([ch, r]) => `${ch}: ${r}`).join(', ');
      btn.textContent = '✓ Sent';
      btn.style.borderColor = 'var(--green)';
      btn.style.color = 'var(--green)';
      setTimeout(() => { btn.textContent = 'Send Now'; btn.style.borderColor = ''; btn.style.color = ''; btn.disabled = false; }, 3000);
      loadSubscriptions();
    } else {
      btn.textContent = 'Failed';
      btn.style.borderColor = 'var(--red)';
      btn.style.color = 'var(--red)';
      setTimeout(() => { btn.textContent = 'Send Now'; btn.style.borderColor = ''; btn.style.color = ''; btn.disabled = false; }, 3000);
    }
  } catch {
    btn.textContent = 'Error';
    setTimeout(() => { btn.textContent = 'Send Now'; btn.disabled = false; }, 3000);
  }
}

async function unsubscribe(id) {
  if (!confirm('Remove this subscription?')) return;
  try {
    await fetch(`/api/subscribe/${id}`, { method: 'DELETE' });
    loadSubscriptions();
  } catch (e) {
    alert('Error removing subscription.');
  }
}

// ── Subscribe form ───────────────────────────────────────────────────────────
async function handleSubscribe(event) {
  event.preventDefault();
  const btn = document.getElementById('submitBtn');
  const msg = document.getElementById('formMsg');
  const email     = document.getElementById('inputEmail').value.trim() || null;
  const telegram  = document.getElementById('inputTelegram').value.trim() || null;
  const whatsapp  = document.getElementById('inputWhatsapp').value.trim() || null;
  const threshold = parseFloat(document.getElementById('inputThreshold').value);
  const highThreshold = document.getElementById('inputHighThreshold').value;

  if (!email && !telegram && !whatsapp) {
    msg.textContent = 'Please provide at least one notification channel (Email, Telegram, or WhatsApp).';
    msg.className = 'error';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Subscribing…';
  msg.textContent = '';
  msg.className = '';

  try {
    const resp = await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        telegram_chat_id: telegram,
        whatsapp_number: whatsapp,
        threshold_cents: isNaN(threshold) ? 0 : threshold,
        high_threshold_cents: highThreshold ? parseFloat(highThreshold) : null,
      }),
    });
    if (resp.ok) {
      msg.textContent = 'Subscribed! You will receive a confirmation message shortly.';
      msg.className = 'success';
      document.getElementById('subscribeForm').reset();
      loadSubscriptions();
    } else {
      const err = await resp.json();
      msg.textContent = err.detail || 'Subscription failed.';
      msg.className = 'error';
    }
  } catch (e) {
    msg.textContent = 'Network error. Please try again.';
    msg.className = 'error';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Subscribe';
  }
}

// ── Utilities ────────────────────────────────────────────────────────────────
async function fetchJSON(url) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

function mergeDeep(target, ...sources) {
  for (const source of sources) {
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (!target[key]) target[key] = {};
        mergeDeep(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
  }
  return target;
}

// ── Init + auto-refresh ──────────────────────────────────────────────────────
async function init() {
  initTheme();
  await initAuth();
  await updateStats();
  await updateDecision();
  await Promise.all([init5MinChart(), initHourlyChart(), loadSubscriptions(), loadDailySummary()]);
}

init();
setInterval(() => { updateStats(); updateDecision(); }, 30_000);  // stats + decision every 30s
setInterval(init5MinChart, 300_000);        // 5-min chart every 5min
setInterval(initHourlyChart, 300_000);      // hourly chart every 5min
setInterval(loadSubscriptions, 60_000);     // subscriptions every 1min
setInterval(loadDailySummary, 300_000);     // daily summary every 5min
