// ---------------------------------------------
// CORE.JS
// Loaded by BOTH pages (index.html and subject.html), before their
// own page-specific script. This keeps the data and rules identical
// everywhere, instead of copy-pasting the same logic twice.
// ---------------------------------------------

let targetThreshold = parseInt(localStorage.getItem('attendance_threshold')) || 75;

let subjects = JSON.parse(localStorage.getItem('attendance_subjects')) || [
  { id: '1', name: 'Mathematics', total: 25, attended: 20, schedule: [] }
];

let history = JSON.parse(localStorage.getItem('attendance_history')) || [];

function saveState() {
  localStorage.setItem('attendance_subjects', JSON.stringify(subjects));
  localStorage.setItem('attendance_threshold', targetThreshold);
  localStorage.setItem('attendance_history', JSON.stringify(history));
}

function getSubjectById(id) {
  return subjects.find(s => s.id === id);
}

// ---------------------------------------------
// CORE MATH
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

function localDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Records one history entry. We store subjectId (reliable even if the
// subject gets renamed later) alongside the name (for display/backup compat).
function logHistory(subject, wasPresent) {
  const totalAll = subjects.reduce((sum, s) => sum + s.total, 0);
  const attendedAll = subjects.reduce((sum, s) => sum + s.attended, 0);
  const overallPct = totalAll > 0 ? (attendedAll / totalAll) * 100 : 0;

  history.push({
    time: new Date().toISOString(),
    subjectId: subject.id,
    subject: subject.name,
    action: wasPresent ? 'present' : 'absent',
    overallPct
  });

  if (history.length > 150) {
    history = history.slice(history.length - 150);
  }
}

// ---------------------------------------------
// DATA MUTATORS
// Pure data changes — no rendering, no saving. Each page calls these,
// then handles its own render()/saveState() afterward.
// ---------------------------------------------
function quickLogCore(id, wasPresent) {
  const subject = getSubjectById(id);
  if (!subject) return null;

  const totalBefore = subjects.reduce((sum, s) => sum + s.total, 0);
  const attendedBefore = subjects.reduce((sum, s) => sum + s.attended, 0);
  const pctBefore = totalBefore > 0 ? (attendedBefore / totalBefore) * 100 : 0;

  subjects = subjects.map(s => s.id === id
    ? { ...s, total: s.total + 1, attended: wasPresent ? s.attended + 1 : s.attended }
    : s
  );
  logHistory(subject, wasPresent);

  const totalAfter = subjects.reduce((sum, s) => sum + s.total, 0);
  const attendedAfter = subjects.reduce((sum, s) => sum + s.attended, 0);
  const pctAfter = totalAfter > 0 ? (attendedAfter / totalAfter) * 100 : 0;

  return { pctBefore, pctAfter };
}

function updateValuesCore(id, field, value) {
  const numVal = Math.max(0, parseInt(value) || 0);
  subjects = subjects.map(s => {
    if (s.id !== id) return s;
    const updated = { ...s, [field]: numVal };
    if (updated.attended > updated.total) updated.total = updated.attended;
    return updated;
  });
}

function deleteSubjectCore(id) {
  subjects = subjects.filter(s => s.id !== id);
}

function toggleScheduleDayCore(id, dayIndex) {
  subjects = subjects.map(s => {
    if (s.id !== id) return s;
    const current = s.schedule || [];
    const updatedSchedule = current.includes(dayIndex)
      ? current.filter(d => d !== dayIndex)
      : [...current, dayIndex];
    return { ...s, schedule: updatedSchedule };
  });
}

function renameSubjectCore(id, newName) {
  subjects = subjects.map(s => s.id === id ? { ...s, name: newName } : s);
}

function addSubjectCore(name) {
  const newSubject = { id: Date.now().toString(), name, total: 0, attended: 0, schedule: [] };
  subjects.push(newSubject);
  return newSubject.id;
}

// ---------------------------------------------
// THEME (shared across both pages)
// ---------------------------------------------
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('attendance_theme', theme);
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}

function initTheme() {
  const saved = localStorage.getItem('attendance_theme');
  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved || (systemPrefersDark ? 'dark' : 'light'));
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

// ---------------------------------------------
// CELEBRATION EFFECTS (shared — pure DOM tricks, no page-specific data)
// ---------------------------------------------
function floatingFeedback(event, text, color) {
  if (!event) return;
  const rect = event.currentTarget.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'float-feedback';
  el.textContent = text;
  el.style.left = `${rect.left + rect.width / 2 - 10}px`;
  el.style.top = `${rect.top}px`;
  el.style.color = color;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 800);
}

function launchConfetti() {
  const emojis = ['🎉', '✨', '🎊', '⭐'];
  for (let i = 0; i < 24; i++) {
    const el = document.createElement('div');
    el.className = 'confetti-piece';
    el.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    el.style.left = `${Math.random() * 100}vw`;
    const duration = 1.8 + Math.random() * 1.2;
    el.style.animationDuration = `${duration}s`;
    el.style.animationDelay = `${Math.random() * 0.3}s`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), (duration + 0.3) * 1000);
  }
}

function showCelebration(text) {
  const el = document.createElement('div');
  el.className = 'celebration-banner';
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2400);
}

// ---------------------------------------------
// UNDO
// Each page keeps its own stack (via its own call to pushUndoSnapshot),
// but the restore logic is shared since it just swaps out the state variables.
// ---------------------------------------------
let undoStack = [];
const UNDO_LIMIT = 15;

function pushUndoSnapshot(undoBtnEl) {
  undoStack.push({
    subjects: JSON.parse(JSON.stringify(subjects)),
    history: JSON.parse(JSON.stringify(history)),
    targetThreshold
  });
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  if (undoBtnEl) undoBtnEl.classList.toggle('visible', true);
}

function undoLastAction(undoBtnEl) {
  if (undoStack.length === 0) return false;
  const snap = undoStack.pop();
  subjects = snap.subjects;
  history = snap.history;
  targetThreshold = snap.targetThreshold;
  if (undoBtnEl) undoBtnEl.classList.toggle('visible', undoStack.length > 0);
  return true;
}
