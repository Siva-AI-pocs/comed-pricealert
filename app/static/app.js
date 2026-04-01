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
}

// Read a CSS variable resolved value from the document root
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// ── Chart state ──────────────────────────────────────────────────────────────
let chart5min   = null;
let chartHourly = null;
let range5min   = 1;
let rangeHourly = 1;

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

// ── 5-Min Chart ──────────────────────────────────────────────────────────────
async function init5MinChart() {
  const url = range5min === 1 ? '/api/prices/5min?today=true' : `/api/prices/5min?days=${range5min}`;
  const data = await fetchJSON(url);
  const labels  = data.map(d => new Date(d.millis_utc));
  const values  = data.map(d => d.price_cents);
  const colors  = values.map(priceColor);

  const ctx = document.getElementById('chart5min').getContext('2d');
  if (chart5min) chart5min.destroy();

  const merged = mergeDeep({}, chartDefaults(), zeroAnnotation(), {
    scales: { x: { time: { unit: 'hour', displayFormats: { hour: 'ha', day: 'MMM d' } } } },
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
}

// ── Hourly Chart ─────────────────────────────────────────────────────────────
async function initHourlyChart() {
  const url = rangeHourly === 1 ? '/api/prices/hourly?today=true' : `/api/prices/hourly?days=${rangeHourly}`;
  const data = await fetchJSON(url);
  const labels = data.map(d => new Date(d.hour_utc));
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
    scales: { x: { time: { unit: 'hour', displayFormats: { hour: 'ha', day: 'MMM d' } } } },
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
}

// ── Range toggle ─────────────────────────────────────────────────────────────
function setRange(chart, days, btn) {
  const parent = btn.parentElement;
  parent.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (chart === '5min') {
    range5min = days;
    init5MinChart();
  } else {
    rangeHourly = days;
    initHourlyChart();
  }
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
  const comedConn = document.getElementById('comedConnected');
  const comedDisc = document.getElementById('comedDisconnected');

  if (currentUser) {
    loggedOut.style.display = 'none';
    loggedIn.style.display  = '';
    emailEl.textContent = currentUser.email;
    subPrompt.style.display = 'none';
    subTable.style.display  = '';
    subForm.style.display   = '';
    subLoginP.style.display = 'none';
    comedSec.style.display  = '';
    if (currentUser.comed_connected) {
      comedConn.style.display = '';
      comedDisc.style.display = 'none';
    } else {
      comedConn.style.display = 'none';
      comedDisc.style.display = '';
    }
  } else {
    loggedOut.style.display = '';
    loggedIn.style.display  = 'none';
    subPrompt.style.display = '';
    subTable.style.display  = 'none';
    subForm.style.display   = 'none';
    subLoginP.style.display = '';
    comedSec.style.display  = 'none';
  }
}

function showAuthModal(mode) {
  document.getElementById('authModal').style.display = '';
  document.getElementById('modalLoginForm').style.display    = mode === 'login' ? '' : 'none';
  document.getElementById('modalRegisterForm').style.display = mode === 'register' ? '' : 'none';
  document.getElementById('loginMsg').textContent = '';
  document.getElementById('regMsg').textContent   = '';
}

function closeAuthModal() {
  document.getElementById('authModal').style.display = 'none';
}

function closeModalOnOverlay(event) {
  if (event.target === document.getElementById('authModal')) closeAuthModal();
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

function handleComedConnect() {
  window.location.href = '/auth/comed/connect';
}

async function handleComedDisconnect() {
  if (!confirm('Disconnect your ComEd account?')) return;
  await fetch('/auth/comed/disconnect', { method: 'DELETE' });
  currentUser = await (await fetch('/auth/me')).json();
  updateAuthUI();
}

function checkComedCallback() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('comed') === 'connected') {
    const banner = document.createElement('div');
    banner.className = 'comed-success-banner';
    banner.textContent = 'ComEd account connected successfully!';
    document.body.insertBefore(banner, document.body.firstChild);
    setTimeout(() => banner.remove(), 5000);
    history.replaceState({}, '', '/');
  }
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
  checkComedCallback();
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
