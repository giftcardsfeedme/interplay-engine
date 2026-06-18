/**
 * Build While Bleeding — Interplay Engine
 * buildwhilebleeding.com
 * Cadence-beat granular stem analysis + interplay visualization
 */

const CONFIG = {
    API_URL:              'https://giftcardsfeedme-interplay-engine.hf.space',
    LATENCY_THRESHOLD_MS: 20,
    ENERGY_WINDOW_SIZE:   512,
    FFT_SIZE:             2048,
    BAND_RANGES: {
        sub:       [20,   80],
        low:       [80,   300],
        mid:       [300,  2000],
        highmid:   [2000, 6000],
        high:      [6000, 20000],
    },
    COLOR: {
        vocal:   '#2ed573',
        drum:    '#ff4757',
        overlap: '#ffa502',
        locked:  '#2ed573',
        drift:   '#ff4757',
        grid:    '#111',
        tick:    '#333',
    },
};

// STATE
const STATE = {
    vocalBuffer: null,
    drumBuffer:  null,
    audioCtx:    null,
    charts:      {},
};

// ─── BOOT ────────────────────────────────────────────────────────────────────

document.getElementById('vocalFile').addEventListener('change', e => {
    const f = e.target.files[0];
    if (f) {
        document.getElementById('vocalName').textContent = f.name;
        checkReady();
    }
});

document.getElementById('drumFile').addEventListener('change', e => {
    const f = e.target.files[0];
    if (f) {
        document.getElementById('drumName').textContent = f.name;
        checkReady();
    }
});

function checkReady() {
    const v = document.getElementById('vocalFile').files[0];
    const d = document.getElementById('drumFile').files[0];
    document.getElementById('analyzeBtn').disabled = !(v && d);
}

// ─── MAIN HANDLER ────────────────────────────────────────────────────────────

async function handleAnalyze() {
    const vFile = document.getElementById('vocalFile').files[0];
    const dFile = document.getElementById('drumFile').files[0];
    if (!vFile || !dFile) return;

    setStatus('Decoding audio...');
    STATE.audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    try {
        const [vBuf, dBuf] = await Promise.all([
            decodeFile(vFile),
            decodeFile(dFile),
        ]);
        STATE.vocalBuffer = vBuf;
        STATE.drumBuffer  = dBuf;

        setStatus('Running forensics...');
        renderForensics(vBuf, dBuf);

        setStatus('Running deep examination...');
        renderExamination(vBuf, dBuf);

        setStatus('Computing interplay...');
        await renderInterplay(vBuf, dBuf);

        setStatus('');
        showPanels();
    } catch (err) {
        console.error('[BWB] Analysis failed:', err);
        setStatus('Decode failed — check file format.');
    }
}

async function decodeFile(file) {
    const arrayBuffer = await file.arrayBuffer();
    return STATE.audioCtx.decodeAudioData(arrayBuffer);
}

// ─── PANEL 1: FORENSICS ──────────────────────────────────────────────────────

function renderForensics(vBuf, dBuf) {
    renderStats('vocal-stats', vBuf);
    renderStats('drum-stats',  dBuf);
    renderWaveform('vocalWaveform', vBuf, CONFIG.COLOR.vocal);
    renderWaveform('drumWaveform',  dBuf, CONFIG.COLOR.drum);
}

function renderStats(elId, buf) {
    const ch      = buf.getChannelData(0);
    const sr      = buf.sampleRate;
    const dur     = buf.duration;
    const peak    = Math.max(...Array.from(ch).map(Math.abs));
    const rms     = Math.sqrt(ch.reduce((s, v) => s + v * v, 0) / ch.length);
    const centroid = computeCentroid(ch, sr);
    const dcOffset = ch.reduce((s, v) => s + v, 0) / ch.length;
    const crest   = peak / (rms || 1);

    const rows = [
        ['Duration',     `${dur.toFixed(3)} s`],
        ['Sample Rate',  `${sr.toLocaleString()} Hz`],
        ['Channels',     buf.numberOfChannels],
        ['Peak Amp',     peak.toFixed(4)],
        ['RMS Energy',   rms.toFixed(4)],
        ['Crest Factor', crest.toFixed(2)],
        ['DC Offset',    dcOffset.toFixed(5)],
        ['Freq Centroid',`${Math.round(centroid)} Hz`],
        ['Samples',      ch.length.toLocaleString()],
    ];

    document.getElementById(elId).innerHTML = rows.map(([k, v]) =>
        `<div class="stat-row"><span class="stat-key">${k}</span><span class="stat-val">${v}</span></div>`
    ).join('');
}

function computeCentroid(samples, sr) {
    const fft   = simpleFFT(samples.slice(0, CONFIG.FFT_SIZE));
    const freqRes = sr / CONFIG.FFT_SIZE;
    let num = 0, den = 0;
    fft.forEach((mag, i) => { num += mag * i * freqRes; den += mag; });
    return den ? num / den : 0;
}

function renderWaveform(canvasId, buf, color) {
    const canvas = document.getElementById(canvasId);
    const ctx    = canvas.getContext('2d');
    const data   = buf.getChannelData(0);
    const W      = canvas.offsetWidth || 400;
    const H      = canvas.height;
    canvas.width = W;

    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = color;
    ctx.lineWidth   = 1;
    ctx.globalAlpha = 0.8;

    const step = Math.ceil(data.length / W);
    ctx.beginPath();
    for (let x = 0; x < W; x++) {
        let min = 1, max = -1;
        for (let j = 0; j < step; j++) {
            const s = data[x * step + j] || 0;
            if (s < min) min = s;
            if (s > max) max = s;
        }
        ctx.moveTo(x, (1 + min) * H / 2);
        ctx.lineTo(x, (1 + max) * H / 2);
    }
    ctx.stroke();
}

// ─── PANEL 2: DEEP EXAMINATION ───────────────────────────────────────────────

function renderExamination(vBuf, dBuf) {
    const vEnergy = computeEnergyOverTime(vBuf.getChannelData(0));
    const dEnergy = computeEnergyOverTime(dBuf.getChannelData(0));
    const vBands  = computeFrequencyBands(vBuf.getChannelData(0), vBuf.sampleRate);
    const dBands  = computeFrequencyBands(dBuf.getChannelData(0), dBuf.sampleRate);

    renderLineChart('vocalEnergy', vEnergy, 'RMS', CONFIG.COLOR.vocal);
    renderLineChart('drumEnergy',  dEnergy, 'RMS', CONFIG.COLOR.drum);
    renderBarChart('vocalBands',   vBands,  CONFIG.COLOR.vocal);
    renderBarChart('drumBands',    dBands,  CONFIG.COLOR.drum);
}

function computeEnergyOverTime(samples) {
    const W   = CONFIG.ENERGY_WINDOW_SIZE;
    const out = [];
    for (let i = 0; i < samples.length; i += W) {
        const chunk = samples.slice(i, i + W);
        const rms   = Math.sqrt(chunk.reduce((s, v) => s + v * v, 0) / chunk.length);
        out.push(parseFloat(rms.toFixed(4)));
    }
    return out;
}

function computeFrequencyBands(samples, sr) {
    const fft    = simpleFFT(samples.slice(0, CONFIG.FFT_SIZE));
    const freqRes = sr / CONFIG.FFT_SIZE;
    const bands  = {};
    for (const [name, [lo, hi]] of Object.entries(CONFIG.BAND_RANGES)) {
        const loIdx = Math.floor(lo / freqRes);
        const hiIdx = Math.floor(hi / freqRes);
        const slice = fft.slice(loIdx, hiIdx);
        bands[name] = slice.length
            ? parseFloat((slice.reduce((s, v) => s + v, 0) / slice.length).toFixed(4))
            : 0;
    }
    return bands;
}

function renderLineChart(canvasId, data, label, color) {
    destroyChart(canvasId);
    STATE.charts[canvasId] = new Chart(
        document.getElementById(canvasId).getContext('2d'), {
        type: 'line',
        data: {
            labels: data.map((_, i) => i),
            datasets: [{ label, data, borderColor: color, backgroundColor: color + '22',
                borderWidth: 1, pointRadius: 0, fill: true, tension: 0.3 }],
        },
        options: chartOptions('Frame', 'RMS'),
    });
}

function renderBarChart(canvasId, bands, color) {
    destroyChart(canvasId);
    STATE.charts[canvasId] = new Chart(
        document.getElementById(canvasId).getContext('2d'), {
        type: 'bar',
        data: {
            labels: Object.keys(bands).map(k => k.toUpperCase()),
            datasets: [{ label: 'Energy', data: Object.values(bands),
                backgroundColor: color + '99', borderColor: color, borderWidth: 1 }],
        },
        options: chartOptions('Band', 'Avg Magnitude'),
    });
}

// ─── PANEL 3: INTERPLAY ──────────────────────────────────────────────────────

async function renderInterplay(vBuf, dBuf) {
    const vEnergy = computeEnergyOverTime(vBuf.getChannelData(0));
    const dEnergy = computeEnergyOverTime(dBuf.getChannelData(0));
    const vOnsets = detectOnsets(vBuf.getChannelData(0));
    const dOnsets = detectOnsets(dBuf.getChannelData(0));

    const matrix  = buildLatencyMatrix(vOnsets, dOnsets, vBuf.sampleRate);
    const overlap  = buildOverlap(vEnergy, dEnergy);
    const sync     = buildSyncTimeline(vOnsets, dOnsets, vBuf.sampleRate, vBuf.duration);

    const avgLat   = matrix.length ? matrix.reduce((s, m) => s + Math.abs(m.latency), 0) / matrix.length : 0;
    const lockPct  = matrix.length ? (matrix.filter(m => Math.abs(m.latency) < CONFIG.LATENCY_THRESHOLD_MS).length / matrix.length * 100) : 0;
    const energyCorr = pearsonCorr(vEnergy, dEnergy);

    renderScores(avgLat, lockPct, energyCorr);
    renderScatterChart('interplayChart', matrix, 'Latency (ms)', 'Timestamp (s)', 'Latency (ms)');
    renderDualLine('energyOverlap', vEnergy, dEnergy);
    renderSyncTimeline('onsetSync', sync, vBuf.duration);
}

function detectOnsets(samples) {
    const W       = CONFIG.ENERGY_WINDOW_SIZE;
    const onsets  = [];
    let prevEnergy = 0;
    for (let i = 0; i < samples.length - W; i += W) {
        const chunk = samples.slice(i, i + W);
        const energy = chunk.reduce((s, v) => s + v * v, 0) / W;
        if (energy > prevEnergy * 1.5 && energy > 0.001) onsets.push(i);
        prevEnergy = energy;
    }
    return onsets;
}

function buildLatencyMatrix(vOnsets, dOnsets, sr) {
    const matrix = [];
    const maxLen = Math.max(vOnsets.length, dOnsets.length);
    for (let i = 0; i < maxLen; i++) {
        const v = vOnsets[i];
        const d = dOnsets[i];
        if (v !== undefined && d !== undefined) {
            matrix.push({
                time:    parseFloat((v / sr).toFixed(3)),
                latency: parseFloat(((v - d) / sr * 1000).toFixed(2)),
            });
        }
    }
    return matrix;
}

function buildOverlap(vEnergy, dEnergy) {
    const len = Math.min(vEnergy.length, dEnergy.length);
    return Array.from({ length: len }, (_, i) => ({ v: vEnergy[i], d: dEnergy[i] }));
}

function buildSyncTimeline(vOnsets, dOnsets, sr, duration) {
    const resolution = 100;
    const timeline   = Array.from({ length: resolution }, (_, i) => ({
        t:     parseFloat((i / resolution * duration).toFixed(2)),
        vocal: 0,
        drum:  0,
    }));
    vOnsets.forEach(s => {
        const idx = Math.floor(s / sr / duration * resolution);
        if (timeline[idx]) timeline[idx].vocal = 1;
    });
    dOnsets.forEach(s => {
        const idx = Math.floor(s / sr / duration * resolution);
        if (timeline[idx]) timeline[idx].drum = 1;
    });
    return timeline;
}

function pearsonCorr(a, b) {
    const len  = Math.min(a.length, b.length);
    const aS   = a.slice(0, len), bS = b.slice(0, len);
    const aMean = aS.reduce((s, v) => s + v, 0) / len;
    const bMean = bS.reduce((s, v) => s + v, 0) / len;
    let num = 0, aDen = 0, bDen = 0;
    for (let i = 0; i < len; i++) {
        const da = aS[i] - aMean, db = bS[i] - bMean;
        num += da * db; aDen += da * da; bDen += db * db;
    }
    return aDen && bDen ? parseFloat((num / Math.sqrt(aDen * bDen)).toFixed(3)) : 0;
}

function renderScores(avgLat, lockPct, corr) {
    const scoreClass = v => v >= 70 ? 'score-good' : v >= 40 ? 'score-mid' : 'score-bad';
    document.getElementById('interplay-scores').innerHTML = `
        <div class="score-block">
            <div class="score-label">SYNC LOCK</div>
            <div class="score-value ${scoreClass(lockPct)}">${lockPct.toFixed(1)}%</div>
        </div>
        <div class="score-block">
            <div class="score-label">AVG LATENCY</div>
            <div class="score-value ${avgLat < 20 ? 'score-good' : avgLat < 50 ? 'score-mid' : 'score-bad'}">${avgLat.toFixed(1)}ms</div>
        </div>
        <div class="score-block">
            <div class="score-label">ENERGY CORR</div>
            <div class="score-value ${scoreClass((corr + 1) / 2 * 100)}">${corr}</div>
        </div>
    `;
}

function renderScatterChart(canvasId, matrix, label, xLabel, yLabel) {
    destroyChart(canvasId);
    STATE.charts[canvasId] = new Chart(
        document.getElementById(canvasId).getContext('2d'), {
        type: 'scatter',
        data: {
            datasets: [{
                label,
                data: matrix.map(m => ({ x: m.time, y: m.latency })),
                backgroundColor: matrix.map(m =>
                    Math.abs(m.latency) < CONFIG.LATENCY_THRESHOLD_MS
                        ? CONFIG.COLOR.locked : CONFIG.COLOR.drift),
                pointRadius: 5,
            }],
        },
        options: chartOptions(xLabel, yLabel),
    });
}

function renderDualLine(canvasId, vEnergy, dEnergy) {
    destroyChart(canvasId);
    const len = Math.min(vEnergy.length, dEnergy.length);
    STATE.charts[canvasId] = new Chart(
        document.getElementById(canvasId).getContext('2d'), {
        type: 'line',
        data: {
            labels: Array.from({ length: len }, (_, i) => i),
            datasets: [
                { label: 'Vocal', data: vEnergy.slice(0, len), borderColor: CONFIG.COLOR.vocal,
                  backgroundColor: CONFIG.COLOR.vocal + '22', borderWidth: 1, pointRadius: 0, fill: true, tension: 0.3 },
                { label: 'Drum',  data: dEnergy.slice(0, len), borderColor: CONFIG.COLOR.drum,
                  backgroundColor: CONFIG.COLOR.drum + '22',  borderWidth: 1, pointRadius: 0, fill: true, tension: 0.3 },
            ],
        },
        options: chartOptions('Frame', 'RMS'),
    });
}

function renderSyncTimeline(canvasId, sync, duration) {
    destroyChart(canvasId);
    STATE.charts[canvasId] = new Chart(
        document.getElementById(canvasId).getContext('2d'), {
        type: 'bar',
        data: {
            labels: sync.map(s => s.t.toFixed(1)),
            datasets: [
                { label: 'Vocal Onsets', data: sync.map(s => s.vocal), backgroundColor: CONFIG.COLOR.vocal + 'cc' },
                { label: 'Drum Onsets',  data: sync.map(s => s.drum),  backgroundColor: CONFIG.COLOR.drum  + 'cc' },
            ],
        },
        options: {
            ...chartOptions('Time (s)', 'Onset'),
            scales: {
                ...chartOptions('Time (s)', 'Onset').scales,
                y: { ...chartOptions('Time (s)', 'Onset').scales.y, max: 1.2 },
            },
        },
    });
}

// ─── DEMO MODE ───────────────────────────────────────────────────────────────

function runDemo() {
    setStatus('Demo mode — simulated stems.');

    const sr      = 44100;
    const dur     = 10;
    const samples = sr * dur;

    const vData = new Float32Array(samples).map(() => (Math.random() * 2 - 1) * 0.6);
    const dData = new Float32Array(samples).map((_, i) =>
        i % Math.floor(sr * 0.5) < 1000 ? (Math.random() * 2 - 1) * 0.9 : (Math.random() * 2 - 1) * 0.1
    );

    STATE.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const vBuf = STATE.audioCtx.createBuffer(1, samples, sr);
    const dBuf = STATE.audioCtx.createBuffer(1, samples, sr);
    vBuf.getChannelData(0).set(vData);
    dBuf.getChannelData(0).set(dData);

    STATE.vocalBuffer = vBuf;
    STATE.drumBuffer  = dBuf;

    renderForensics(vBuf, dBuf);
    renderExamination(vBuf, dBuf);
    renderInterplay(vBuf, dBuf);

    setStatus('');
    showPanels();
}

// ─── UTILITIES ───────────────────────────────────────────────────────────────

function chartOptions(xLabel, yLabel) {
    return {
        responsive: true,
        animation:  { duration: 400 },
        plugins: {
            legend: { labels: { color: '#444', font: { family: 'monospace', size: 10 } } },
        },
        scales: {
            x: {
                title: { display: true, text: xLabel, color: '#333' },
                ticks: { color: CONFIG.COLOR.tick, font: { family: 'monospace', size: 9 }, maxTicksLimit: 8 },
                grid:  { color: CONFIG.COLOR.grid },
            },
            y: {
                title: { display: true, text: yLabel, color: '#333' },
                ticks: { color: CONFIG.COLOR.tick, font: { family: 'monospace', size: 9 } },
                grid:  { color: CONFIG.COLOR.grid },
            },
        },
    };
}

function destroyChart(id) {
    if (STATE.charts[id]) { STATE.charts[id].destroy(); delete STATE.charts[id]; }
}

function simpleFFT(samples) {
    const N   = samples.length;
    const mag = new Array(N / 2).fill(0);
    for (let k = 0; k < N / 2; k++) {
        let re = 0, im = 0;
        for (let n = 0; n < N; n++) {
            const angle = (2 * Math.PI * k * n) / N;
            re += samples[n] * Math.cos(angle);
            im -= samples[n] * Math.sin(angle);
        }
        mag[k] = Math.sqrt(re * re + im * im) / N;
    }
    return mag;
}

function showPanels() {
    document.querySelectorAll('.panel').forEach(p => p.classList.add('active'));
}

function setStatus(msg) {
    document.getElementById('status').textContent = msg;
}
