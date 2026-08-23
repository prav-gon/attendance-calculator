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
const exportBtn = document.getElementById('export-btn');
const importBtn = document.getElementById('import-btn');
const importFileInput = document.getElementById('import-file-input');
const todayListEl = document.getElementById('today-list');

// Short labels for the day picker buttons, in Sunday-first order —
// this matches what JavaScript's Date.getDay() returns (0 = Sunday).
const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const overallEmojiEl = document.getElementById('overall-emoji');
const heatmapGridEl = document.getElementById('heatmap-grid');
const streakBadgeEl = document.getElementById('streak-badge');

// Tracks which subject card should play a pop/shake animation on the
// NEXT render only — set right before calling render(), read once
// inside it, then cleared so it doesn't replay on every future render.
let lastActionSubjectId = null;
let lastActionType = null; // 'present' | 'absent'

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
  if (total === 0) return { pct: 0, text: '📭 No classes recorded yet.', isSafe: true };

  const pct = (attended / total) * 100;
  const tFrac = target / 100;

  if (pct >= target) {
    const canBunk = Math.floor((attended - (tFrac * total)) / tFrac);
    const text = canBunk === 0
      ? `🎯 On track (${pct.toFixed(1)}%). You cannot miss the next class.`
      : `✅ Safe (${pct.toFixed(1)}%). You can miss approximately ${canBunk} class(es).`;
    return { pct, text, isSafe: true };
  } else {
    const needToAttend = Math.ceil(((tFrac * total) - attended) / (1 - tFrac));
    return {
      pct,
      text: `🚨 Shortage (${pct.toFixed(1)}%). Attend next ${needToAttend} class(es) consecutively to hit ${target}%.`,
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
    let animationClass = '';
    if (subject.id === lastActionSubjectId) {
      animationClass = lastActionType === 'present' ? 'pop-present' : 'shake-absent';
    }
    card.className = `card subject-card ${animationClass}`;
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
      <div>
        <label class="day-picker-label">Class Days</label>
        <div class="day-picker">
          ${DAY_LABELS.map((label, dayIndex) => `
            <button
              type="button"
              class="day-btn ${(subject.schedule || []).includes(dayIndex) ? 'active' : ''}"
              onclick="toggleScheduleDay('${subject.id}', ${dayIndex})"
            >${label}</button>
          `).join('')}
        </div>
      </div>
      <div class="action-buttons">
        <button class="btn-action present" onclick="quickLog('${subject.id}', true, event)">+ Present</button>
        <button class="btn-action absent" onclick="quickLog('${subject.id}', false, event)">+ Absent</button>
      </div>
      <div class="status-badge ${isSafe ? 'status-safe' : 'status-danger'}">
        ${text}
      </div>
    `;
    subjectListEl.appendChild(card);
  });

  // The animation flag was only meant for this one render — clear it
  // so the card doesn't keep re-animating on unrelated future renders.
  lastActionSubjectId = null;
  lastActionType = null;

  const overallPct = totalAll > 0 ? (attendedAll / totalAll) * 100 : 0;
  overallPercentageEl.textContent = `${overallPct.toFixed(2)}%`;
  overallPercentageEl.style.color = overallPct >= targetThreshold ? 'var(--success)' : 'var(--danger)';
  overallStatsEl.textContent = `${attendedAll} of ${totalAll} Classes Attended`;

  // Pick a reaction emoji based on how comfortably above/below target you are.
  if (totalAll === 0) {
    overallEmojiEl.textContent = '🌱';
  } else if (overallPct >= 90) {
    overallEmojiEl.textContent = '🏆';
  } else if (overallPct >= targetThreshold) {
    overallEmojiEl.textContent = '✅';
  } else if (overallPct >= targetThreshold - 5) {
    overallEmojiEl.textContent = '⚠️';
  } else {
    overallEmojiEl.textContent = '🚨';
  }

  renderTodayClasses();
  renderHeatmap();
  saveState();
  renderHistory();
}

// ---------------------------------------------
// SCHEDULE: which weekdays each subject meets on
// ---------------------------------------------

// Adds or removes a day from a subject's schedule array.
// Same "map over the array, replace the one that matches" pattern
// used everywhere else in this file (see updateValues, quickLog).
function toggleScheduleDay(id, dayIndex) {
  subjects = subjects.map(s => {
    if (s.id !== id) return s;
    const current = s.schedule || [];
    const has = current.includes(dayIndex);
    const updatedSchedule = has
      ? current.filter(d => d !== dayIndex)   // remove it
      : [...current, dayIndex];                // add it
    return { ...s, schedule: updatedSchedule };
  });
  render();
}

// Shows which subjects are scheduled for today, with quick
// Present/Absent buttons right there — no scrolling needed.
function renderTodayClasses() {
  const todayIndex = new Date().getDay(); // 0 = Sunday ... 6 = Saturday
  const todaysSubjects = subjects.filter(s => (s.schedule || []).includes(todayIndex));

  if (todaysSubjects.length === 0) {
    todayListEl.innerHTML = '<div class="today-empty">No classes scheduled today. Set class days on each subject below.</div>';
    return;
  }

  todayListEl.innerHTML = todaysSubjects.map(s => `
    <div class="today-item">
      <span>${s.name}</span>
      <div class="action-buttons" style="width: auto; display: flex; gap: 6px;">
        <button class="btn-action present" style="padding: 6px 10px;" onclick="quickLog('${s.id}', true, event)">+ Present</button>
        <button class="btn-action absent" style="padding: 6px 10px;" onclick="quickLog('${s.id}', false, event)">+ Absent</button>
      </div>
    </div>
  `).join('');
}

// ---------------------------------------------
// HEATMAP + STREAK
// Groups history entries by calendar day (local time), then colors
// one square per day for the last 70 days — same visual idea as
// GitHub's own contribution graph.
// ---------------------------------------------

// Turns a Date into a "YYYY-MM-DD" key using LOCAL time (not UTC),
// so a class logged at 11pm doesn't accidentally count as tomorrow.
function localDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function renderHeatmap() {
  // Group every history entry by which day it happened on.
  const dayStatus = {}; // { "2026-08-24": "present" | "absent" | "mixed" }

  history.forEach(entry => {
    const key = localDateKey(new Date(entry.time));
    if (!dayStatus[key]) {
      dayStatus[key] = entry.action;
    } else if (dayStatus[key] !== entry.action) {
      dayStatus[key] = 'mixed';
    }
  });

  // Build the last 70 days (10 weeks), oldest first, so the grid
  // reads left-to-right like a calendar.
  const days = [];
  const today = new Date();
  for (let i = 69; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d);
  }

  heatmapGridEl.innerHTML = days.map(d => {
    const key = localDateKey(d);
    const status = dayStatus[key];
    let level = '0';
    if (status === 'present') level = '3';
    else if (status === 'mixed') level = '2';
    else if (status === 'absent') level = 'absent';

    const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `<div class="heatmap-cell" data-level="${level}" title="${label}"></div>`;
  }).join('');

  // Streak = consecutive days, counting back from today, that had
  // at least one "present" logged and zero "absent" logged.
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const key = localDateKey(days[i]);
    if (dayStatus[key] === 'present') {
      streak++;
    } else {
      break;
    }
  }
  streakBadgeEl.textContent = streak > 0 ? `🔥 ${streak} day streak` : '';
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
        <span class="history-tag ${entry.action}">${entry.action === 'present' ? '✅ Present' : '❌ Absent'}</span>
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
// BACKUP: EXPORT
// Bundles all our data into one JSON object, turns it into a
// downloadable file, and "clicks" a hidden link to save it.
// This is the standard vanilla-JS trick for saving a file —
// no library needed.
// ---------------------------------------------
function exportBackup() {
  const backup = {
    exportedAt: new Date().toISOString(),
    subjects,
    targetThreshold,
    history
  };

  // Turn the JS object into a text file "in memory" (a Blob),
  // then create a temporary URL that points to it.
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  // A real <a download> tag is what actually triggers a save-to-device
  // prompt in the browser. We create one, click it programmatically,
  // then throw it away — the user never sees this link exist.
  const link = document.createElement('a');
  link.href = url;
  const dateStamp = new Date().toISOString().slice(0, 10); // e.g. 2026-08-24
  link.download = `attendance-backup-${dateStamp}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------
// BACKUP: IMPORT
// Reads a file the user picks, parses it as JSON, and — after
// checking it looks like a real backup — replaces our current state.
// ---------------------------------------------
function importBackup(file) {
  const reader = new FileReader();

  reader.onload = (e) => {
    let data;
    try {
      data = JSON.parse(e.target.result);
    } catch (err) {
      alert('That file is not valid — it doesn\'t look like a backup JSON file.');
      return;
    }

    // Basic shape check so we don't silently accept a random JSON file.
    if (!Array.isArray(data.subjects)) {
      alert('That file is missing the expected data — import cancelled.');
      return;
    }

    if (!confirm('Import this backup? It will replace your current subjects, history, and threshold.')) {
      return;
    }

    subjects = data.subjects;
    targetThreshold = data.targetThreshold || 75;
    history = Array.isArray(data.history) ? data.history : [];

    thresholdInput.value = targetThreshold;
    render();
    alert('Backup imported successfully.');
  };

  reader.readAsText(file);
}

// ---------------------------------------------
// CELEBRATION EFFECTS
// Small, self-contained DOM tricks — each one creates temporary
// elements, animates them with a CSS class, then removes them
// after the animation finishes (setTimeout matches the CSS duration).
// ---------------------------------------------

// A quick "+1" or "−1" that floats up from wherever you tapped.
function floatingFeedback(event, text, color) {
  if (!event) return; // safety check, in case a caller forgets to pass it
  const rect = event.currentTarget.getBoundingClientRect();

  const el = document.createElement('div');
  el.className = 'float-feedback';
  el.textContent = text;
  el.style.left = `${rect.left + rect.width / 2 - 10}px`;
  el.style.top = `${rect.top}px`;
  el.style.color = color;
  document.body.appendChild(el);

  setTimeout(() => el.remove(), 800); // matches the 0.8s animation
}

// A burst of falling emoji across the screen, for hitting a milestone.
function launchConfetti() {
  const emojis = ['🎉', '✨', '🎊', '⭐'];
  const pieceCount = 24;

  for (let i = 0; i < pieceCount; i++) {
    const el = document.createElement('div');
    el.className = 'confetti-piece';
    el.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    el.style.left = `${Math.random() * 100}vw`;
    const duration = 1.8 + Math.random() * 1.2; // 1.8s - 3s
    el.style.animationDuration = `${duration}s`;
    el.style.animationDelay = `${Math.random() * 0.3}s`;
    document.body.appendChild(el);

    setTimeout(() => el.remove(), (duration + 0.3) * 1000);
  }
}

// A pill-shaped banner that pops in from the top, then fades out on its own.
function showCelebration(text) {
  const el = document.createElement('div');
  el.className = 'celebration-banner';
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2400); // matches the 2.4s animation
}

// ---------------------------------------------
// ACTIONS
// These are called directly from the HTML (onclick / onchange)
// so they need to live on the global scope (not inside a module).
// ---------------------------------------------
function quickLog(id, wasPresent, event) {
  const subject = subjects.find(s => s.id === id);
  if (!subject) return;

  // Snapshot the overall % BEFORE this change, so we can detect the
  // exact moment it crosses back above target (that's our "celebrate" trigger).
  const totalBefore = subjects.reduce((sum, s) => sum + s.total, 0);
  const attendedBefore = subjects.reduce((sum, s) => sum + s.attended, 0);
  const pctBefore = totalBefore > 0 ? (attendedBefore / totalBefore) * 100 : 0;

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
  logHistory(subject.name, wasPresent);

  // Flag this subject's card to animate on the next render.
  lastActionSubjectId = id;
  lastActionType = wasPresent ? 'present' : 'absent';

  floatingFeedback(event, wasPresent ? '+1 ✅' : '−1 😕', wasPresent ? '#16a34a' : '#dc2626');

  const totalAfter = subjects.reduce((sum, s) => sum + s.total, 0);
  const attendedAfter = subjects.reduce((sum, s) => sum + s.attended, 0);
  const pctAfter = totalAfter > 0 ? (attendedAfter / totalAfter) * 100 : 0;

  // The celebration moment: you were below target, and this action
  // brought your OVERALL attendance back up to/above it.
  if (pctBefore < targetThreshold && pctAfter >= targetThreshold) {
    launchConfetti();
    showCelebration('🎉 Back on track!');
  }

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
    attended: 0,
    schedule: []
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

exportBtn.addEventListener('click', exportBackup);

// The visible "Import Backup" button just opens the invisible
// file picker — this lets us style our own button instead of being
// stuck with the browser's default-looking file input.
importBtn.addEventListener('click', () => importFileInput.click());

importFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) importBackup(file);
  importFileInput.value = ''; // reset, so picking the same file twice still fires 'change'
});

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
