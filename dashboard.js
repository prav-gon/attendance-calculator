// ---------------------------------------------
// DASHBOARD.JS
// Runs only on index.html. Assumes core.js has already loaded
// (see the <script> order in index.html) — that's where `subjects`,
// `history`, `targetThreshold`, and all the shared functions live.
// ---------------------------------------------

const subjectRowListEl = document.getElementById('subject-row-list');
const overallPercentageEl = document.getElementById('overall-percentage');
const overallStatsEl = document.getElementById('overall-stats');
const overallEmojiEl = document.getElementById('overall-emoji');
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
const heatmapGridEl = document.getElementById('heatmap-grid');
const streakBadgeEl = document.getElementById('streak-badge');
const undoBtn = document.getElementById('undo-btn');

function render() {
  let totalAll = 0;
  let attendedAll = 0;
  subjects.forEach(s => { totalAll += s.total; attendedAll += s.attended; });

  const overallPct = totalAll > 0 ? (attendedAll / totalAll) * 100 : 0;
  overallPercentageEl.textContent = `${overallPct.toFixed(2)}%`;
  overallPercentageEl.style.color = overallPct >= targetThreshold ? 'var(--success)' : 'var(--danger)';
  overallStatsEl.textContent = `${attendedAll} of ${totalAll} Classes Attended`;

  if (totalAll === 0) overallEmojiEl.textContent = '🌱';
  else if (overallPct >= 90) overallEmojiEl.textContent = '🏆';
  else if (overallPct >= targetThreshold) overallEmojiEl.textContent = '✅';
  else if (overallPct >= targetThreshold - 5) overallEmojiEl.textContent = '⚠️';
  else overallEmojiEl.textContent = '🚨';

  renderSubjectRows();
  renderTodayClasses();
  renderHeatmap();
  saveState();
  renderHistory();
}

// ---------------------------------------------
// SUBJECT LIST (now just a clickable list — details live on their own page)
// ---------------------------------------------
function renderSubjectRows() {
  if (subjects.length === 0) {
    subjectRowListEl.innerHTML = '<div class="today-empty">No subjects yet — add one below.</div>';
    return;
  }

  subjectRowListEl.innerHTML = subjects.map(s => {
    const { pct, isSafe } = calculateStatus(s.attended, s.total, targetThreshold);
    return `
      <a class="subject-row" href="subject.html?id=${s.id}">
        <div class="subject-row-top">
          <span class="subject-row-name">${s.name}</span>
          <span class="subject-row-pct" style="color: ${isSafe ? 'var(--success)' : 'var(--danger)'}">${pct.toFixed(1)}%</span>
        </div>
        <div class="mini-progress">
          <div class="mini-progress-fill" style="width: ${Math.min(pct, 100)}%; background: ${isSafe ? 'var(--success)' : 'var(--danger)'}"></div>
        </div>
      </a>
    `;
  }).join('');
}

// ---------------------------------------------
// TODAY'S CLASSES (quick-log without leaving the dashboard)
// ---------------------------------------------
function renderTodayClasses() {
  const todayIndex = new Date().getDay();
  const todaysSubjects = subjects.filter(s => (s.schedule || []).includes(todayIndex));

  if (todaysSubjects.length === 0) {
    todayListEl.innerHTML = '<div class="today-empty">No classes scheduled today. Set class days on each subject\'s page.</div>';
    return;
  }

  todayListEl.innerHTML = todaysSubjects.map(s => `
    <div class="today-item">
      <span>${s.name}</span>
      <div class="action-buttons" style="width: auto; display: flex; gap: 6px;">
        <button class="btn-action present" style="padding: 6px 10px;" onclick="dashboardQuickLog('${s.id}', true, event)">+ Present</button>
        <button class="btn-action absent" style="padding: 6px 10px;" onclick="dashboardQuickLog('${s.id}', false, event)">+ Absent</button>
      </div>
    </div>
  `).join('');
}

function dashboardQuickLog(id, wasPresent, event) {
  pushUndoSnapshot(undoBtn);
  const result = quickLogCore(id, wasPresent);
  if (!result) return;

  floatingFeedback(event, wasPresent ? '+1 ✅' : '−1 😕', wasPresent ? '#16a34a' : '#dc2626');

  if (result.pctBefore < targetThreshold && result.pctAfter >= targetThreshold) {
    launchConfetti();
    showCelebration('🎉 Back on track!');
  }

  render();
}

// ---------------------------------------------
// HEATMAP + STREAK
// ---------------------------------------------
function renderHeatmap() {
  const dayStatus = {};
  history.forEach(entry => {
    const key = localDateKey(new Date(entry.time));
    if (!dayStatus[key]) dayStatus[key] = entry.action;
    else if (dayStatus[key] !== entry.action) dayStatus[key] = 'mixed';
  });

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

  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (dayStatus[localDateKey(days[i])] === 'present') streak++;
    else break;
  }
  streakBadgeEl.textContent = streak > 0 ? `🔥 ${streak} day streak` : '';
}

// ---------------------------------------------
// HISTORY LOG (all subjects combined)
// ---------------------------------------------
function formatTime(isoString) {
  const d = new Date(isoString);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function renderHistory() {
  if (history.length === 0) {
    historyListEl.innerHTML = '<div class="history-empty">No activity logged yet.</div>';
  } else {
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

function clearHistory() {
  if (!confirm('Clear all history log entries? This cannot be undone.')) return;
  pushUndoSnapshot(undoBtn);
  history = [];
  saveState();
  renderHistory();
}

// ---------------------------------------------
// TREND CHART (hand-drawn on canvas, no external library)
// ---------------------------------------------
function renderChart() {
  const width = trendChartCanvas.clientWidth;
  const height = trendChartCanvas.clientHeight || 180;
  trendChartCanvas.width = width;
  trendChartCanvas.height = height;
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
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor = isDark ? '#334155' : '#e2e8f0';
  const labelColor = '#94a3b8';
  const lineColor = isDark ? '#818cf8' : '#4f46e5';
  const fillColor = isDark ? 'rgba(129, 140, 248, 0.15)' : 'rgba(79, 70, 229, 0.1)';

  function toX(i) { return padding + (i / (history.length - 1)) * plotWidth; }
  function toY(pct) { return padding + plotHeight - (pct / 100) * plotHeight; }

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

  chartCtx.beginPath();
  chartCtx.moveTo(toX(0), toY(history[0].overallPct));
  history.forEach((entry, i) => chartCtx.lineTo(toX(i), toY(entry.overallPct)));
  chartCtx.lineTo(toX(history.length - 1), toY(0));
  chartCtx.lineTo(toX(0), toY(0));
  chartCtx.closePath();
  chartCtx.fillStyle = fillColor;
  chartCtx.fill();

  chartCtx.beginPath();
  history.forEach((entry, i) => {
    const x = toX(i), y = toY(entry.overallPct);
    if (i === 0) chartCtx.moveTo(x, y); else chartCtx.lineTo(x, y);
  });
  chartCtx.strokeStyle = lineColor;
  chartCtx.lineWidth = 2;
  chartCtx.stroke();

  chartCtx.fillStyle = lineColor;
  history.forEach((entry, i) => {
    chartCtx.beginPath();
    chartCtx.arc(toX(i), toY(entry.overallPct), 3, 0, Math.PI * 2);
    chartCtx.fill();
  });
}

// ---------------------------------------------
// BACKUP: EXPORT / IMPORT
// ---------------------------------------------
function exportBackup() {
  const backup = { exportedAt: new Date().toISOString(), subjects, targetThreshold, history };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `attendance-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function importBackup(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    let data;
    try { data = JSON.parse(e.target.result); }
    catch (err) { alert('That file is not valid JSON.'); return; }
    if (!Array.isArray(data.subjects)) { alert('That file is missing expected data.'); return; }
    if (!confirm('Import this backup? It will replace your current data.')) return;

    pushUndoSnapshot(undoBtn);
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
// EVENT LISTENERS
// ---------------------------------------------
addForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('subject-name');
  const name = input.value.trim();
  if (!name) return;
  pushUndoSnapshot(undoBtn);
  addSubjectCore(name);
  input.value = '';
  render();
});

thresholdInput.addEventListener('change', (e) => {
  pushUndoSnapshot(undoBtn);
  targetThreshold = Math.min(100, Math.max(1, parseInt(e.target.value) || 75));
  render();
});

clearHistoryBtn.addEventListener('click', clearHistory);
themeToggleBtn.addEventListener('click', () => { toggleTheme(); renderChart(); });
undoBtn.addEventListener('click', () => { if (undoLastAction(undoBtn)) render(); });
exportBtn.addEventListener('click', exportBackup);
importBtn.addEventListener('click', () => importFileInput.click());
importFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) importBackup(file);
  importFileInput.value = '';
});

// ---------------------------------------------
// INIT
// ---------------------------------------------
thresholdInput.value = targetThreshold;
initTheme();
render();
