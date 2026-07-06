// ---------- Config ----------
const CONFIDENCE_THRESHOLD = 0.55;
const SPEAK_INTERVAL_MS = 3000;      // don't narrate more often than this
const MAX_OBJECTS_NARRATED = 3;
const HAZARD_CLASSES = new Set([
  'person', 'car', 'truck', 'bus', 'motorcycle', 'bicycle',
  'dog', 'stairs', 'chair', 'bench', 'fire hydrant', 'traffic light'
]);

// ---------- State ----------
let model = null;
let running = false;
let rafId = null;
let lastSpokenAt = 0;
let lastSpokenText = '';
let mode = 'all'; // 'all' | 'hazards'

// ---------- DOM ----------
const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const ctx = overlay.getContext('2d');
const placeholder = document.getElementById('placeholder');
const toggleBtn = document.getElementById('toggleBtn');
const statusChip = document.getElementById('statusChip');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const captionText = document.getElementById('captionText');
const detectionList = document.getElementById('detectionList');
const modeButtons = document.querySelectorAll('.mode-btn');

// ---------- Mode toggle ----------
modeButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    modeButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    mode = btn.dataset.mode;
  });
});

// ---------- Start / stop ----------
toggleBtn.addEventListener('click', () => {
  if (running) stop(); else start();
});

async function start() {
  toggleBtn.textContent = 'Loading model…';
  toggleBtn.disabled = true;

  try {
    if (!model) {
      model = await cocoSsd.load(); // pretrained, loaded once
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false
    });
    video.srcObject = stream;
    await video.play();

    placeholder.style.display = 'none';
    overlay.width = video.videoWidth || 640;
    overlay.height = video.videoHeight || 480;

    running = true;
    toggleBtn.textContent = 'Stop Narrating';
    toggleBtn.classList.add('active');
    setStatus(true, 'Narrating');
    speakNow("Starting up. I'll describe what I see.");

    detectLoop();
  } catch (err) {
    console.error(err);
    captionText.textContent = 'Could not access the camera. Check browser permissions and try again.';
  } finally {
    toggleBtn.disabled = false;
  }
}

function stop() {
  running = false;
  cancelAnimationFrame(rafId);
  speechSynthesis.cancel();

  const stream = video.srcObject;
  if (stream) stream.getTracks().forEach(t => t.stop());
  video.srcObject = null;

  placeholder.style.display = 'flex';
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  toggleBtn.textContent = 'Start Narrating';
  toggleBtn.classList.remove('active');
  setStatus(false, 'Idle');
  captionText.textContent = 'Press Start — I\'ll describe what the camera sees, out loud, as it changes.';
  detectionList.innerHTML = '<li class="detection-empty">Nothing detected yet.</li>';
}

function setStatus(live, text) {
  statusChip.classList.toggle('live', live);
  statusText.textContent = text;
}

// ---------- Detection loop ----------
async function detectLoop() {
  if (!running) return;

  const predictions = await model.detect(video);
  const filtered = predictions.filter(p => p.score >= CONFIDENCE_THRESHOLD);

  drawBoxes(filtered);
  renderDetectionChips(filtered);

  const described = filtered
    .map(p => describeObject(p, overlay.width, overlay.height))
    .filter(d => mode === 'all' || HAZARD_CLASSES.has(d.label));

  const sentence = buildSentence(described);
  maybeSpeak(sentence);

  rafId = requestAnimationFrame(detectLoop);
}

// ---------- Reasoning: bbox -> distance/position ----------
function describeObject(pred, frameW, frameH) {
  const [x, y, w, h] = pred.bbox;
  const relArea = (w * h) / (frameW * frameH);

  const distance =
    relArea > 0.35 ? 'very close' :
    relArea > 0.15 ? 'close' :
    relArea > 0.05 ? 'a short distance away' :
    'far away';

  const distanceRank =
    relArea > 0.35 ? 3 :
    relArea > 0.15 ? 2 :
    relArea > 0.05 ? 1 : 0;

  const centerX = x + w / 2;
  const position =
    centerX < frameW * 0.33 ? 'on your left' :
    centerX > frameW * 0.66 ? 'on your right' :
    'ahead of you';

  return { label: pred.class, distance, position, distanceRank, score: pred.score };
}

// ---------- Sentence generation (template-based, LLM-swappable) ----------
function buildSentence(described) {
  if (described.length === 0) {
    return mode === 'hazards' ? 'No hazards nearby.' : '';
  }

  // Prioritize: closer objects first, then dedupe by label+position
  const seen = new Set();
  const prioritized = described
    .sort((a, b) => b.distanceRank - a.distanceRank || b.score - a.score)
    .filter(d => {
      const key = `${d.label}-${d.position}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_OBJECTS_NARRATED);

  const clauses = prioritized.map(d => `a ${d.label} ${d.distance} ${d.position}`);

  if (clauses.length === 1) return `There's ${clauses[0]}.`;
  const last = clauses.pop();
  return `There's ${clauses.join(', ')}, and ${last}.`;

  // --- To swap in an LLM pass for more natural phrasing, replace the return
  // above with a call to your backend/API, e.g.:
  //
  // const res = await fetch('/api/narrate', {
  //   method: 'POST',
  //   body: JSON.stringify({ objects: prioritized })
  // });
  // return (await res.json()).sentence;
  //
  // Keep it on a 2-3s cadence (see SPEAK_INTERVAL_MS) to control latency/cost.
}

// ---------- Speech ----------
function maybeSpeak(sentence) {
  if (!sentence) return;
  const now = Date.now();
  if (now - lastSpokenAt < SPEAK_INTERVAL_MS) return;
  if (sentence === lastSpokenText) return;

  lastSpokenAt = now;
  lastSpokenText = sentence;
  speakNow(sentence);
}

function speakNow(text) {
  captionText.textContent = text;
  if (speechSynthesis.speaking) speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 1.05;
  utter.pitch = 1.0;
  speechSynthesis.speak(utter);
}

// ---------- Rendering ----------
function drawBoxes(predictions) {
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  ctx.lineWidth = 3;
  ctx.font = '16px Inter, sans-serif';

  predictions.forEach(p => {
    const [x, y, w, h] = p.bbox;
    ctx.strokeStyle = '#F2A63C';
    ctx.strokeRect(x, y, w, h);

    const label = `${p.class} ${(p.score * 100).toFixed(0)}%`;
    const textWidth = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(14,17,22,0.85)';
    ctx.fillRect(x, Math.max(0, y - 22), textWidth + 10, 22);
    ctx.fillStyle = '#F2A63C';
    ctx.fillText(label, x + 5, Math.max(16, y - 6));
  });
}

function renderDetectionChips(predictions) {
  if (predictions.length === 0) {
    detectionList.innerHTML = '<li class="detection-empty">Nothing detected yet.</li>';
    return;
  }
  detectionList.innerHTML = predictions
    .map(p => `<li>${p.class} · ${(p.score * 100).toFixed(0)}%</li>`)
    .join('');
}
