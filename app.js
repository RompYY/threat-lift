// ============================================================
// LIFT LEVEL — app logic
// All state lives in localStorage under STORAGE_KEY. No network.
// ============================================================

const STORAGE_KEY = 'liftlevel_state_v1';
const PROGRAM_LENGTH_DAYS = 90;

// ---------- Default state ----------
function defaultState() {
  const today = todayISO();
  return {
    version: 1,
    startDate: today,
    xp: 0,
    streak: { current: 0, longest: 0, lastCompletedDate: null },
    logs: {},        // { 'YYYY-MM-DD': { dayKey, sets: {exId: [bool...]}, completed, xpEarned } }
    prs: {},          // { exerciseName: [ {date, weight, reps, note} ] }
    weight: { unit: 'lb', entries: [], lastPromptedWeek: null, dismissedWeeks: [] },
    backup: { exportedWeeks: [], dismissedPrompts: [] },
    settings: { weighInDay: 1 /* Monday, ISO weekday */ },
  };
}

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    // shallow-merge with defaults so new fields don't break old saves
    return Object.assign(defaultState(), parsed, {
      streak: Object.assign(defaultState().streak, parsed.streak || {}),
      weight: Object.assign(defaultState().weight, parsed.weight || {}),
      backup: Object.assign(defaultState().backup, parsed.backup || {}),
      settings: Object.assign(defaultState().settings, parsed.settings || {}),
    });
  } catch (e) {
    console.error('Failed to load state, starting fresh', e);
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ---------- Date helpers ----------
function todayISO(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}

function daysBetween(isoA, isoB) {
  const a = new Date(isoA + 'T00:00:00');
  const b = new Date(isoB + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}

function isoWeekKey(iso) {
  // returns a Mon-anchored week key like '2026-09-01'
  const d = new Date(iso + 'T00:00:00');
  const wd = isoWeekday(d);
  d.setDate(d.getDate() - (wd - 1));
  return todayISO(d);
}

// ---------- XP / Level system ----------
const XP_PER_SET = 10;
const XP_EXERCISE_BONUS = 15;
const XP_DAY_BONUS = 50;
const XP_STREAK_MILESTONE_BONUS = 100; // awarded at 7, 14, 21... day streaks

function xpThresholdForLevel(level) {
  // XP required to go FROM level TO level+1
  return 100 + (level - 1) * 50;
}

function levelInfo(totalXp) {
  let level = 1;
  let remaining = totalXp;
  while (remaining >= xpThresholdForLevel(level)) {
    remaining -= xpThresholdForLevel(level);
    level += 1;
  }
  return {
    level,
    xpIntoLevel: remaining,
    xpForNextLevel: xpThresholdForLevel(level),
  };
}

const LEVEL_TITLES = [
  'Rookie', 'Gym Newbie', 'Iron Initiate', 'Grinder', 'Steel Apprentice',
  'Consistent Lifter', 'Iron Regular', 'Discipline Builder', 'Gains Chaser', 'Strength Seeker',
  'Iron Veteran', 'Habit Master', 'Forged', 'Relentless', 'Iron Warrior',
  'Elite Grinder', 'Unbreakable', 'Titan', 'Legend', 'Apex Lifter',
];
function levelTitle(level) {
  return LEVEL_TITLES[Math.min(level, LEVEL_TITLES.length) - 1] + (level > LEVEL_TITLES.length ? ` (Lv.${level})` : '');
}

// ---------- Program day helpers ----------
function getDayForDate(iso) {
  const wd = isoWeekday(new Date(iso + 'T00:00:00'));
  return WORKOUT_PROGRAM[wd];
}

function getLog(iso) {
  return state.logs[iso] || null;
}

function ensureLog(iso) {
  if (!state.logs[iso]) {
    const day = getDayForDate(iso);
    state.logs[iso] = {
      dayKey: day.key,
      sets: {},
      completed: false,
      xpEarned: 0,
    };
    day.exercises.forEach(ex => {
      state.logs[iso].sets[ex.id] = new Array(ex.sets).fill(false);
    });
  }
  return state.logs[iso];
}

function isRestDay(iso) {
  return getDayForDate(iso).key === 'rest';
}

// Toggle a single set checkbox
function toggleSet(iso, exerciseId, setIndex) {
  const log = ensureLog(iso);
  const arr = log.sets[exerciseId];
  const wasChecked = arr[setIndex];
  arr[setIndex] = !wasChecked;

  if (!wasChecked) {
    state.xp += XP_PER_SET;
    log.xpEarned += XP_PER_SET;
    if (arr.every(Boolean)) {
      state.xp += XP_EXERCISE_BONUS;
      log.xpEarned += XP_EXERCISE_BONUS;
    }
  } else {
    state.xp = Math.max(0, state.xp - XP_PER_SET);
    log.xpEarned = Math.max(0, log.xpEarned - XP_PER_SET);
  }

  const day = getDayForDate(iso);
  const allDone = day.exercises.every(ex => log.sets[ex.id].every(Boolean));
  if (allDone && !log.completed) {
    log.completed = true;
    state.xp += XP_DAY_BONUS;
    log.xpEarned += XP_DAY_BONUS;
    updateStreak(iso);
  } else if (!allDone && log.completed) {
    log.completed = false;
    state.xp = Math.max(0, state.xp - XP_DAY_BONUS);
    log.xpEarned = Math.max(0, log.xpEarned - XP_DAY_BONUS);
  }

  saveState();
}

function updateStreak(completedIso) {
  const s = state.streak;
  if (s.lastCompletedDate) {
    const gap = daysBetween(s.lastCompletedDate, completedIso);
    // gap of 1 = consecutive calendar day; allow rest days to not break streak
    // by checking scheduled training days only: streak counts consecutive
    // *completed training days* regardless of rest days in between, as long
    // as no scheduled training day was skipped.
    if (gap <= 0) {
      // same day re-trigger, ignore
    } else if (noSkippedTrainingDayBetween(s.lastCompletedDate, completedIso)) {
      s.current += 1;
    } else {
      s.current = 1;
    }
  } else {
    s.current = 1;
  }
  s.lastCompletedDate = completedIso;
  s.longest = Math.max(s.longest, s.current);

  if (s.current > 0 && s.current % 7 === 0) {
    state.xp += XP_STREAK_MILESTONE_BONUS;
  }
}

function noSkippedTrainingDayBetween(fromIso, toIso) {
  // walk days strictly between from and to; if any is a training day, streak breaks
  let cursor = new Date(fromIso + 'T00:00:00');
  const end = new Date(toIso + 'T00:00:00');
  cursor.setDate(cursor.getDate() + 1);
  while (cursor < end) {
    const iso = todayISO(cursor);
    if (!isRestDay(iso)) return false;
    cursor.setDate(cursor.getDate() + 1);
  }
  return true;
}

// ---------- PR logging ----------
function addPR(exerciseName, weight, reps, note) {
  if (!state.prs[exerciseName]) state.prs[exerciseName] = [];
  state.prs[exerciseName].push({
    date: todayISO(),
    weight: Number(weight),
    reps: reps ? Number(reps) : null,
    note: note || '',
  });
  state.prs[exerciseName].sort((a, b) => a.date.localeCompare(b.date));
  state.xp += 25; // small XP reward for logging a PR
  saveState();
}

function deletePR(exerciseName, index) {
  if (!state.prs[exerciseName]) return;
  state.prs[exerciseName].splice(index, 1);
  saveState();
}

function bestPR(exerciseName) {
  const arr = state.prs[exerciseName];
  if (!arr || arr.length === 0) return null;
  return arr.reduce((best, cur) => (cur.weight > best.weight ? cur : best), arr[0]);
}

// ---------- Weight log ----------
function addWeightEntry(weight) {
  state.weight.entries.push({ date: todayISO(), weight: Number(weight) });
  state.weight.entries.sort((a, b) => a.date.localeCompare(b.date));
  state.xp += 15;
  saveState();
}

function deleteWeightEntry(index) {
  state.weight.entries.splice(index, 1);
  saveState();
}

function lastWeighInDate() {
  const entries = state.weight.entries;
  if (entries.length === 0) return null;
  return entries[entries.length - 1].date;
}

function shouldPromptWeighIn() {
  const wk = isoWeekKey(todayISO());
  const wd = isoWeekday(new Date());
  const last = lastWeighInDate();
  const daysSince = last ? daysBetween(last, todayISO()) : Infinity;
  const alreadyDismissed = state.weight.dismissedWeeks.includes(wk);
  // Prompt on/after the configured weigh-in day (default Monday) if it's
  // been 7+ days since the last entry, and not dismissed this week.
  if (alreadyDismissed) return false;
  if (daysSince < 7) return false;
  return wd >= state.settings.weighInDay || last === null;
}

function dismissWeighInPrompt() {
  const wk = isoWeekKey(todayISO());
  if (!state.weight.dismissedWeeks.includes(wk)) {
    state.weight.dismissedWeeks.push(wk);
  }
  saveState();
}

// ---------- Weekly backup reminder ----------
// Prompts right after Saturday's (day 6) workout is completed — the last
// scheduled training day of the week. If that gets missed (workout not
// completed, or app not opened), it catches you on Monday instead, asking
// about the week that just ended.
function weekKeyOffset(days) {
  const d = new Date(todayISO() + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return isoWeekKey(todayISO(d));
}

function getBackupPrompt() {
  const wd = isoWeekday(new Date());
  const thisWeek = weekKeyOffset(0);

  if (wd === 6) {
    const log = getLog(todayISO());
    const promptKey = `${thisWeek}-sat`;
    if (
      log && log.completed &&
      !state.backup.exportedWeeks.includes(thisWeek) &&
      !state.backup.dismissedPrompts.includes(promptKey)
    ) {
      return { key: promptKey, weekKey: thisWeek, message: 'Nice work finishing this week’s training. Download a backup of your data?' };
    }
  }

  if (wd === 1) {
    const lastWeek = weekKeyOffset(-7);
    const promptKey = `${lastWeek}-mon`;
    if (
      !state.backup.exportedWeeks.includes(lastWeek) &&
      !state.backup.dismissedPrompts.includes(promptKey)
    ) {
      return { key: promptKey, weekKey: lastWeek, message: 'Looks like last week’s data never got backed up. Download it now?' };
    }
  }

  return null;
}

function markWeekBackedUp(weekKey) {
  if (!state.backup.exportedWeeks.includes(weekKey)) {
    state.backup.exportedWeeks.push(weekKey);
  }
  saveState();
}

function dismissBackupPrompt(promptKey) {
  if (!state.backup.dismissedPrompts.includes(promptKey)) {
    state.backup.dismissedPrompts.push(promptKey);
  }
  saveState();
}

// ---------- Program day counter ----------
function programDayNumber() {
  return daysBetween(state.startDate, todayISO()) + 1;
}
function isInHabitPhase() {
  return programDayNumber() <= PROGRAM_LENGTH_DAYS;
}

// ---------- Export / Import ----------
function exportData(weekKeyToMark) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `liftlevel-backup-${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  // A manual export always counts toward this week's reminder; if triggered
  // from the weekly popup, also mark the specific week it was nudging about.
  markWeekBackedUp(weekKeyOffset(0));
  if (weekKeyToMark) markWeekBackedUp(weekKeyToMark);
}

function importData(file, onDone) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      state = Object.assign(defaultState(), parsed);
      saveState();
      onDone(true);
    } catch (e) {
      console.error(e);
      onDone(false);
    }
  };
  reader.readAsText(file);
}

// ============================================================
// UI RENDERING
// ============================================================

const appEl = document.getElementById('app');
let activeTab = 'today';
let selectedDateIso = todayISO(); // Today tab can browse other days of the week

function render() {
  appEl.innerHTML = '';
  appEl.appendChild(renderHeader());
  const banner = renderWeighInBanner();
  if (banner) appEl.appendChild(banner);

  const content = document.createElement('div');
  content.className = 'content';
  if (activeTab === 'today') content.appendChild(renderToday());
  else if (activeTab === 'progress') content.appendChild(renderProgress());
  else if (activeTab === 'weight') content.appendChild(renderWeight());
  else if (activeTab === 'profile') content.appendChild(renderProfile());
  appEl.appendChild(content);

  appEl.appendChild(renderTabBar());

  const backupModal = renderBackupModal();
  if (backupModal) appEl.appendChild(backupModal);
}

function renderBackupModal() {
  const prompt = getBackupPrompt();
  if (!prompt) return null;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-card">
      <div class="modal-icon">📦</div>
      <h3>Back up your data</h3>
      <p>${prompt.message}</p>
      <div class="modal-actions">
        <button class="btn-primary" id="modal-backup-now">Download Backup</button>
        <button class="btn-small ghost" id="modal-backup-later">Not now</button>
      </div>
    </div>
  `;
  overlay.querySelector('#modal-backup-now').onclick = () => {
    exportData(prompt.weekKey);
    render();
  };
  overlay.querySelector('#modal-backup-later').onclick = () => {
    dismissBackupPrompt(prompt.key);
    render();
  };
  return overlay;
}

function renderHeader() {
  const header = document.createElement('header');
  header.className = 'app-header';
  const li = levelInfo(state.xp);
  const pct = Math.min(100, Math.round((li.xpIntoLevel / li.xpForNextLevel) * 100));
  header.innerHTML = `
    <div class="brand">
      <span class="brand-mark">⚡</span>
      <span class="brand-name">LIFT LEVEL</span>
    </div>
    <div class="level-pill" title="${li.xpIntoLevel} / ${li.xpForNextLevel} XP to next level">
      <span class="level-num">Lv.${li.level}</span>
      <div class="xp-bar"><div class="xp-bar-fill" style="width:${pct}%"></div></div>
    </div>
  `;
  return header;
}

function renderWeighInBanner() {
  if (!shouldPromptWeighIn()) return null;
  const banner = document.createElement('div');
  banner.className = 'banner';
  banner.innerHTML = `
    <span>⚖️ Time for your weekly weigh-in.</span>
    <div class="banner-actions">
      <button class="btn-small" id="banner-log">Log now</button>
      <button class="btn-small ghost" id="banner-dismiss">Not today</button>
    </div>
  `;
  banner.querySelector('#banner-log').onclick = () => {
    activeTab = 'weight';
    render();
  };
  banner.querySelector('#banner-dismiss').onclick = () => {
    dismissWeighInPrompt();
    render();
  };
  return banner;
}

function renderTabBar() {
  const bar = document.createElement('nav');
  bar.className = 'tab-bar';
  const tabs = [
    { id: 'today', label: 'Today', icon: '🏋️' },
    { id: 'progress', label: 'PRs', icon: '🏆' },
    { id: 'weight', label: 'Weight', icon: '⚖️' },
    { id: 'profile', label: 'Profile', icon: '👤' },
  ];
  tabs.forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'tab-btn' + (activeTab === t.id ? ' active' : '');
    btn.innerHTML = `<span class="tab-icon">${t.icon}</span><span>${t.label}</span>`;
    btn.onclick = () => { activeTab = t.id; render(); };
    bar.appendChild(btn);
  });
  return bar;
}

// ---------- Today tab ----------
function renderToday() {
  const wrap = document.createElement('div');

  // Day-of-week strip
  const strip = document.createElement('div');
  strip.className = 'day-strip';
  const monday = new Date(selectedDateIso + 'T00:00:00');
  monday.setDate(monday.getDate() - (isoWeekday(monday) - 1));
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const iso = todayISO(d);
    const day = WORKOUT_PROGRAM[i + 1];
    const log = getLog(iso);
    const chip = document.createElement('button');
    chip.className = 'day-chip'
      + (iso === selectedDateIso ? ' selected' : '')
      + (iso === todayISO() ? ' is-today' : '')
      + (log && log.completed ? ' done' : '')
      + (day.key === 'rest' ? ' rest' : '');
    chip.innerHTML = `<span class="dc-dow">${WEEKDAY_SHORT[i + 1]}</span><span class="dc-title">${day.key === 'rest' ? '🌙' : day.title.slice(0, 4)}</span>`;
    chip.onclick = () => { selectedDateIso = iso; render(); };
    strip.appendChild(chip);
  }
  wrap.appendChild(strip);

  const day = getDayForDate(selectedDateIso);
  const isToday = selectedDateIso === todayISO();

  const dayCard = document.createElement('div');
  dayCard.className = 'day-header-card';
  const progDay = isInHabitPhase() ? `Day ${programDayNumber()} of ${PROGRAM_LENGTH_DAYS}` : `Day ${programDayNumber()} · Maintenance Phase`;
  dayCard.innerHTML = `
    <div class="dhc-top">
      <h1>${day.title}</h1>
      <span class="dhc-date">${isToday ? 'Today' : new Date(selectedDateIso + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</span>
    </div>
    <p class="dhc-subtitle">${day.subtitle}</p>
    <p class="dhc-progress">${progDay}</p>
  `;
  wrap.appendChild(dayCard);

  if (day.key === 'rest') {
    const rest = document.createElement('div');
    rest.className = 'rest-card';
    rest.innerHTML = `<div class="rest-icon">🌙</div><p>Rest day. Recover and eat high protein.</p>`;
    wrap.appendChild(rest);
    return wrap;
  }

  const log = ensureLog(selectedDateIso);
  const list = document.createElement('div');
  list.className = 'exercise-list';
  day.exercises.forEach(ex => {
    list.appendChild(renderExerciseCard(selectedDateIso, ex, log));
  });
  wrap.appendChild(list);

  if (log.completed) {
    const done = document.createElement('div');
    done.className = 'workout-done-banner';
    done.textContent = `✅ Workout complete — +${XP_DAY_BONUS} XP earned`;
    wrap.appendChild(done);
  }

  saveState();
  return wrap;
}

function renderExerciseCard(iso, ex, log) {
  const card = document.createElement('div');
  const arr = log.sets[ex.id] || new Array(ex.sets).fill(false);
  const allDone = arr.every(Boolean);
  card.className = 'exercise-card' + (allDone ? ' complete' : '');

  const best = bestPR(ex.name);
  card.innerHTML = `
    <div class="ec-top">
      <div>
        <h3>${ex.name}</h3>
        <span class="ec-target">${ex.sets} sets × ${ex.reps} reps</span>
      </div>
      ${best ? `<span class="ec-pr">PR ${best.weight}${state.weight.unit === 'kg' ? 'kg' : 'lb'}</span>` : ''}
    </div>
    <div class="set-row"></div>
  `;
  const setRow = card.querySelector('.set-row');
  arr.forEach((checked, i) => {
    const setBtn = document.createElement('button');
    setBtn.className = 'set-btn' + (checked ? ' checked' : '');
    setBtn.textContent = `${i + 1}`;
    setBtn.onclick = () => { toggleSet(iso, ex.id, i); render(); };
    setRow.appendChild(setBtn);
  });
  return card;
}

// ---------- Progress / PR tab ----------
function renderProgress() {
  const wrap = document.createElement('div');
  wrap.innerHTML = `<h2 class="section-title">Personal Records</h2>`;

  const form = document.createElement('div');
  form.className = 'card form-card';
  form.innerHTML = `
    <select id="pr-exercise"></select>
    <div class="form-row">
      <input type="number" id="pr-weight" placeholder="Weight" min="0" step="0.5" />
      <input type="number" id="pr-reps" placeholder="Reps (optional)" min="0" step="1" />
    </div>
    <button class="btn-primary" id="pr-add">Log PR</button>
  `;
  const select = form.querySelector('#pr-exercise');
  EXERCISE_CATALOG.forEach(ex => {
    const opt = document.createElement('option');
    opt.value = ex.name;
    opt.textContent = ex.name;
    select.appendChild(opt);
  });
  form.querySelector('#pr-add').onclick = () => {
    const w = form.querySelector('#pr-weight').value;
    const r = form.querySelector('#pr-reps').value;
    if (!w) return;
    addPR(select.value, w, r);
    render();
  };
  wrap.appendChild(form);

  EXERCISE_CATALOG.forEach(ex => {
    const history = state.prs[ex.name];
    if (!history || history.length === 0) return;
    wrap.appendChild(renderPRHistoryCard(ex.name, history));
  });

  return wrap;
}

function renderPRHistoryCard(name, history) {
  const card = document.createElement('div');
  card.className = 'card pr-history-card';
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const max = Math.max(...sorted.map(h => h.weight));
  const min = Math.min(...sorted.map(h => h.weight));
  const best = sorted.reduce((b, c) => (c.weight > b.weight ? c : b), sorted[0]);

  card.innerHTML = `<h3>${name} <span class="pr-best">best ${best.weight}${state.weight.unit === 'kg' ? 'kg' : 'lb'}</span></h3>`;
  card.appendChild(makeSparkline(sorted.map(h => h.weight), min, max));

  const rows = document.createElement('div');
  rows.className = 'pr-rows';
  sorted.slice().reverse().forEach(entry => {
    const idx = history.indexOf(entry);
    const row = document.createElement('div');
    row.className = 'pr-row';
    row.innerHTML = `<span>${entry.date}</span><span>${entry.weight}${state.weight.unit === 'kg' ? 'kg' : 'lb'}${entry.reps ? ` × ${entry.reps}` : ''}</span>`;
    const del = document.createElement('button');
    del.className = 'del-btn';
    del.textContent = '✕';
    del.onclick = () => { deletePR(name, idx); render(); };
    row.appendChild(del);
    rows.appendChild(row);
  });
  card.appendChild(rows);
  return card;
}

function makeSparkline(values, min, max) {
  const svgNS = 'http://www.w3.org/2000/svg';
  const w = 280, h = 60, pad = 6;
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('class', 'sparkline');
  if (values.length < 2) {
    const text = document.createElementNS(svgNS, 'text');
    text.setAttribute('x', 10); text.setAttribute('y', h / 2);
    text.setAttribute('fill', '#9a8fc9');
    text.textContent = 'Log more entries to see a trend';
    svg.appendChild(text);
    return svg;
  }
  const range = max - min || 1;
  const step = (w - pad * 2) / (values.length - 1);
  const pts = values.map((v, i) => {
    const x = pad + i * step;
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${x},${y}`;
  });
  const polyline = document.createElementNS(svgNS, 'polyline');
  polyline.setAttribute('points', pts.join(' '));
  polyline.setAttribute('class', 'spark-line');
  svg.appendChild(polyline);
  pts.forEach(p => {
    const [x, y] = p.split(',');
    const c = document.createElementNS(svgNS, 'circle');
    c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', 3);
    c.setAttribute('class', 'spark-dot');
    svg.appendChild(c);
  });
  return svg;
}

// ---------- Weight tab ----------
function renderWeight() {
  const wrap = document.createElement('div');
  wrap.innerHTML = `<h2 class="section-title">Body Weight</h2>`;

  const form = document.createElement('div');
  form.className = 'card form-card';
  form.innerHTML = `
    <div class="form-row">
      <input type="number" id="w-weight" placeholder="Weight (${state.weight.unit})" min="0" step="0.1" />
      <select id="w-unit">
        <option value="lb" ${state.weight.unit === 'lb' ? 'selected' : ''}>lb</option>
        <option value="kg" ${state.weight.unit === 'kg' ? 'selected' : ''}>kg</option>
      </select>
    </div>
    <button class="btn-primary" id="w-add">Log Weight</button>
  `;
  form.querySelector('#w-unit').onchange = (e) => { state.weight.unit = e.target.value; saveState(); render(); };
  form.querySelector('#w-add').onclick = () => {
    const w = form.querySelector('#w-weight').value;
    if (!w) return;
    addWeightEntry(w);
    dismissWeighInPrompt();
    render();
  };
  wrap.appendChild(form);

  const entries = state.weight.entries;
  if (entries.length > 0) {
    const card = document.createElement('div');
    card.className = 'card pr-history-card';
    const vals = entries.map(e => e.weight);
    const first = entries[0].weight, latest = entries[entries.length - 1].weight;
    const delta = (latest - first).toFixed(1);
    card.innerHTML = `<h3>Trend <span class="pr-best">${delta >= 0 ? '+' : ''}${delta} ${state.weight.unit} since first log</span></h3>`;
    card.appendChild(makeSparkline(vals, Math.min(...vals), Math.max(...vals)));
    const rows = document.createElement('div');
    rows.className = 'pr-rows';
    entries.slice().reverse().forEach(entry => {
      const idx = entries.indexOf(entry);
      const row = document.createElement('div');
      row.className = 'pr-row';
      row.innerHTML = `<span>${entry.date}</span><span>${entry.weight} ${state.weight.unit}</span>`;
      const del = document.createElement('button');
      del.className = 'del-btn';
      del.textContent = '✕';
      del.onclick = () => { deleteWeightEntry(idx); render(); };
      row.appendChild(del);
      rows.appendChild(row);
    });
    card.appendChild(rows);
    wrap.appendChild(card);
  }

  return wrap;
}

// ---------- Profile tab ----------
function renderProfile() {
  const wrap = document.createElement('div');
  const li = levelInfo(state.xp);
  const pct = Math.min(100, Math.round((li.xpIntoLevel / li.xpForNextLevel) * 100));

  wrap.innerHTML = `<h2 class="section-title">Profile</h2>`;

  const statCard = document.createElement('div');
  statCard.className = 'card profile-card';
  statCard.innerHTML = `
    <div class="profile-level">
      <div class="level-badge">Lv.${li.level}</div>
      <div>
        <div class="level-title">${levelTitle(li.level)}</div>
        <div class="xp-detail">${li.xpIntoLevel} / ${li.xpForNextLevel} XP</div>
      </div>
    </div>
    <div class="xp-bar big"><div class="xp-bar-fill" style="width:${pct}%"></div></div>
    <div class="stat-grid">
      <div class="stat"><div class="stat-num">${state.streak.current}</div><div class="stat-label">Day Streak</div></div>
      <div class="stat"><div class="stat-num">${state.streak.longest}</div><div class="stat-label">Best Streak</div></div>
      <div class="stat"><div class="stat-num">${state.xp}</div><div class="stat-label">Total XP</div></div>
    </div>
  `;
  wrap.appendChild(statCard);

  const phaseCard = document.createElement('div');
  phaseCard.className = 'card';
  const dayNum = programDayNumber();
  if (isInHabitPhase()) {
    const pct2 = Math.min(100, Math.round((dayNum / PROGRAM_LENGTH_DAYS) * 100));
    phaseCard.innerHTML = `
      <h3>Habit-Building Phase</h3>
      <p class="dhc-subtitle">Day ${dayNum} of ${PROGRAM_LENGTH_DAYS} — keep showing up. After day ${PROGRAM_LENGTH_DAYS} you roll into open-ended maintenance mode automatically.</p>
      <div class="xp-bar"><div class="xp-bar-fill" style="width:${pct2}%"></div></div>
    `;
  } else {
    phaseCard.innerHTML = `
      <h3>Maintenance Mode</h3>
      <p class="dhc-subtitle">You built the habit — Day ${dayNum}. The program keeps running on the same 6-day cycle indefinitely. Keep stacking streaks.</p>
    `;
  }
  wrap.appendChild(phaseCard);

  const settingsCard = document.createElement('div');
  settingsCard.className = 'card';
  settingsCard.innerHTML = `
    <h3>Data & Backup</h3>
    <p class="dhc-subtitle">Your data lives only on this device. Export a backup regularly.</p>
    <div class="form-row">
      <button class="btn-primary" id="export-btn">Export Backup</button>
      <button class="btn-small ghost" id="import-btn">Import Backup</button>
    </div>
    <input type="file" id="import-file" accept="application/json" style="display:none" />
    <p class="import-status" id="import-status"></p>
  `;
  settingsCard.querySelector('#export-btn').onclick = exportData;
  const fileInput = settingsCard.querySelector('#import-file');
  settingsCard.querySelector('#import-btn').onclick = () => fileInput.click();
  fileInput.onchange = () => {
    const file = fileInput.files[0];
    if (!file) return;
    importData(file, (ok) => {
      const statusEl = settingsCard.querySelector('#import-status');
      statusEl.textContent = ok ? 'Import successful.' : 'Import failed — invalid file.';
      if (ok) render();
    });
  };
  wrap.appendChild(settingsCard);

  return wrap;
}

// ---------- Init ----------
render();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW registration failed', err));
  });
}
