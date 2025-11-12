/* app.js — Patrones de Violín (Musicala) */

// ===== Datos base =====
const DAYS = [
  { d:1, p:"0123" }, { d:2, p:"0132" }, { d:3, p:"0213" }, { d:4, p:"0231" }, { d:5, p:"0312" }, { d:6, p:"0321" },
  { d:7, p:"1023" }, { d:8, p:"1032" }, { d:9, p:"1203" }, { d:10, p:"1230" }, { d:11, p:"1302" }, { d:12, p:"1320" },
  { d:13, p:"2013" }, { d:14, p:"2031" }, { d:15, p:"2103" }, { d:16, p:"2130" }, { d:17, p:"2301" }, { d:18, p:"2310" },
  { d:19, p:"3012" }, { d:20, p:"3021" }, { d:21, p:"3102" }, { d:22, p:"3120" }, { d:23, p:"3201" }, { d:24, p:"3210" },
  { d:25, p:"0123" }, { d:26, p:"1023" }, { d:27, p:"2013" }, { d:28, p:"3012" }, { d:29, p:"3210" }, { d:30, p:"0123" }
];

const STRING_ORDER = [4, 3, 2, 1]; // 4=Sol, 3=Re, 2=La, 1=Mi

// ===== UI =====
const daySelect     = document.getElementById('daySelect');
const modeSelect    = document.getElementById('modeSelect');
const tempoInput    = document.getElementById('tempoInput');
const resetTempoBtn = document.getElementById('resetTempo');
const startBtn      = document.getElementById('startBtn');
const stopBtn       = document.getElementById('stopBtn');
const patternBox    = document.getElementById('patternBox');
const progressGrid  = document.getElementById('progressGrid');
const historyList   = document.getElementById('historyList');

const repNowEl      = document.getElementById('repNow');
const stringNowEl   = document.getElementById('stringNow');
const kDayEl        = document.getElementById('kDay');
const kPatternEl    = document.getElementById('kPattern');
const kTempoEl      = document.getElementById('kTempo');
const kTotalRepsEl  = document.getElementById('kTotalReps');

// ===== Estado =====
let selectedDay      = 1;
let pattern          = DAYS[0].p;
let isRunning        = false;
let stepIndex        = 0;
let repetitionCount  = 0;
let totalRepsToday   = 0;
let stringPointer    = 0;
let audioCtx         = null;
let nextTime         = 0;
let timerId          = null;

// ===== Persistencia =====
const LS_KEY = 'violinPatternsProgress_v2';
let progress = loadProgress();

function loadProgress() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch(e) {}
  return { days: {} };
}
function saveProgress() { localStorage.setItem(LS_KEY, JSON.stringify(progress)); }
function getDayState(d) {
  if (!progress.days[d]) progress.days[d] = { done:false, reps:0, history:[] };
  return progress.days[d];
}
function pushHistory(d, entry) {
  const st = getDayState(d);
  st.history.unshift(entry);
  st.reps = (st.reps || 0) + 1;
  if (!st.done && st.reps >= 1) st.done = true;
  saveProgress();
}

// ===== Render =====
function renderDayOptions() {
  daySelect.innerHTML = '';
  DAYS.forEach(({ d, p }) => {
    const opt = document.createElement('option');
    opt.value = d;
    opt.textContent = `Día ${d} — ${p}`;
    daySelect.appendChild(opt);
  });
  daySelect.value = selectedDay;
}

function renderPattern() {
  patternBox.innerHTML = '';
  pattern.split('').forEach((ch, i) => {
    const div = document.createElement('div');
    div.className = 'step' + (i === Math.floor(stepIndex) ? ' active' : '');
    div.innerHTML = `
      <div style="font-size:28px;font-weight:800;line-height:1">${ch}</div>
      <div class="note">paso ${i+1}/4</div>
    `;
    patternBox.appendChild(div);
  });
}

function renderKPIs() {
  kDayEl.textContent       = selectedDay;
  kPatternEl.textContent   = pattern;
  kTempoEl.textContent     = parseInt(tempoInput.value, 10) || 60;
  kTotalRepsEl.textContent = totalRepsToday || 0;

  const repMod = repetitionCount % 4;
  repNowEl.textContent   = repMod === 0 ? 4 : repMod;
  stringNowEl.textContent = STRING_ORDER[stringPointer];
}

function renderProgressGrid() {
  progressGrid.innerHTML = '';
  DAYS.forEach(({ d, p }) => {
    const st  = getDayState(d);
    const isDone = !!st.done || (st.reps || 0) > 0;
    const btn = document.createElement('button');
    btn.className = 'daybtn' + (selectedDay === d ? ' active' : '') + (isDone ? ' done' : '');
    btn.title = isDone ? `Día ${d} — ${p} (listo)` : `Día ${d} — ${p}`;
    btn.textContent = isDone ? '✕' : String(d);
    btn.addEventListener('click', () => {
      selectedDay = d;
      pattern = DAYS.find(x => x.d === d).p;
      stepIndex = 0;
      repetitionCount = 0;
      totalRepsToday = getDayState(selectedDay).reps || 0;
      stringPointer = 0;
      updateAll();
    });
    progressGrid.appendChild(btn);
  });
}

function renderHistory() {
  const st = getDayState(selectedDay);
  historyList.innerHTML = '';
  if (!st.history.length) {
    const p = document.createElement('p');
    p.className = 'note';
    p.textContent = 'Aún no hay registros. Dale Iniciar para empezar la rutina.';
    historyList.appendChild(p);
    return;
  }
  st.history.forEach(h => {
    const div = document.createElement('div');
    const dt  = new Date(h.ts);
    const hh  = String(dt.getHours()).padStart(2, '0');
    const mm  = String(dt.getMinutes()).padStart(2, '0');
    div.className = 'item';
    div.textContent = `• ${dt.toLocaleDateString()} ${hh}:${mm} — rep ${h.rep} en cuerda ${h.string} a ${h.bpm}`;
    historyList.appendChild(div);
  });
}

function updateAll() {
  renderPattern();
  renderKPIs();
  renderProgressGrid();
  renderHistory();
}

// ===== Metrónomo (sin acento) =====
function start() {
  if (isRunning) return;
  tempoInput.value = 60;
  stepIndex = 0;
  repetitionCount = 0;
  stringPointer = 0;
  totalRepsToday = getDayState(selectedDay).reps || 0;

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  nextTime = audioCtx.currentTime;
  isRunning = true;
  tick();
  updateAll();
}

function stop() {
  isRunning = false;
  try { if (audioCtx) audioCtx.close(); } catch (e) {}
  audioCtx = null;
  clearTimeout(timerId);
  timerId = null;
}

function click() {
  if (!audioCtx) return;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = 'square';
  o.frequency.value = 1000;
  g.gain.value = 0.14;
  o.connect(g).connect(audioCtx.destination);
  const t = nextTime;
  o.start(t);
  o.stop(t + 0.05);
}

function tick() {
  if (!isRunning || !audioCtx) return;
  const bpm = parseInt(tempoInput.value, 10) || 60;
  const stepDur = 60 / bpm;

  while (nextTime < audioCtx.currentTime + 0.1) {
    click();
    setTimeout(() => {
      stepIndex = (Math.floor(stepIndex) + 1) % 4;

      if (stepIndex === 0) {
        repetitionCount += 1;
        totalRepsToday  += 1;
        pushHistory(selectedDay, {
          ts: Date.now(),
          rep: repetitionCount,
          bpm: bpm,
          string: STRING_ORDER[stringPointer]
        });
        if (repetitionCount % 4 === 0) {
          tempoInput.value = Math.min(bpm + 2, 200);
          stringPointer = (stringPointer + 1) % STRING_ORDER.length;
          if (modeSelect.value === 'next') {
            selectedDay = (selectedDay % 30) + 1;
            pattern = DAYS.find(x => x.d === selectedDay).p;
            repetitionCount = 0;
          }
        }
      }
      updateAll();
    }, Math.max(0, (nextTime - audioCtx.currentTime) * 1000));
    nextTime += stepDur;
  }
  timerId = setTimeout(tick, 25);
}

// ===== Eventos =====
daySelect.addEventListener('change', e => {
  selectedDay = parseInt(e.target.value, 10);
  pattern = DAYS.find(x => x.d === selectedDay).p;
  stepIndex = 0;
  repetitionCount = 0;
  totalRepsToday = getDayState(selectedDay).reps || 0;
  stringPointer = 0;
  updateAll();
});

resetTempoBtn.addEventListener('click', () => {
  tempoInput.value = 60;
  updateAll();
});

tempoInput.addEventListener('change', updateAll);

startBtn.addEventListener('click', start);
stopBtn.addEventListener('click', stop);

document.getElementById('resetProgress').addEventListener('click', () => {
  if (confirm('Esto borrará el historial y marcas de los 30 días en este navegador. ¿Continuar?')) {
    progress = { days: {} };
    saveProgress();
    totalRepsToday = 0;
    updateAll();
  }
});

// ===== Init =====
(function init() {
  renderDayOptions();
  pattern = DAYS[0].p;
  totalRepsToday = getDayState(selectedDay).reps || 0;
  renderPattern();
  renderProgressGrid();
  renderHistory();
  renderKPIs();

  // Mostrar logo.png en el header si existe
  const brand = document.querySelector('.brand-mark');
  const img = document.createElement('img');
  img.src = 'logo.png';
  img.alt = 'Logo Musicala';
  img.style.width = '40px';
  img.style.height = '40px';
  img.style.objectFit = 'contain';
  img.style.borderRadius = '10px';
  img.onerror = () => { brand.style.display = 'block'; };
  brand.replaceWith(img);
})();
