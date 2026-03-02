/* 🎬 KaraokeAI — v1.9 - UNIVERSAL MODEL FIX */

// --- STATE ---
const state = {
  audioFile: null,
  audioURL: null,
  words: [],
  lines: [],
  images: [], // {url, name, el}
  audioDuration: 0,
  previewRaf: null,
  previewPlaying: false,
  renderAbort: false,
};

const style = {
  fontFamily: 'Arial',
  fontSize: 48,
  textColor: '#ffffff',
  strokeColor: '#000000',
  strokeWidth: 4,
  overlayOpacity: 0.0, // Quitamos la máscara
  position: 'bottom',
  linesMode: '3',
};

// --- DOM REFS ---
const $ = id => document.getElementById(id);
const q = s => document.querySelector(s);

const apiKeyInput = $('apiKeyInput');
const audioFileInput = $('audioFile');
const imageFilesInput = $('imageFiles');
const fileInfo = $('fileInfo');
const fileNameEl = $('fileName');
const fileSizeEl = $('fileSize');
const imgPreviewStrip = $('imgPreviewStrip');
const transcribeBtn = $('transcribeBtn');

const progressArea = $('progressArea');
const progressLabel = $('progressLabel');
const progressBar = $('progressBar');

const editorSection = $('editorSection');
const lyricsEditor = $('lyricsEditor');
const timedLyrics = $('timedLyrics');
const applyLyricsBtn = $('applyLyricsBtn');
const exportSRT = $('exportSRT');
const exportJSON = $('exportJSON');

const exportSection = $('exportSection');
const previewCanvas = $('previewCanvas');
const previewScrubber = $('previewScrubber');
const previewPlayBtn = $('previewPlayBtn');
const previewTimeLabel = $('previewTimeLabel');
const renderBtn = $('renderBtn');
const renderProgress = $('renderProgress');
const renderBar = $('renderBar');

// --- PREVIEW SETUP ---
const previewAudio = new Audio();
const renderAudio = new Audio();
const pCtx = previewCanvas.getContext('2d');
previewCanvas.width = 1280;
previewCanvas.height = 720;

// --- UTILS ---
const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const msToTimecode = ms => {
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}.${String(Math.floor((ms % 1000) / 10)).padStart(2, '0')}`;
};
const srtTimecode = ms => {
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000), msPart = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(msPart).padStart(3, '0')}`;
};
const escHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// --- EVENTS ---

// Upload Audio
audioFileInput.addEventListener('change', () => {
  const file = audioFileInput.files[0];
  if (!file) return;
  state.audioFile = file;
  state.audioURL = URL.createObjectURL(file);
  fileInfo.style.display = 'block';
  fileNameEl.textContent = file.name;
  fileSizeEl.textContent = `${(file.size / 1024 / 1024).toFixed(1)} MB`;
  transcribeBtn.disabled = false;

  previewAudio.src = state.audioURL;
  previewAudio.onloadedmetadata = () => {
    state.audioDuration = previewAudio.duration;
    previewScrubber.max = Math.floor(state.audioDuration * 1000);
    updateTimeLabel();
  };
});

// Upload Images
imageFilesInput.addEventListener('change', () => {
  const files = [...imageFilesInput.files];
  files.forEach(file => {
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.src = url;
    state.images.push({ url, name: file.name, el });
  });
  updateImageStrip();
});

function updateImageStrip() {
  imgPreviewStrip.innerHTML = '';
  state.images.forEach(img => {
    const t = document.createElement('img');
    t.src = img.url; t.classList.add('img-thumb');
    imgPreviewStrip.appendChild(t);
  });
  if (state.images.length) refreshPreview();
}

// Transcription
transcribeBtn.addEventListener('click', async () => {
  const key = apiKeyInput.value.trim();
  if (!key) { alert('Ingresa tu API Key de AssemblyAI'); return; }

  progressArea.style.display = 'block';
  transcribeBtn.disabled = true;

  try {
    // 1. Upload
    progressLabel.textContent = 'Subiendo audio...';
    const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', {
      method: 'POST', headers: { authorization: key }, body: state.audioFile
    });
    const { upload_url } = await uploadRes.json();

    // 2. Transcribe (IA) - ARRAY VERSION v1.9
    progressLabel.textContent = 'IA Iniciada (v1.9)...';
    const selectedModel = $('transcriptionModel').value;

    // NOTA: Para Universal-3-Pro se usa array y NO se puede enviar language_detection.
    const requestBody = {
      audio_url: upload_url,
      speech_models: [selectedModel]
    };

    console.log('Sending v1.9 Payload:', requestBody);

    const createRes = await fetch('https://api.assemblyai.com/v2/transcript', {
      method: 'POST',
      headers: {
        'authorization': key,
        'content-type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    const transcriptData = await createRes.json();
    if (!createRes.ok) throw new Error(transcriptData.error || 'Error AssemblyAI');

    const id = transcriptData.id;

    // 3. Polling
    let transcript;
    while (true) {
      await sleep(3000);
      const r = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, { headers: { authorization: key } });
      transcript = await r.json();
      if (transcript.status === 'completed') break;
      if (transcript.status === 'error') throw new Error(transcript.error);
      progressLabel.textContent = `Procesando: ${transcript.status}...`;
    }

    state.words = transcript.words || [];
    groupWords();
    renderEditor();

    editorSection.style.display = 'block';
    editorSection.scrollIntoView({ behavior: 'smooth' });
    progressArea.style.display = 'none';
  } catch (e) {
    console.error(e);
    alert('Error: ' + e.message);
    transcribeBtn.disabled = false;
    progressArea.style.display = 'none';
  }
});

function groupWords() {
  const GAP = 1500;
  state.lines = [];
  if (!state.words.length) return;
  let cur = { words: [], startMs: 0, endMs: 0, text: '' };
  state.words.forEach((w, i) => {
    const prev = state.words[i - 1];
    if (i > 0 && (w.start - prev.end > GAP || cur.text.length > 50)) {
      state.lines.push({ ...cur });
      cur = { words: [], startMs: w.start, endMs: w.end, text: '' };
    }
    if (!cur.words.length) cur.startMs = w.start;
    cur.words.push(w);
    cur.endMs = w.end;
    cur.text = cur.words.map(x => x.text).join(' ');
  });
  state.lines.push(cur);
}

function renderEditor() {
  lyricsEditor.value = state.lines.map(l => l.text).join('\n');
  timedLyrics.innerHTML = state.lines.map((l, i) => `
    <div class="timeline-line" onclick="seekTo(${l.startMs})">
      <span class="timestamp">${msToTimecode(l.startMs)}</span>
      <span>${escHtml(l.text)}</span>
    </div>
  `).join('');
}

window.seekTo = ms => {
  previewAudio.currentTime = ms / 1000;
  previewScrubber.value = ms;
  refreshPreview();
};

applyLyricsBtn.addEventListener('click', () => {
  const texts = lyricsEditor.value.split('\n').filter(t => t.trim());
  state.lines = texts.map((text, i) => {
    const old = state.lines[i];
    return old ? { ...old, text } : { text, startMs: i * 3000, endMs: i * 3000 + 3000 };
  });
  renderEditor();
  exportSection.style.display = 'block';
  exportSection.scrollIntoView({ behavior: 'smooth' });
});

// Exports
exportSRT.addEventListener('click', () => {
  const content = state.lines.map((l, i) => `${i + 1}\n${srtTimecode(l.startMs)} --> ${srtTimecode(l.endMs)}\n${l.text}\n`).join('\n');
  download(content, 'lyrics.srt');
});
exportJSON.addEventListener('click', () => download(JSON.stringify(state.lines, null, 2), 'lyrics.json'));
function download(txt, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain' }));
  a.download = name; a.click();
}

// --- DESIGN CONTROLS ---
$('fontFamily').onchange = e => { style.fontFamily = e.target.value; refreshPreview(); };
$('fontSize').oninput = e => { style.fontSize = +e.target.value; refreshPreview(); };
$('textColor').oninput = e => { style.textColor = e.target.value; refreshPreview(); };
$('strokeColor').oninput = e => { style.strokeColor = e.target.value; refreshPreview(); };
$('textPosition').onchange = e => { style.position = e.target.value; refreshPreview(); };
$('linesMode').onchange = e => { style.linesMode = e.target.value; refreshPreview(); };

function refreshPreview() { drawFrame(pCtx, previewAudio.currentTime * 1000, 1280, 720); }

// Preview Playback
previewPlayBtn.onclick = () => {
  if (state.previewPlaying) {
    previewAudio.pause();
    state.previewPlaying = false;
    previewPlayBtn.textContent = '▶ Reproducir';
    cancelAnimationFrame(state.previewRaf);
  } else {
    previewAudio.play();
    state.previewPlaying = true;
    previewPlayBtn.textContent = '⏸ Pausar';
    loop();
  }
};

function loop() {
  if (!state.previewPlaying) return;
  const ms = previewAudio.currentTime * 1000;
  previewScrubber.value = ms;
  updateTimeLabel();
  refreshPreview();
  state.previewRaf = requestAnimationFrame(loop);
}

function updateTimeLabel() {
  previewTimeLabel.textContent = `${fmtTime(previewAudio.currentTime)} / ${fmtTime(state.audioDuration)}`;
}

previewScrubber.oninput = () => {
  previewAudio.currentTime = previewScrubber.value / 1000;
  updateTimeLabel();
  refreshPreview();
};

// --- DRAWING ---
function drawFrame(ctx, ms, W, H) {
  ctx.clearRect(0, 0, W, H);

  // BG Image
  if (state.images.length) {
    const totalMs = state.audioDuration * 1000 || 1000;
    const idx = Math.floor((ms / totalMs) * state.images.length);
    const img = state.images[Math.min(idx, state.images.length - 1)];
    if (img && img.el.complete) {
      const iw = img.el.naturalWidth, ih = img.el.naturalHeight;
      const ratio = Math.max(W / iw, H / ih);
      const nw = iw * ratio, nh = ih * ratio;
      ctx.drawImage(img.el, (W - nw) / 2, (H - nh) / 2, nw, nh);
    }
  } else {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  }

  // Sin Máscara (Filtro eliminado)

  // Lyrics
  const activeIdx = state.lines.findIndex(l => ms >= l.startMs && ms <= l.endMs);
  if (activeIdx === -1) return;

  const cur = state.lines[activeIdx];
  const prev = state.lines[activeIdx - 1];
  const next = state.lines[activeIdx + 1];

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const y = style.position === 'top' ? H * 0.2 : style.position === 'center' ? H * 0.5 : H * 0.8;
  const lh = style.fontSize * 1.3;

  function drawText(txt, ty, size, alpha) {
    if (!txt) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `bold ${size}px "${style.fontFamily}", sans-serif`;
    if (style.strokeWidth) {
      ctx.strokeStyle = style.strokeColor;
      ctx.lineWidth = style.strokeWidth;
      ctx.lineJoin = 'round';
      ctx.strokeText(txt, W / 2, ty);
    }
    ctx.fillStyle = style.textColor;
    ctx.fillText(txt, W / 2, ty);
    ctx.restore();
  }

  if (style.linesMode === '1') {
    drawText(cur.text, y, style.fontSize, 1);
  } else if (style.linesMode === '2') {
    drawText(cur.text, y - lh / 2, style.fontSize, 1);
    drawText(next?.text, y + lh / 2, style.fontSize * 0.7, 0.5);
  } else {
    drawText(prev?.text, y - lh, style.fontSize * 0.6, 0.3);
    drawText(cur.text, y, style.fontSize, 1);
    drawText(next?.text, y + lh, style.fontSize * 0.6, 0.5);
  }
}

// --- RENDER VIDEO ---
renderBtn.onclick = async () => {
  state.renderAbort = false;
  renderProgress.style.display = 'block';
  renderBtn.disabled = true;

  const W = 1280, H = 720;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  renderAudio.src = state.audioURL;
  renderAudio.currentTime = 0;
  renderAudio.crossOrigin = 'anonymous';
  await renderAudio.play();

  const stream = canvas.captureStream(30);
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const source = audioCtx.createMediaElementSource(renderAudio);
  const dest = audioCtx.createMediaStreamDestination();
  source.connect(dest);
  source.connect(audioCtx.destination);
  stream.addTrack(dest.stream.getAudioTracks()[0]);

  const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9,opus' });
  const chunks = [];
  recorder.ondataavailable = e => chunks.push(e.data);
  recorder.onstop = () => {
    let baseName = $('videoNameInput').value.trim() || 'karaoke';
    if (!baseName.toLowerCase().endsWith('.webm')) baseName += '.webm';

    const blob = new Blob(chunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = baseName; a.click();
    renderProgress.style.display = 'none';
    renderBtn.disabled = false;
  };

  recorder.start();

  function renderStep() {
    if (renderAudio.ended || state.renderAbort) {
      recorder.stop();
      renderAudio.pause();
      return;
    }
    const ms = renderAudio.currentTime * 1000;
    const pct = (ms / (state.audioDuration * 1000)) * 100;
    renderBar.style.width = pct + '%';
    drawFrame(ctx, ms, W, H);
    if (!state.renderAbort) requestAnimationFrame(renderStep);
  }
  requestAnimationFrame(renderStep);
};

// Final
console.log('KaraokeAI Script v2.1 Loaded - Custom Filename Added');
apiKeyInput.value = '29ad569427124703968e2831c718b81c';
refreshPreview();
