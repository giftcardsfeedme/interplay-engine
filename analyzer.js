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
        sub:     [20,   80],
        low:     [80,   300],
        mid:     [300,  2000],
        highmid: [2000, 6000],
        high:    [6000, 20000],
    },
    COLOR: {
        vocal:  '#2ed573',
        drum:   '#ff4757',
        locked: '#2ed573',
        drift:  '#ff4757',
        grid:   '#111',
        tick:   '#333',
    },
};

const STATE = { vocalBuffer: null, drumBuffer: null, audioCtx: null, charts: {} };

document.getElementById('vocalFile').addEventListener('change', e => {
    const f = e.target.files[0];
    if (f) { document.getElementById('vocalName').textContent = f.name; checkReady(); }
});
document.getElementById('drumFile').addEventListener('change', e => {
    const f = e.target.files[0];
    if (f) { document.getElementById('drumName').textContent = f.name; checkReady(); }
});

function checkReady() {
    const v = document.getElementById('vocalFile').files[0];
    const d = document.getElementById('drumFile').files[0];
    document.getElementById('analyzeBtn').disabled = !(v && d);
}

function getCtx() {
    if (!STATE.audioCtx || STATE.audioCtx.state === 'closed')
        STATE.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return STATE.audioCtx;
}

async function handleAnalyze() {
    const vFile = document.getElementById('vocalFile').files[0];
    const dFile = document.getElementById('drumFile').files[0];
    if (!vFile || !dFile) return;
    document.getElementById('analyzeBtn').disabled = true;
    setStatus('Reading files...');
    try {
        const ctx = getCtx();
        const [vArr, dArr] = await Promise.all([vFile.arrayBuffer(), dFile.arrayBuffer()]);
        setStatus('Decoding vocal...');
        let vBuf;
        try { vBuf = await ctx.decodeAudioData(vArr); }
        catch(e) { setStatus('Vocal decode failed: ' + e.message); document.getElementById('analyzeBtn').disabled = false; return; }
        setStatus('Decoding drums...');
        let dBuf;
        try { dBuf = await ctx.decodeAudioData(dArr); }
        catch(e) { setStatus('Drum decode failed: ' + e.message); document.getElementById('analyzeBtn').disabled = false; return; }
        STATE.vocalBuffer = vBuf; STATE.drumBuffer = dBuf;
        setStatus('Forensics...'); renderForensics(vBuf, dBuf);
        setStatus('Examination...'); renderExamination(vBuf, dBuf);
        setStatus('Interplay...'); await renderInterplay(vBuf, dBuf);
        setStatus('Done.'); showPanels();
    } catch(err) { setStatus('Error: ' + err.message); }
    finally { document.getElementById('analyzeBtn').disabled = false; }
}

async function runDemo() {
    setStatus('Building demo...'); document.getElementById('demoBtn').disabled = true;
    try {
        const ctx = getCtx(); const sr = 44100; const dur = 8; const n = sr * dur;
        const vData = new Float32Array(n).map((_,i) => (Math.random()*2-1)*0.5*Math.sin(i/200));
        const dData = new Float32Array(n).map((_,i) => (i % Math.floor(sr*0.5)) < 2000 ? (Math.random()*2-1)*0.9 : (Math.random()*2-1)*0.05);
        const vBuf = ctx.createBuffer(1,n,sr); vBuf.getChannelData(0).set(vData);
        const dBuf = ctx.createBuffer(1,n,sr); dBuf.getChannelData(0).set(dData);
        STATE.vocalBuffer = vBuf; STATE.drumBuffer = dBuf;
        renderForensics(vBuf, dBuf); renderExamination(vBuf, dBuf);
        await renderInterplay(vBuf, dBuf);
        setStatus('Demo loaded.'); showPanels();
    } catch(err) { setStatus('Demo error: ' + err.message); }
    finally { document.getElementById('demoBtn').disabled = false; }
}

function renderForensics(vBuf, dBuf) {
    renderStats('vocal-stats', vBuf); renderStats('drum-stats', dBuf);
    renderWaveform('vocalWaveform', vBuf, CONFIG.COLOR.vocal);
    renderWaveform('drumWaveform',  dBuf, CONFIG.COLOR.drum);
}

function renderStats(elId, buf) {
    const ch = buf.getChannelData(0), sr = buf.sampleRate;
    const peak = ch.reduce((m,v) => Math.max(m,Math.abs(v)), 0);
    const rms  = Math.sqrt(ch.reduce((s,v) => s+v*v, 0) / ch.length);
    const dc   = ch.reduce((s,v) => s+v, 0) / ch.length;
    const rows = [
        ['Duration',     buf.duration.toFixed(3)+' s'],
        ['Sample Rate',  sr.toLocaleString()+' Hz'],
        ['Channels',     buf.numberOfChannels],
        ['Peak Amp',     peak.toFixed(4)],
        ['RMS Energy',   rms.toFixed(4)],
        ['Crest Factor', (rms > 0 ? peak/rms : 0).toFixed(2)],
        ['DC Offset',    dc.toFixed(5)],
        ['Freq Centroid',Math.round(computeCentroid(ch,sr))+' Hz'],
        ['Samples',      ch.length.toLocaleString()],
    ];
    document.getElementById(elId).innerHTML = rows.map(([k,v]) =>
        `<div class="stat-row"><span class="stat-key">${k}</span><span class="stat-val">${v}</span></div>`
    ).join('');
}

function computeCentroid(samples, sr) {
    const fft = simpleFFT(samples.slice(0, CONFIG.FFT_SIZE));
    const fr  = sr / CONFIG.FFT_SIZE;
    let num=0, den=0;
    fft.forEach((m,i) => { num += m*i*fr; den += m; });
    return den > 0 ? num/den : 0;
}

function renderWaveform(id, buf, color) {
    const c = document.getElementById(id), ctx2 = c.getContext('2d');
    const data = buf.getChannelData(0);
    const W = c.parentElement.offsetWidth || 360, H = c.height;
    c.width = W; ctx2.clearRect(0,0,W,H);
    ctx2.strokeStyle = color; ctx2.lineWidth = 1; ctx2.globalAlpha = 0.85;
    const step = Math.max(1, Math.floor(data.length/W));
    ctx2.beginPath();
    for (let x=0; x<W; x++) {
        let mn=1, mx=-1;
        for (let j=0; j<step; j++) { const s=data[x*step+j]||0; if(s<mn)mn=s; if(s>mx)mx=s; }
        ctx2.moveTo(x,(1+mn)*H/2); ctx2.lineTo(x,(1+mx)*H/2);
    }
    ctx2.stroke();
}

function renderExamination(vBuf, dBuf) {
    const vE = computeEnergy(vBuf.getChannelData(0)), dE = computeEnergy(dBuf.getChannelData(0));
    const vB = computeBands(vBuf.getChannelData(0), vBuf.sampleRate);
    const dB = computeBands(dBuf.getChannelData(0), dBuf.sampleRate);
    renderLine('vocalEnergy', vE, 'RMS', CONFIG.COLOR.vocal);
    renderLine('drumEnergy',  dE, 'RMS', CONFIG.COLOR.drum);
    renderBar('vocalBands',   vB, CONFIG.COLOR.vocal);
    renderBar('drumBands',    dB, CONFIG.COLOR.drum);
}

function computeEnergy(samples) {
    const W=CONFIG.ENERGY_WINDOW_SIZE, out=[];
    for (let i=0; i<samples.length; i+=W) {
        const c=samples.slice(i,i+W);
        out.push(parseFloat(Math.sqrt(c.reduce((s,v)=>s+v*v,0)/c.length).toFixed(4)));
    }
    return out;
}

function computeBands(samples, sr) {
    const fft=simpleFFT(samples.slice(0,CONFIG.FFT_SIZE)), fr=sr/CONFIG.FFT_SIZE, out={};
    for (const [n,[lo,hi]] of Object.entries(CONFIG.BAND_RANGES)) {
        const s=fft.slice(Math.floor(lo/fr), Math.floor(hi/fr));
        out[n] = s.length ? parseFloat((s.reduce((a,v)=>a+v,0)/s.length).toFixed(4)) : 0;
    }
    return out;
}

function renderLine(id, data, label, color) {
    destroyChart(id);
    STATE.charts[id] = new Chart(document.getElementById(id).getContext('2d'), {
        type:'line', data:{ labels:data.map((_,i)=>i),
        datasets:[{label,data,borderColor:color,backgroundColor:color+'22',borderWidth:1,pointRadius:0,fill:true,tension:0.3}]},
        options:chartOpts('Frame','RMS'),
    });
}

function renderBar(id, bands, color) {
    destroyChart(id);
    STATE.charts[id] = new Chart(document.getElementById(id).getContext('2d'), {
        type:'bar', data:{ labels:Object.keys(bands).map(k=>k.toUpperCase()),
        datasets:[{label:'Energy',data:Object.values(bands),backgroundColor:color+'99',borderColor:color,borderWidth:1}]},
        options:chartOpts('Band','Avg Magnitude'),
    });
}

async function renderInterplay(vBuf, dBuf) {
    const vE=computeEnergy(vBuf.getChannelData(0)), dE=computeEnergy(dBuf.getChannelData(0));
    const vO=detectOnsets(vBuf.getChannelData(0)), dO=detectOnsets(dBuf.getChannelData(0));
    const matrix=buildMatrix(vO,dO,vBuf.sampleRate);
    const sync=buildSync(vO,dO,vBuf.sampleRate,vBuf.duration);
    const avg=matrix.length ? matrix.reduce((s,m)=>s+Math.abs(m.latency),0)/matrix.length : 0;
    const lock=matrix.length ? matrix.filter(m=>Math.abs(m.latency)<CONFIG.LATENCY_THRESHOLD_MS).length/matrix.length*100 : 0;
    const corr=pearson(vE,dE);
    renderScores(avg,lock,corr);
    renderScatter('interplayChart',matrix);
    renderDual('energyOverlap',vE,dE);
    renderSync('onsetSync',sync);
}

function detectOnsets(samples) {
    const W=CONFIG.ENERGY_WINDOW_SIZE, out=[]; let prev=0;
    for (let i=0; i<samples.length-W; i+=W) {
        const c=samples.slice(i,i+W), e=c.reduce((s,v)=>s+v*v,0)/W;
        if (e>prev*1.5 && e>0.001) out.push(i);
        prev=e;
    }
    return out;
}

function buildMatrix(vO,dO,sr) {
    const out=[];
    for (let i=0; i<Math.max(vO.length,dO.length); i++) {
        if (vO[i]!==undefined && dO[i]!==undefined)
            out.push({time:parseFloat((vO[i]/sr).toFixed(3)), latency:parseFloat(((vO[i]-dO[i])/sr*1000).toFixed(2))});
    }
    return out;
}

function buildSync(vO,dO,sr,dur) {
    const res=100, tl=Array.from({length:res},(_,i)=>({t:parseFloat((i/res*dur).toFixed(2)),vocal:0,drum:0}));
    vO.forEach(s=>{const i=Math.min(res-1,Math.floor(s/sr/dur*res)); tl[i].vocal=1;});
    dO.forEach(s=>{const i=Math.min(res-1,Math.floor(s/sr/dur*res)); tl[i].drum=1;});
    return tl;
}

function pearson(a,b) {
    const n=Math.min(a.length,b.length), aS=a.slice(0,n), bS=b.slice(0,n);
    const am=aS.reduce((s,v)=>s+v,0)/n, bm=bS.reduce((s,v)=>s+v,0)/n;
    let num=0,ad=0,bd=0;
    for(let i=0;i<n;i++){const da=aS[i]-am,db=bS[i]-bm; num+=da*db; ad+=da*da; bd+=db*db;}
    return ad&&bd ? parseFloat((num/Math.sqrt(ad*bd)).toFixed(3)) : 0;
}

function renderScores(avg,lock,corr) {
    const sc=v=>v>=70?'score-good':v>=40?'score-mid':'score-bad';
    document.getElementById('interplay-scores').innerHTML=`
        <div class="score-block"><div class="score-label">SYNC LOCK</div><div class="score-value ${sc(lock)}">${lock.toFixed(1)}%</div></div>
        <div class="score-block"><div class="score-label">AVG LATENCY</div><div class="score-value ${avg<20?'score-good':avg<50?'score-mid':'score-bad'}">${avg.toFixed(1)}ms</div></div>
        <div class="score-block"><div class="score-label">ENERGY CORR</div><div class="score-value ${sc((corr+1)/2*100)}">${corr}</div></div>`;
}

function renderScatter(id, matrix) {
    destroyChart(id);
    STATE.charts[id] = new Chart(document.getElementById(id).getContext('2d'), {
        type:'scatter', data:{datasets:[{label:'Latency (ms)',
        data:matrix.map(m=>({x:m.time,y:m.latency})),
        backgroundColor:matrix.map(m=>Math.abs(m.latency)<CONFIG.LATENCY_THRESHOLD_MS?CONFIG.COLOR.locked:CONFIG.COLOR.drift),
        pointRadius:5}]}, options:chartOpts('Timestamp (s)','Latency (ms)'),
    });
}

function renderDual(id, vE, dE) {
    destroyChart(id);
    const n=Math.min(vE.length,dE.length);
    STATE.charts[id] = new Chart(document.getElementById(id).getContext('2d'), {
        type:'line', data:{labels:Array.from({length:n},(_,i)=>i), datasets:[
            {label:'Vocal',data:vE.slice(0,n),borderColor:CONFIG.COLOR.vocal,backgroundColor:CONFIG.COLOR.vocal+'22',borderWidth:1,pointRadius:0,fill:true,tension:0.3},
            {label:'Drum', data:dE.slice(0,n),borderColor:CONFIG.COLOR.drum, backgroundColor:CONFIG.COLOR.drum+'22', borderWidth:1,pointRadius:0,fill:true,tension:0.3},
        ]}, options:chartOpts('Frame','RMS'),
    });
}

function renderSync(id, sync) {
    destroyChart(id);
    STATE.charts[id] = new Chart(document.getElementById(id).getContext('2d'), {
        type:'bar', data:{labels:sync.map(s=>s.t.toFixed(1)), datasets:[
            {label:'Vocal Onsets',data:sync.map(s=>s.vocal),backgroundColor:CONFIG.COLOR.vocal+'cc'},
            {label:'Drum Onsets', data:sync.map(s=>s.drum), backgroundColor:CONFIG.COLOR.drum+'cc'},
        ]}, options:{...chartOpts('Time (s)','Onset'), scales:{x:chartOpts('Time (s)','Onset').scales.x, y:{...chartOpts('Time (s)','Onset').scales.y,max:1.2}}},
    });
}

function chartOpts(xL,yL) {
    return { responsive:true, animation:{duration:300},
        plugins:{legend:{labels:{color:'#444',font:{family:'monospace',size:10}}}},
        scales:{
            x:{title:{display:true,text:xL,color:'#333'},ticks:{color:CONFIG.COLOR.tick,font:{family:'monospace',size:9},maxTicksLimit:8},grid:{color:CONFIG.COLOR.grid}},
            y:{title:{display:true,text:yL,color:'#333'},ticks:{color:CONFIG.COLOR.tick,font:{family:'monospace',size:9}},grid:{color:CONFIG.COLOR.grid}},
        }};
}

function destroyChart(id) { if(STATE.charts[id]){STATE.charts[id].destroy(); delete STATE.charts[id];} }

function simpleFFT(samples) {
    const N=samples.length, mag=new Array(Math.floor(N/2)).fill(0);
    for(let k=0;k<mag.length;k++){
        let re=0,im=0;
        for(let n=0;n<N;n++){const a=(2*Math.PI*k*n)/N; re+=samples[n]*Math.cos(a); im-=samples[n]*Math.sin(a);}
        mag[k]=Math.sqrt(re*re+im*im)/N;
    }
    return mag;
}

function showPanels() { document.querySelectorAll('.panel').forEach(p=>p.classList.add('active')); }
function setStatus(msg) { document.getElementById('status').textContent = msg; }
