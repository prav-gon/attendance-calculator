// State structure with LocalStorage backup
let subjects = JSON.parse(localStorage.getItem('attendance_subjects')) || [
  { id: 1, name: 'Physics', total: 27, attended: 21 }
];

const TARGET_PERCENTAGE = 75;

// Elements
const subjectsContainer = document.getElementById('subjects-container');
const addSubjectForm = document.getElementById('add-subject-form');
const subjectNameInput = document.getElementById('subject-name-input');
const mascotContainer = document.getElementById('mascot-container');
const overallStatusEl = document.getElementById('overall-status');

// Save to LocalStorage
function saveSubjects() {
  localStorage.setItem('attendance_subjects', JSON.stringify(subjects));
}

// Calculate bunk limit or needed attendance
function calculateAttendanceInfo(attended, total) {
  if (total === 0) {
    return {
      percentage: 0,
      isSafe: true,
      message: 'No classes conducted yet.'
    };
  }

  const percentage = (attended / total) * 100;
  const isSafe = percentage >= TARGET_PERCENTAGE;

  if (isSafe) {
    // Formula: floor((attended - 0.75 * total) / 0.75)
    const canBunk = Math.floor((attended - (TARGET_PERCENTAGE / 100) * total) / (TARGET_PERCENTAGE / 100));
    const message = canBunk > 0 
      ? `Safe (${percentage.toFixed(1)}%). You can miss approximately ${canBunk} class(es).`
      : `Safe (${percentage.toFixed(1)}%). Missing the next class will drop you below ${TARGET_PERCENTAGE}%.`;
    return { percentage: percentage.toFixed(1), isSafe: true, message };
  } else {
    // Formula: ceil((0.75 * total - attended) / (1 - 0.75))
    const needToAttend = Math.ceil(((TARGET_PERCENTAGE / 100) * total - attended) / (1 - (TARGET_PERCENTAGE / 100)));
    const message = `Shortage (${percentage.toFixed(1)}%). Attend next ${needToAttend} class(es) consecutively to reach ${TARGET_PERCENTAGE}%.`;
    return { percentage: percentage.toFixed(1), isSafe: false, message };
  }
}

// Render UI
function render() {
  subjectsContainer.innerHTML = '';
  
  let totalAttendedAll = 0;
  let totalClassesAll = 0;

  subjects.forEach(subject => {
    totalAttendedAll += subject.attended;
    totalClassesAll += subject.total;

    const info = calculateAttendanceInfo(subject.attended, subject.total);

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-header">
        <h2 class="card-title">${escapeHtml(subject.name)}</h2>
        <button class="delete-btn" onclick="deleteSubject(${subject.id})" title="Delete Subject">&times;</button>
      </div>

      <div class="stats-grid">
        <div class="stat-field">
          <label>Total Classes</label>
          <input 
            type="number" 
            min="0" 
            value="${subject.total}" 
            onchange="updateCounts(${subject.id}, 'total', this.value)"
          />
        </div>
        <div class="stat-field">
          <label>Attended</label>
          <input 
            type="number" 
            min="0" 
            value="${subject.attended}" 
            onchange="updateCounts(${subject.id}, 'attended', this.value)"
          />
        </div>
      </div>

      <div class="progress-bar-bg">
        <div class="progress-bar-fill" style="width: ${Math.min(info.percentage, 100)}%;"></div>
      </div>

      <div class="action-buttons">
        <button class="btn btn-secondary btn-animated" onclick="logAttendance(${subject.id}, true)">+ Present</button>
        <button class="btn btn-secondary btn-animated" onclick="logAttendance(${subject.id}, false)">+ Absent</button>
      </div>

      <div class="status-badge ${info.isSafe ? 'safe' : 'danger'}">
        ${info.message}
      </div>
    `;

    subjectsContainer.appendChild(card);
  });

  // Update Mascot Mood and Overall Header
  if (subjects.length === 0) {
    mascotContainer.className = 'mascot-wrapper safe';
    overallStatusEl.textContent = 'No subjects added yet.';
  } else {
    const overallInfo = calculateAttendanceInfo(totalAttendedAll, totalClassesAll);
    if (overallInfo.isSafe) {
      mascotContainer.className = 'mascot-wrapper safe';
      overallStatusEl.textContent = `Overall: Safe at ${overallInfo.percentage}%`;
    } else {
      mascotContainer.className = 'mascot-wrapper danger';
      overallStatusEl.textContent = `Overall: Warning at ${overallInfo.percentage}%`;
    }
  }
}

// Action Handlers
window.logAttendance = function(id, isPresent) {
  subjects = subjects.map(s => {
    if (s.id === id) {
      return {
        ...s,
        total: s.total + 1,
        attended: isPresent ? s.attended + 1 : s.attended
      };
    }
    return s;
  });
  saveSubjects();
  render();
};

window.updateCounts = function(id, field, value) {
  const num = Math.max(0, parseInt(value, 10) || 0);
  subjects = subjects.map(s => {
    if (s.id === id) {
      const updated = { ...s, [field]: num };
      // Keep attended from exceeding total classes
      if (updated.attended > updated.total) {
        updated.total = updated.attended;
      }
      return updated;
    }
    return s;
  });
  saveSubjects();
  render();
};

window.deleteSubject = function(id) {
  subjects = subjects.filter(s => s.id !== id);
  saveSubjects();
  render();
};

// Add Subject
addSubjectForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = subjectNameInput.value.trim();
  if (!name) return;

  subjects.push({
    id: Date.now(),
    name,
    total: 0,
    attended: 0
  });

  subjectNameInput.value = '';
  saveSubjects();
  render();
});

// Utility to sanitize HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.innerText = text;
  return div.innerHTML;
}

// Initial Run
render();
