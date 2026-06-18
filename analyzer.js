// Build While Bleeding — Interplay Engine
// buildwhilebleeding.com
// Cadence-beat latency analyzer — vocal/drum stem interplay visualization

const CONFIG = {
    API_URL: 'https://giftcardsfeedme-interplay-engine.hf.space',
    LATENCY_THRESHOLD_MS: 20,
    COLOR_LOCKED: '#2ed573',
    COLOR_DRIFT:  '#ff4757',
};

let chartInstance = null;

function setStatus(msg) {
    document.getElementById('status').textContent = msg;
}

async function handleAnalyze() {
    const vocalFile = document.getElementById('vocalFile').files[0];
    const drumFile  = document.getElementById('drumFile').files[0];

    if (!vocalFile || !drumFile) {
        setStatus('Load both stems first.');
        return;
    }

    setStatus('Reading stems...');

    try {
        const [vocalData, drumData] = await Promise.all([
            readAudioFile(vocalFile),
            readAudioFile(drumFile),
        ]);

        setStatus('Sending to analysis engine...');
        await runAnalysis(vocalData, drumData);
    } catch (err) {
        console.error('[BWB] handleAnalyze failed:', err);
        setStatus('Analysis failed — check console.');
    }
}

async function readAudioFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
            const buffer = e.target.result;
            const bytes   = new Uint8Array(buffer);
            const samples = Array.from(bytes.slice(0, 512));
            resolve(samples);
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

async function runAnalysis(vocalData, drumData) {
    try {
        const res = await fetch(`${CONFIG.API_URL}/api/interplay`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vocals: vocalData, drums: drumData }),
        });

        if (!res.ok) {
            const errText = await res.text();
            console.error('[BWB] API error:', res.status, errText);
            setStatus(`API error ${res.status} — running demo fallback.`);
            runDemo();
            return;
        }

        const { matrix } = await res.json();
        setStatus('');
        renderChart(matrix);
    } catch (err) {
        console.error('[BWB] Fetch failed:', err);
        setStatus('Engine unreachable — running demo fallback.');
        runDemo();
    }
}

function runDemo() {
    setStatus('Demo mode — simulated interplay data.');
    const matrix = Array.from({ length: 40 }, (_, i) => ({
        time:    parseFloat((i * 0.25).toFixed(2)),
        latency: parseFloat(((Math.random() * 80) - 40).toFixed(1)),
    }));
    renderChart(matrix);
}

function renderChart(matrix) {
    const ctx = document.getElementById('interplayChart').getContext('2d');

    if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
    }

    chartInstance = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Latency (ms)',
                data: matrix.map(m => ({ x: m.time, y: m.latency })),
                backgroundColor: matrix.map(m =>
                    Math.abs(m.latency) < CONFIG.LATENCY_THRESHOLD_MS
                        ? CONFIG.COLOR_LOCKED
                        : CONFIG.COLOR_DRIFT
                ),
                pointRadius: 5,
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    labels: { color: '#888', font: { family: 'monospace' } }
                }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Timestamp (s)', color: '#666' },
                    ticks: { color: '#555' },
                    grid:  { color: '#111' },
                },
                y: {
                    title: { display: true, text: 'Latency (ms)', color: '#666' },
                    ticks: { color: '#555' },
                    grid:  { color: '#111' },
                },
            },
        },
    });
}
