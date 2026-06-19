/**
 * Build While Bleeding — Interplay Engine
 * buildwhilebleeding.com
 * DAW-style cadence-beat analysis
 */

const CONFIG = {
    LATENCY_THRESHOLD_MS: 20,
    ENERGY_WINDOW:        512,
    FFT_SIZE:             1024,
    SEQ_STEPS:            64,
    BAND_RANGES: {
        sub:     [20,   80],
        low:     [80,   300],
        mid:     [300,  2000],
        highmid: [2000, 6000],
        high:    [6000, 20000],
    },
    COLOR: { vocal:'#00d4ff', drum:'#ff8c00', kick:'#ff8c00', snare:'#ffaf4d', hihat:'#ffd38c', perc:'#ffeacc', green:'#2ed573', red:'#ff4757', amber:'#ffa502', grid:'#1e1e2e', tick:'#444455' },
};

const STATE = { vBuf:null, dBuf:null, ctx:null, charts:{}, animFrame:null };

function getACtx() {
    if (!STATE.ctx || STATE.ctx.state === 'closed')
        STATE.ctx = new (window.AudioContext || window.webkitAudioContext)();
    return STATE.ctx;
}
function setStatus(m) { document.getElementById('status').textContent = m; }
function destroyChart(id) { if (STATE.charts[id]) { STATE.charts[id].destroy(); delete STATE.charts[id]; } }
function showPanels() { document.querySelectorAll('.panel').forEach(p => p.classList.add('active')); }

window.addEventListener('DOMContentLoaded', () => {
    setStatus('Load stems');
    document.getElementById('vocalFile').addEventListener('change', e => {
        const f = e.target.files[0]; if (!f) return;
        document.getElementById('vocalName').textContent = f.name;
        checkReady();
    });
    document.getElementById('drumFile').addEventListener('change', e => {
        const f = e.target.files[0]; if (!f) return;
        document.getElementById('drumName').textContent = f.name;
        checkReady();
    });
    buildRuler();
});

function checkReady() {
    const v = document.getElementById('vocalFile').files[0];
    const d = document.getElementById('drumFile').files[0];
    document.getElementById('analyzeBtn').disabled = !(v && d);
}

// ─── ANALYZE ─────────────────────────────────────────────────────────────────

async function handleAnalyze() {
    const vFile = document.getElementById('vocalFile').files[0];
    const dFile = document.getElementById('drumFile').files[0];
    if (!vFile || !dFile) return;
    document.getElementById('analyzeBtn').disabled = true;
    try {
        const actx = getACtx();
        setStatus('Reading files...');
        const [vArr, dArr] = await Promise.all([vFile.arrayBuffer(), dFile.arrayBuffer()]);
        setStatus('Decoding vocal...');
        let vBuf; try { vBuf = await actx.decodeAudioData(vArr); } catch (e) { setStatus('Vocal decode failed: ' + e.message); document.getElementById('analyzeBtn').disabled = false; return; }
        setStatus('Decoding drums...');
        let dBuf; try { dBuf = await actx.decodeAudioData(dArr); } catch (e) { setStatus('Drum decode failed: ' + e.message); document.getElementById('analyzeBtn').disabled = false; return; }
        STATE.vBuf = vBuf; STATE.dBuf = dBuf;
        runFullAnalysis(vBuf, dBuf);
    } catch (err) { setStatus('Error: ' + err.message); }
    finally { document.getElementById('analyzeBtn').disabled = false; }
}

function runFullAnalysis(vBuf, dBuf) {
    setStatus('Drawing waveforms...');
    drawWaveStation(vBuf, dBuf);
    setStatus('Building sequencer...');
    buildSequencer(vBuf, dBuf);
    estimateBPM(dBuf);

    setStatus('Analyzing forensics...');
    runFileForensics(vBuf, dBuf);
    setStatus('Running deep examination...');
    runDeepExamination(vBuf, dBuf);
    setStatus('Analyzing interplay...');
    runInterplayAnalysis(vBuf, dBuf);

    showPanels();
    setStatus('Ready.');
}

// ─── WAVE STATION ─────────────────────────────────────────────────────────────

function drawWaveStation(vBuf, dBuf) {
    const wc = document.getElementById('waveCanvas');
    const sc = document.getElementById('specCanvas');
    const W = wc.parentElement.offsetWidth;
    const H = 250;
    wc.width = W; wc.height = H; sc.width = W; sc.height = H;

    const wctx = wc.getContext('2d');
    const sctx = sc.getContext('2d');

    wctx.clearRect(0, 0, W, H);
    sctx.clearRect(0, 0, W, H);

    drawWave(wctx, vBuf.getChannelData(0), W, H, CONFIG.COLOR.vocal, 0.8, H / 2);
    drawWave(wctx, dBuf.getChannelData(0), W, H, CONFIG.COLOR.drum, 0.8, H / 2);
    drawSpectrum(sctx, vBuf.getChannelData(0), vBuf.sampleRate, W, H, CONFIG.COLOR.vocal);
    drawSpectrum(sctx, dBuf.getChannelData(0), dBuf.sampleRate, W, H, CONFIG.COLOR.drum);
}

function drawWave(ctx, data, W, H, color, alpha, centerY) {
    const step = Math.max(1, Math.floor(data.length / W));
    const amp = H * 0.4;
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.globalAlpha = alpha;
    ctx.beginPath();
    for (let x = 0; x < W; x++) {
        let mn = 1, mx = -1;
        for (let j = 0; j < step; j++) { const s = data[x * step + j] || 0; if (s < mn) mn = s; if (s > mx) mx = s; }
        if (x === 0) ctx.moveTo(x, centerY + mn * amp);
        else ctx.lineTo(x, centerY + ((mn + mx) / 2) * amp);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
}

function drawSpectrum(ctx, data, sr, W, H, color) {
    const slice = data.slice(0, CONFIG.FFT_SIZE);
    const fft = simpleFFT(slice);
    const barW = Math.ceil(W / fft.length * 3);
    const maxMag = Math.max(...fft) || 1;
    ctx.globalAlpha = 0.8;
    fft.forEach((mag, i) => {
        const x = (i / fft.length) * W;
        const barH = (mag / maxMag) * H;
        const grad = ctx.createLinearGradient(0, H, 0, H - barH);
        grad.addColorStop(0, color + 'cc');
        grad.addColorStop(1, color + '00');
        ctx.fillStyle = grad;
        ctx.fillRect(x, H - barH, barW, barH);
    });
    ctx.globalAlpha = 1;
}

// ─── SEQUENCER ───────────────────────────────────────────────────────────────

function buildSequencer(vBuf, dBuf) {
    const steps = CONFIG.SEQ_STEPS;
    const dO = detectOnsets(dBuf.getChannelData(0));
    const dGrid = onsetsToGrid(dO, dBuf.sampleRate, dBuf.duration, steps);

    const kick = dGrid.map((v, i) => v && (i % 8 === 0 || i % 8 === 2));
    const snare = dGrid.map((v, i) => v && i % 8 === 4);
    const hihat = dGrid.map((v, i) => v && (i % 2 === 0));
    const perc = dGrid.map((v, i) => v && !kick[i] && !snare[i] && !hihat[i]);

    renderSeqRow('cells-kick', kick, 'kick');
    renderSeqRow('cells-snare', snare, 'snare');
    renderSeqRow('cells-hihat', hihat, 'hihat');
    renderSeqRow('cells-perc', perc, 'perc');
}

function onsetsToGrid(onsets, sr, dur, steps) {
    const grid = new Array(steps).fill(false);
    onsets.forEach(s => {
        const idx = Math.min(steps - 1, Math.floor(s / sr / dur * steps));
        grid[idx] = true;
    });
    return grid;
}

function renderSeqRow(elId, grid, type) {
    const el = document.getElementById(elId);
    el.innerHTML = '';
    grid.forEach(active => {
        const cell = document.createElement('div');
        cell.className = 'seq-cell' + (active ? ' active-' + type : '');
        el.appendChild(cell);
    });
}

function buildRuler() {
    const ruler = document.getElementById('seqRuler');
    ruler.innerHTML = '';
    for (let i = 0; i < CONFIG.SEQ_STEPS; i++) {
        const m = document.createElement('div');
        m.className = 'ruler-mark';
        m.textContent = i % 4 === 0 ? String(i / 4 + 1) : '';
        ruler.appendChild(m);
    }
}

function estimateBPM(buf) {
    const onsets = detectOnsets(buf.getChannelData(0));
    if (onsets.length < 2) { document.getElementById('bpmDisplay').textContent = '-- BPM'; return; }
    const diffs = [];
    for (let i = 1; i < onsets.length; i++) diffs.push(onsets[i] - onsets[i - 1]);
    const avgSamples = diffs.reduce((s, v) => s + v, 0) / diffs.length;
    const bpm = Math.round(60 / (avgSamples / buf.sampleRate));
    document.getElementById('bpmDisplay').textContent = (bpm > 40 && bpm < 300 ? bpm : '--') + ' BPM';
}

// ─── ANALYSIS PANELS ──────────────────────────────────────────────────────────

function runFileForensics(vBuf, dBuf) {
    const vData = vBuf.getChannelData(0);
    const vStatsEl = document.getElementById('vocal-stats');
    const vWaveEl = document.getElementById('vocalWaveform');
    vStatsEl.innerHTML = calculateStats(vData, vBuf.sampleRate);
    drawDetailedWave(vWaveEl, vData, CONFIG.COLOR.vocal);

    const dData = dBuf.getChannelData(0);
    const dStatsEl = document.getElementById('drum-stats');
    const dWaveEl = document.getElementById('drumWaveform');
    dStatsEl.innerHTML = calculateStats(dData, dBuf.sampleRate);
    drawDetailedWave(dWaveEl, dData, CONFIG.COLOR.drum);
}

function calculateStats(data, sr) {
    const duration = data.length / sr;
    const rms = Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length);
    const peak = Math.max(...data.map(Math.abs));
    return `<div><strong>Duration:</strong> ${duration.toFixed(2)}s</div>
            <div><strong>RMS:</strong> ${rms.toFixed(3)}</div>
            <div><strong>Peak:</strong> ${peak.toFixed(3)}</div>`;
}

function drawDetailedWave(canvas, data, color) {
    const W = canvas.offsetWidth, H = canvas.offsetHeight;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const step = Math.ceil(data.length / W), amp = H / 2;
    ctx.strokeStyle = color; ctx.lineWidth = 1;
    ctx.clearRect(0, 0, W, H); ctx.beginPath(); ctx.moveTo(0, amp);
    for (let i = 0; i < W; i++) {
        let min = 1.0, max = -1.0;
        for (let j = 0; j < step; j++) {
            const datum = data[(i * step) + j];
            if (datum < min) min = datum;
            if (datum > max) max = datum;
        }
        ctx.lineTo(i, (1 + min) * amp);
        ctx.lineTo(i, (1 + max) * amp);
    }
    ctx.stroke();
}

function runDeepExamination(vBuf, dBuf) {
    const vData = vBuf.getChannelData(0), dData = dBuf.getChannelData(0), sr = vBuf.sampleRate;
    createLineChart('vocalEnergy', 'Vocal Energy', calculateEnergy(vData), CONFIG.COLOR.vocal);
    createLineChart('drumEnergy', 'Drum Energy', calculateEnergy(dData), CONFIG.COLOR.drum);
    createBarChart('vocalBands', 'Vocal Freq', analyzeFrequencyBands(vData, sr), CONFIG.COLOR.vocal);
    createBarChart('drumBands', 'Drum Freq', analyzeFrequencyBands(dData, sr), CONFIG.COLOR.drum);
}

function calculateEnergy(data) {
    const energy = [];
    for (let i = 0; i < data.length; i += CONFIG.ENERGY_WINDOW) {
        const slice = data.slice(i, i + CONFIG.ENERGY_WINDOW);
        energy.push(Math.sqrt(slice.reduce((s, v) => s + v * v, 0) / slice.length));
    }
    return energy;
}

function analyzeFrequencyBands(data, sr) {
    const mid = Math.floor(data.length / 2);
    const slice = data.slice(mid, mid + CONFIG.FFT_SIZE);
    const fft = simpleFFT(slice);
    const bands = { sub: 0, low: 0, mid: 0, highmid: 0, high: 0 };
    const nyquist = sr / 2;
    fft.forEach((mag, i) => {
        const freq = (i * nyquist) / fft.length;
        for (const band in CONFIG.BAND_RANGES) {
            if (freq >= CONFIG.BAND_RANGES[band][0] && freq < CONFIG.BAND_RANGES[band][1]) {
                bands[band] += mag;
            }
        }
    });
    const total = Object.values(bands).reduce((s, v) => s + v, 1);
    return Object.values(bands).map(v => (v / total) * 100);
}

function runInterplayAnalysis(vBuf, dBuf) {
    const vData = vBuf.getChannelData(0), dData = dBuf.getChannelData(0), sr = vBuf.sampleRate;
    const { latencyMap, avgLatency } = analyzeLatency(vData, dData, sr);
    createLineChart('interplayChart', 'Latency (ms)', latencyMap.map(l => l.latency), CONFIG.COLOR.amber);
    document.getElementById('latencyScore').textContent = `LAT ${avgLatency.toFixed(1)}ms`;
    const { syncEvents, syncScore } = analyzeOnsetSync(vData, dData, sr);
    drawSyncTimeline('onsetSync', syncEvents, vBuf.duration);
    document.getElementById('syncScore').textContent = `SYNC ${(syncScore * 100).toFixed(0)}%`;
    const overlap = calculateEnergyOverlap(vData, dData);
    createLineChart('energyOverlap', 'Energy Overlap', overlap, CONFIG.COLOR.green);
}

function analyzeLatency(vocal, drum, sr) {
    const vOnsets = detectOnsets(vocal), dOnsets = detectOnsets(drum);
    if (!vOnsets.length || !dOnsets.length) return { latencyMap: [], avgLatency: 0 };
    const latencyMap = []; let totalLatency = 0;
    vOnsets.forEach(vOnset => {
        const closestDrumOnset = dOnsets.reduce((p, c) => (Math.abs(c - vOnset) < Math.abs(p - vOnset) ? c : p));
        const latencyMs = ((vOnset - closestDrumOnset) / sr) * 1000;
        latencyMap.push({ vocalTime: vOnset / sr, latency: latencyMs });
        totalLatency += latencyMs;
    });
    return { latencyMap, avgLatency: totalLatency / vOnsets.length };
}

function calculateEnergyOverlap(vocal, drum) {
    const vEnergy = calculateEnergy(vocal), dEnergy = calculateEnergy(drum);
    const len = Math.min(vEnergy.length, dEnergy.length), overlap = [];
    for (let i = 0; i < len; i++) overlap.push(Math.sqrt(vEnergy[i] * dEnergy[i]));
    return overlap;
}

function analyzeOnsetSync(vocal, drum, sr) {
    const vOnsets = detectOnsets(vocal).map(s => s / sr);
    const dOnsets = detectOnsets(drum).map(s => s / sr);
    if (!vOnsets.length || !dOnsets.length) return { syncEvents: [], syncScore: 0 };
    let syncCount = 0; const syncEvents = [];
    const thresholdSec = CONFIG.LATENCY_THRESHOLD_MS / 1000;
    vOnsets.forEach(vTime => {
        const closestDrumTime = dOnsets.find(dTime => Math.abs(dTime - vTime) <= thresholdSec);
        const isSync = closestDrumTime !== undefined;
        if (isSync) syncCount++;
        syncEvents.push({ time: vTime, isSync, type: 'vocal' });
    });
    dOnsets.forEach(dTime => {
        if (!syncEvents.some(e => e.isSync && Math.abs(dTime - e.time) <= thresholdSec)) {
             syncEvents.push({ time: dTime, isSync: false, type: 'drum' });
        }
    });
    return { syncEvents, syncScore: syncCount / vOnsets.length };
}

function drawSyncTimeline(canvasId, syncEvents, duration) {
    const canvas = document.getElementById(canvasId);
    const W = canvas.offsetWidth, H = canvas.offsetHeight;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, W, H);
    syncEvents.sort((a, b) => a.time - b.time);
    syncEvents.forEach(event => {
        const x = (event.time / duration) * W;
        ctx.strokeStyle = event.isSync ? CONFIG.COLOR.green : CONFIG.COLOR.red;
        if(event.type==='drum') ctx.strokeStyle = CONFIG.COLOR.amber;
        ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    });
}


// ─── UTILITIES ────────────────────────────────────────────────────────────────

function createLineChart(canvasId, label, data, color) {
    destroyChart(canvasId);
    const ctx = document.getElementById(canvasId).getContext('2d');
    STATE.charts[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: Array.from({ length: data.length }, (_, i) => i),
            datasets: [{ label, data, borderColor: color, borderWidth: 1, pointRadius: 0, tension: 0.1 }]
        },
        options: { scales: { x: { display: false }, y: { display: false } }, plugins: { legend: { display: false } }, maintainAspectRatio: false, animation:false }
    });
}

function createBarChart(canvasId, label, data, color) {
    destroyChart(canvasId);
    const ctx = document.getElementById(canvasId).getContext('2d');
    STATE.charts[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Object.keys(CONFIG.BAND_RANGES),
            datasets: [{ label, data, backgroundColor: color }]
        },
        options: { indexAxis: 'y', scales: { x: { ticks: { color: '#fff' } }, y: { ticks: { color: '#fff' } } }, plugins: { legend: { display: false } }, maintainAspectRatio: false, animation: false }
    });
}

function simpleFFT(samples) {
    const N = samples.length;
    if (N === 0) return [];
    const mag = new Array(Math.floor(N / 2)).fill(0);
    for (let k = 0; k < mag.length; k++) {
        let re = 0, im = 0;
        for (let n = 0; n < N; n++) {
            const a = (2 * Math.PI * k * n) / N;
            re += samples[n] * Math.cos(a);
            im -= samples[n] * Math.sin(a);
        }
        mag[k] = Math.sqrt(re * re + im * im) / N;
    }
    return mag;
}

function detectOnsets(samples) {
    const W = CONFIG.ENERGY_WINDOW, out = []; let prev = 0;
    for (let i = 0; i < samples.length - W; i += W) {
        const c = samples.slice(i, i + W), e = c.reduce((s, v) => s + v * v, 0) / W;
        if (e > prev * 1.2 && e > 0.0005) out.push(i);
        prev = e;
    }
    return out;
}
