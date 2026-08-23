// ---------------------------------------------
// STATE
// This is the "single source of truth" for the app.
// Everything on screen is drawn FROM this data.
// ---------------------------------------------
let targetThreshold = 75;

let subjects = JSON.parse(localStorage.getItem('attendance_subjects')) || [
  { id: '1', name: 'Mathematics', total: 25, attended: 20 }
];

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

// ---------------------------------------------
// PERSISTENCE
// Saves the current state into the browser's
// localStorage so it survives a page refresh.
// ---------------------------------------------
function saveState() {
  localStorage.setItem('attendance_subjects', JSON.stringify(subjects));
  localStorage.setItem('attendance_threshold', targetThreshold);
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
}

// ---------------------------------------------
// ACTIONS
// These are called directly from the HTML (onclick / onchange)
// so they need to live on the global scope (not inside a module).
// ---------------------------------------------
function quickLog(id, wasPresent) {
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

// ---------------------------------------------
// INIT
// Runs once when the page first loads.
// ---------------------------------------------
const savedThreshold = localStorage.getItem('attendance_threshold');
if (savedThreshold) {
  targetThreshold = parseInt(savedThreshold);
  thresholdInput.value = targetThreshold;
}

render();
