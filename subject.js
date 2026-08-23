// ---------------------------------------------
// SUBJECT.JS
// Runs only on subject.html. The key new idea here: this page doesn't
// know WHICH subject to show until it reads the URL itself.
//
// When the dashboard links to "subject.html?id=1234", everything after
// the "?" is called a query string. We read it with URLSearchParams —
// a built-in browser tool for parsing that part of the URL.
// ---------------------------------------------

const params = new URLSearchParams(window.location.search);
const subjectId = params.get('id'); // reads the "id" value from ?id=1234

const nameInput = document.getElementById('subject-name-input');
const deleteBtn = document.getElementById('delete-subject-btn');
const inputTotal = document.getElementById('input-total');
const inputAttended = document.getElementById('input-attended');
const progressFill = document.getElementById('detail-progress-fill');
const dayPickerEl = document.getElementById('detail-day-picker');
const presentBtn = document.getElementById('detail-present-btn');
const absentBtn = document.getElementById('detail-absent-btn');
const statusBadge = document.getElementById('detail-status-badge');
const detailCard = document.getElementById('subject-detail-card');
const subjectHistoryListEl = document.getElementById('subject-history-list');
const themeToggleBtn = document.getElementById('theme-toggle');
const undoBtn = document.getElementById('undo-btn');

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// If someone opens subject.html directly with no valid ID (or the
// subject was deleted from another tab), send them back to the dashboard
// instead of showing a broken page.
if (!subjectId || !getSubjectById(subjectId)) {
  window.location.href = 'index.html';
}

function render() {
  const subject = getSubjectById(subjectId);
  if (!subject) { window.location.href = 'index.html'; return; }

  document.title = `${subject.name} — Attendance`;
  nameInput.value = subject.name;
  inputTotal.value = subject.total;
  inputAttended.value = subject.attended;

  const { pct, text, isSafe } = calculateStatus(subject.attended, subject.total, targetThreshold);
  progressFill.style.width = `${Math.min(pct, 100)}%`;
  progressFill.style.background = isSafe ? 'var(--success)' : 'var(--danger)';

  statusBadge.textContent = text;
  statusBadge.className = `status-badge ${isSafe ? 'status-safe' : 'status-danger'}`;

  dayPickerEl.innerHTML = DAY_LABELS.map((label, dayIndex) => `
    <button type="button" class="day-btn ${(subject.schedule || []).includes(dayIndex) ? 'active' : ''}" data-day="${dayIndex}">${label}</button>
  `).join('');
  dayPickerEl.querySelectorAll('.day-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      pushUndoSnapshot(undoBtn);
      toggleScheduleDayCore(subjectId, parseInt(btn.dataset.day));
      saveState();
      render();
    });
  });

  renderSubjectHistory(subject);
  saveState();
}

function renderSubjectHistory(subject) {
  // Show only history entries that belong to THIS subject. Older entries
  // (from before we started storing subjectId) fall back to name matching.
  const relevant = history.filter(e => e.subjectId ? e.subjectId === subject.id : e.subject === subject.name);

  if (relevant.length === 0) {
    subjectHistoryListEl.innerHTML = '<div class="history-empty">No activity logged yet for this subject.</div>';
    return;
  }

  const recent = relevant.slice().reverse().slice(0, 15);
  subjectHistoryListEl.innerHTML = recent.map(entry => `
    <div class="history-item">
      <span class="history-time">${new Date(entry.time).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
      <span class="history-tag ${entry.action}">${entry.action === 'present' ? '✅ Present' : '❌ Absent'}</span>
    </div>
  `).join('');
}

// ---------------------------------------------
// ACTIONS
// ---------------------------------------------
presentBtn.addEventListener('click', (event) => doQuickLog(true, event));
absentBtn.addEventListener('click', (event) => doQuickLog(false, event));

function doQuickLog(wasPresent, event) {
  pushUndoSnapshot(undoBtn);
  const result = quickLogCore(subjectId, wasPresent);
  if (!result) return;

  floatingFeedback(event, wasPresent ? '+1 ✅' : '−1 😕', wasPresent ? '#16a34a' : '#dc2626');
  detailCard.classList.remove('pop-present', 'shake-absent');
  void detailCard.offsetWidth; // forces the browser to notice the class was removed, so re-adding it replays the animation
  detailCard.classList.add(wasPresent ? 'pop-present' : 'shake-absent');

  if (result.pctBefore < targetThreshold && result.pctAfter >= targetThreshold) {
    launchConfetti();
    showCelebration('🎉 Back on track!');
  }

  render();
}

inputTotal.addEventListener('change', (e) => {
  pushUndoSnapshot(undoBtn);
  updateValuesCore(subjectId, 'total', e.target.value);
  render();
});

inputAttended.addEventListener('change', (e) => {
  pushUndoSnapshot(undoBtn);
  updateValuesCore(subjectId, 'attended', e.target.value);
  render();
});

nameInput.addEventListener('change', (e) => {
  const newName = e.target.value.trim();
  if (!newName) { render(); return; } // ignore blank, restore old name
  pushUndoSnapshot(undoBtn);
  renameSubjectCore(subjectId, newName);
  render();
});

deleteBtn.addEventListener('click', () => {
  const subject = getSubjectById(subjectId);
  if (!confirm(`Delete "${subject.name}"? This cannot be undone from here — you'd need to go back and use Undo immediately.`)) return;
  pushUndoSnapshot(undoBtn);
  deleteSubjectCore(subjectId);
  saveState();
  window.location.href = 'index.html';
});

themeToggleBtn.addEventListener('click', toggleTheme);
undoBtn.addEventListener('click', () => { if (undoLastAction(undoBtn)) render(); });

// ---------------------------------------------
// INIT
// ---------------------------------------------
initTheme();
render();
