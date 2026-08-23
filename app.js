// ---------------------------------------------
// STATE
// This is the "single source of truth" for the app.
// Everything on screen is drawn FROM this data.
// ---------------------------------------------
let targetThreshold = 75;

let subjects = JSON.parse(localStorage.getItem('attendance_subjects')) || [
  { id: '1', name: 'Mathematics', total: 25, attended: 20 }
];

// NEW: history is a growing list of "events" — one entry every time
// you tap +Present or +Absent. Each entry is a snapshot in time.
let history = JSON.parse(localStorage.getItem('attendance_history')) || [];

// ---------------------------------------------
// DOM REFERENCES
// Grab the HTML elements once, so we don't
// query the page over and over.
// ---------------------------------------------
const subjectListEl = document.getElementById('subject-list');
const overallPercentageEl = document.getElementById('overall-percentage');
const overallStatsEl = document.getElementById('overall-stats');
const thresholdInput = document.getElementById('threshold-input');
const addForm = document.getElementById('add-subject-form');
const historyListEl = document.getElementById('history-list');
const clearHistoryBtn = document.getElementById('clear-history-btn');
const trendChartCanvas = document.getElementById('trend-chart');
const chartCtx = trendChartCanvas.getContext('2d');
const themeToggleBtn = document.getElementById('theme-toggle');

// ---------------------------------------------
// PERSISTENCE
// Saves the current state into the browser's
// localStorage so it survives a page refresh.
// ---------------------------------------------
function saveState() {
  localStorage.setItem('attendance_subjects', JSON.stringify(subjects));
  localStorage.setItem('attendance_threshold', targetThreshold);
  localStorage.setItem('attendance_history', JSON.stringify(history));
}

// ---------------------------------------------
// CORE MATH
// Given a subject's attended/total classes and the
// target %, figure out if they're safe, and how many
// classes they can skip (or must attend) to stay on target.
// ---------------------------------------------
function calculateStatus(attended, total, target) {
  if (total === 0) return { pct: 0, text: 'No classes recorded yet.', isSafe: true };

  const pct = (attended / total) * 100;
  const tFrac = target / 100;

  if (pct >= target) {
    const canBunk = Math.floor((attended - (tFrac * total)) / tFrac);
    const text = canBunk === 0
      ? `On track (${pct.toFixed(1)}%). You cannot miss the next class.`
      : `Safe (${pct.toFixed(1)}%). You can miss approximately ${canBunk} class(es).`;
    return { pct, text, isSafe: true };
  } else {
    const needToAttend = Math.ceil(((tFrac * total) - attended) / (1 - tFrac));
    return {
      pct,
      text: `Shortage (${pct.toFixed(1)}%). Attend next ${needToAttend} class(es) consecutively to hit ${target}%.`,
      isSafe: false
    };
  }
}

// ---------------------------------------------
// RENDER
// Wipes the subject list and rebuilds it from
// the current `subjects` array. Called after
// every single change so the UI always matches the data.
// ---------------------------------------------
function render() {
  subjectListEl.innerHTML = '';

  let totalAll = 0;
  let attendedAll = 0;

  subjects.forEach((subject) => {
    totalAll += subject.total;
    attendedAll += subject.attended;

    const { pct, text, isSafe } = calculateStatus(subject.attended, subject.total, targetThreshold);

    const card = document.createElement('div');
    card.className = 'card subject-card';
    card.innerHTML = `
      <div class="subject-header">
        <span class="subject-title">${subject.name}</span>
        <button class="delete-btn" onclick="deleteSubject('${subject.id}')">&times;</button>
      </div>
      <div class="input-grid">
        <div class="input-group">
          <label>Total Classes</label>
          <input type="number" min="0" value="${subject.total}" onchange="updateValues('${subject.id}', 'total', this.value)" />
        </div>
        <div class="input-group">
          <label>Attended</label>
          <input type="number" min="0" value="${subject.attended}" onchange="updateValues('${subject.id}', 'attended', this.value)" />
        </div>
      </div>
      <div class="progress-bar-container">
        <div class="progress-bar-fill" style="width: ${Math.min(pct, 100)}%; background: ${isSafe ? 'var(--success)' : 'var(--danger)'}"></div>
      </div>
      <div class="action-buttons">
        <button class="btn-action present" onclick="quickLog('${subject.id}', true)">+ Present</button>
        <button class="btn-action absent" onclick="quickLog('${subject.id}', false)">+ Absent</button>
      </div>
      <div class="status-badge ${isSafe ? 'status-safe' : 'status-danger'}">
        ${text}
      </div>
    `;
    subjectListEl.appendChild(card);
  });

  const overallPct = totalAll > 0 ? (attendedAll / totalAll) * 100 : 0;
  overallPercentageEl.textContent = `${overallPct.toFixed(2)}%`;
  overallPercentageEl.style.color = overallPct >= targetThreshold ? 'var(--success)' : 'var(--danger)';
  overallStatsEl.textContent = `${attendedAll} of ${totalAll} Classes Attended`;

  saveState();
  renderHistory();
}

// ---------------------------------------------
// HISTORY: recording + rendering
// ---------------------------------------------

// Adds one entry to the `history` array. Called right after a subject's
// numbers change, so we can calculate the NEW overall % to store.
function logHistory(subjectName, wasPresent) {
  const totalAll = subjects.reduce((sum, s) => sum + s.total, 0);
  const attendedAll = subjects.reduce((sum, s) => sum + s.attended, 0);
  const overallPct = totalAll > 0 ? (attendedAll / totalAll) * 100 : 0;

  history.push({
    time: new Date().toISOString(), // stored as text, easy to save/load
    subject: subjectName,
    action: wasPresent ? 'present' : 'absent',
    overallPct: overallPct
  });

  // Keep the array from growing forever — keep the most recent 100 events.
  if (history.length > 100) {
    history = history.slice(history.length - 100);
  }
}

// Turns an ISO date string into something readable, e.g. "Aug 24, 3:16 PM"
function formatTime(isoString) {
  const d = new Date(isoString);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  });
}

function renderHistory() {
  if (history.length === 0) {
    historyListEl.innerHTML = '<div class="history-empty">No activity logged yet. Tap +Present or +Absent on a subject.</div>';
  } else {
    // .slice() copies the array so .reverse() doesn't mess up the original order.
    // We show newest first.
    const recent = history.slice().reverse().slice(0, 20);
    historyListEl.innerHTML = recent.map(entry => `
      <div class="history-item">
        <div class="history-main">
          <span class="history-subject">${entry.subject}</span>
          <span class="history-time">${formatTime(entry.time)}</span>
        </div>
        <span class="history-tag ${entry.action}">${entry.action === 'present' ? 'Present' : 'Absent'}</span>
      </div>
    `).join('');
  }

  renderChart();
}

// ---------------------------------------------
// CHART (drawn by hand on <canvas> — no external library needed,
// so it works even on a slow/unstable connection)
// ---------------------------------------------
function renderChart() {
  // Make the canvas's actual pixel size match how big it's displayed
  // on screen. Without this, drawings look blurry or wrong-sized.
  const width = trendChartCanvas.clientWidth;
  const height = trendChartCanvas.clientHeight || 180;
  trendChartCanvas.width = width;
  trendChartCanvas.height = height;

  // Wipe whatever was drawn before.
  chartCtx.clearRect(0, 0, width, height);

  if (history.length < 2) {
    chartCtx.fillStyle = '#94a3b8';
    chartCtx.font = '13px sans-serif';
    chartCtx.textAlign = 'center';
    chartCtx.fillText('Log a few +Present/+Absent taps to see your trend', width / 2, height / 2);
    return;
  }

  const padding = 24;
  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2;

  // Pick colors based on the current theme, since canvas drawings
  // don't automatically follow CSS variables like the rest of the page does.
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor = isDark ? '#334155' : '#e2e8f0';
  const labelColor = isDark ? '#94a3b8' : '#94a3b8';
  const lineColor = isDark ? '#818cf8' : '#4f46e5';
  const fillColor = isDark ? 'rgba(129, 140, 248, 0.15)' : 'rgba(79, 70, 229, 0.1)';

  // Convert a history index (0, 1, 2...) into an x pixel position,
  // and a percentage (0-100) into a y pixel position.
  // Note: y is flipped, because in canvas, y=0 is the TOP of the screen.
  function toX(index) {
    return padding + (index / (history.length - 1)) * plotWidth;
  }
  function toY(pct) {
    return padding + plotHeight - (pct / 100) * plotHeight;
  }

  // Draw light horizontal gridlines at 0%, 25%, 50%, 75%, 100%
  chartCtx.strokeStyle = gridColor;
  chartCtx.lineWidth = 1;
  chartCtx.fillStyle = labelColor;
  chartCtx.font = '10px sans-serif';
  chartCtx.textAlign = 'left';
  [0, 25, 50, 75, 100].forEach(mark => {
    const y = toY(mark);
    chartCtx.beginPath();
    chartCtx.moveTo(padding, y);
    chartCtx.lineTo(width - padding, y);
    chartCtx.stroke();
    chartCtx.fillText(mark + '%', 2, y + 3);
  });

  // Draw the filled area under the line first (so the line draws on top)
  chartCtx.beginPath();
  chartCtx.moveTo(toX(0), toY(history[0].overallPct));
  history.forEach((entry, i) => {
    chartCtx.lineTo(toX(i), toY(entry.overallPct));
  });
  chartCtx.lineTo(toX(history.length - 1), toY(0));
  chartCtx.lineTo(toX(0), toY(0));
  chartCtx.closePath();
  chartCtx.fillStyle = fillColor;
  chartCtx.fill();

  // Draw the line itself
  chartCtx.beginPath();
  history.forEach((entry, i) => {
    const x = toX(i);
    const y = toY(entry.overallPct);
    if (i === 0) chartCtx.moveTo(x, y);
    else chartCtx.lineTo(x, y);
  });
  chartCtx.strokeStyle = lineColor;
  chartCtx.lineWidth = 2;
  chartCtx.stroke();

  // Draw a dot at each data point
  chartCtx.fillStyle = lineColor;
  history.forEach((entry, i) => {
    chartCtx.beginPath();
    chartCtx.arc(toX(i), toY(entry.overallPct), 3, 0, Math.PI * 2);
    chartCtx.fill();
  });
}

function clearHistory() {
  if (!confirm('Clear all history log entries? This cannot be undone.')) return;
  history = [];
  saveState();
  renderHistory();
}

// ---------------------------------------------
// DARK MODE
// We store the choice as a string 'dark' or 'light' in localStorage.
// `data-theme="dark"` on the <html> tag is what the CSS in
// style.css watches for — see the [data-theme="dark"] block there.
// ---------------------------------------------
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeToggleBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
  localStorage.setItem('attendance_theme', theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
  // The chart is drawn with plain colors, not CSS variables, so it
  // needs a manual redraw after a theme switch to match the new look.
  renderChart();
}

// ---------------------------------------------
// ACTIONS
// These are called directly from the HTML (onclick / onchange)
// so they need to live on the global scope (not inside a module).
// ---------------------------------------------
function quickLog(id, wasPresent) {
  const subject = subjects.find(s => s.id === id);

  subjects = subjects.map(s => {
    if (s.id === id) {
      return {
        ...s,
        total: s.total + 1,
        attended: wasPresent ? s.attended + 1 : s.attended
      };
    }
    return s;
  });

  // Only +Present/+Absent taps create history entries — manual number
  // edits below don't, since they're corrections, not real events.
  if (subject) logHistory(subject.name, wasPresent);

  render();
}

function updateValues(id, field, value) {
  const numVal = Math.max(0, parseInt(value) || 0);
  subjects = subjects.map(s => {
    if (s.id === id) {
      const updated = { ...s, [field]: numVal };
      if (updated.attended > updated.total) {
        updated.total = updated.attended;
      }
      return updated;
    }
    return s;
  });
  render();
}

function deleteSubject(id) {
  subjects = subjects.filter(s => s.id !== id);
  render();
}

// ---------------------------------------------
// EVENT LISTENERS
// ---------------------------------------------
addForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('subject-name');
  const name = input.value.trim();
  if (!name) return;

  subjects.push({
    id: Date.now().toString(),
    name,
    total: 0,
    attended: 0
  });

  input.value = '';
  render();
});

thresholdInput.addEventListener('change', (e) => {
  targetThreshold = Math.min(100, Math.max(1, parseInt(e.target.value) || 75));
  render();
});

clearHistoryBtn.addEventListener('click', clearHistory);
themeToggleBtn.addEventListener('click', toggleTheme);

// ---------------------------------------------
// INIT
// Runs once when the page first loads.
// ---------------------------------------------
const savedThreshold = localStorage.getItem('attendance_threshold');
if (savedThreshold) {
  targetThreshold = parseInt(savedThreshold);
  thresholdInput.value = targetThreshold;
}

// Theme: use the saved choice if one exists, otherwise fall back to
// whatever the phone/browser's system-wide dark mode setting is.
const savedTheme = localStorage.getItem('attendance_theme');
const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
applyTheme(savedTheme || (systemPrefersDark ? 'dark' : 'light'));

render();
