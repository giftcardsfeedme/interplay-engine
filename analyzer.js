
// BWB DIAGNOSTIC BUILD
console.log('[BWB] analyzer.js loaded');

document.addEventListener('DOMContentLoaded', function() {
    console.log('[BWB] DOM ready');
    document.getElementById('status').textContent = 'JS loaded OK';
    document.getElementById('status').style.color = '#2ed573';
});

document.getElementById('vocalFile').addEventListener('change', e => {
    const f = e.target.files[0];
    if (f) {
        document.getElementById('vocalName').textContent = f.name;
        document.getElementById('status').textContent = 'Vocal loaded: ' + f.name + ' (' + f.type + ')';
        checkReady();
    }
});

document.getElementById('drumFile').addEventListener('change', e => {
    const f = e.target.files[0];
    if (f) {
        document.getElementById('drumName').textContent = f.name;
        document.getElementById('status').textContent = 'Drum loaded: ' + f.name + ' (' + f.type + ')';
        checkReady();
    }
});

function checkReady() {
    const v = document.getElementById('vocalFile').files[0];
    const d = document.getElementById('drumFile').files[0];
    document.getElementById('analyzeBtn').disabled = !(v && d);
}

async function handleAnalyze() {
    setStatus('Testing AudioContext...');
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        setStatus('AudioContext OK — state: ' + ctx.state);
        const vFile = document.getElementById('vocalFile').files[0];
        setStatus('Reading: ' + vFile.name + ' size: ' + vFile.size + ' type: ' + vFile.type);
        const arr = await vFile.arrayBuffer();
        setStatus('ArrayBuffer OK — ' + arr.byteLength + ' bytes. Decoding...');
        try {
            const buf = await ctx.decodeAudioData(arr);
            setStatus('DECODE OK — ' + buf.duration.toFixed(2) + 's @ ' + buf.sampleRate + 'Hz');
        } catch(e) {
            setStatus('DECODE FAILED: ' + e.name + ' — ' + e.message);
        }
    } catch(e) {
        setStatus('AudioContext FAILED: ' + e.message);
    }
}

function runDemo() {
    setStatus('Demo clicked — testing AudioContext...');
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        setStatus('AudioContext state: ' + ctx.state + ' — SR: ' + ctx.sampleRate);
        const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        setStatus('Buffer created OK — DEMO WORKS. Full build is AudioContext issue.');
    } catch(e) {
        setStatus('Demo AudioContext FAILED: ' + e.message);
    }
}

function setStatus(msg) {
    console.log('[BWB]', msg);
    document.getElementById('status').textContent = msg;
}
