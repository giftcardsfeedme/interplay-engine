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
    if (!STATE.ctx || STATE.ctx.state==='closed')
        STATE.ctx = new (window.AudioContext||window.webkitAudioContext)();
    return STATE.ctx;
}
function setStatus(m) { document.getElementById('status').textContent = m; }
function destroyChart(id) { if(STATE.charts[id]){STATE.charts[id].destroy();delete STATE.charts[id];} }
function showPanels() { document.querySelectorAll('.panel').forEach(p=>p.classList.add('active')); }

window.addEventListener('DOMContentLoaded', () => {
    setStatus('Load stems');
    document.getElementById('vocalFile').addEventListener('change', e => {
        const f=e.target.files[0]; if(!f) return;
        document.getElementById('vocalName').textContent = f.name;
        checkReady();
    });
    document.getElementById('drumFile').addEventListener('change', e => {
        const f=e.target.files[0]; if(!f) return;
        document.getElementById('drumName').textContent = f.name;
        checkReady();
    });
    buildRuler();
});

function checkReady() {
    const v=document.getElementById('vocalFile').files[0];
    const d=document.getElementById('drumFile').files[0];
    document.getElementById('analyzeBtn').disabled = !(v&&d);
}

// ─── ANALYZE ─────────────────────────────────────────────────────────────────

async function handleAnalyze() {
    const vFile=document.getElementById('vocalFile').files[0];
    const dFile=document.getElementById('drumFile').files[0];
    if(!vFile||!dFile) return;
    document.getElementById('analyzeBtn').disabled=true;
    try {
        const actx=getACtx();
        setStatus('Reading files...');
        const [vArr,dArr] = await Promise.all([vFile.arrayBuffer(),dFile.arrayBuffer()]);
        setStatus('Decoding vocal...');
        let vBuf; try { vBuf=await actx.decodeAudioData(vArr); } catch(e){setStatus('Vocal decode failed: '+e.message);document.getElementById('analyzeBtn').disabled=false;return;}
        setStatus('Decoding drums...');
        let dBuf; try { dBuf=await actx.decodeAudioData(dArr); } catch(e){setStatus('Drum decode failed: '+e.message);document.getElementById('analyzeBtn').disabled=false;return;}
        STATE.vBuf=vBuf; STATE.dBuf=dBuf;
        runFullAnalysis(vBuf, dBuf);
    } catch(err){setStatus('Error: '+err.message);}
    finally{document.getElementById('analyzeBtn').disabled=false;}
}

function runFullAnalysis(vBuf, dBuf) {
    setStatus('Drawing waveforms...');
    drawWaveStation(vBuf, dBuf);
    setStatus('Building sequencer...');
    buildSequencer(vBuf, dBuf);
    setStatus('Ready.');
    // The panels are hidden by default now, so we don't need to call this unless we want to show them
    // showPanels(); 
    estimateBPM(dBuf);
}

// ─── WAVE STATION ─────────────────────────────────────────────────────────────

function drawWaveStation(vBuf, dBuf) {
    const wc = document.getElementById('waveCanvas');
    const sc = document.getElementById('specCanvas');
    const W  = wc.parentElement.offsetWidth;
    const H  = 250; // Increased height
    wc.width=W; wc.height=H; sc.width=W; sc.height=H;

    const wctx = wc.getContext('2d');
    const sctx = sc.getContext('2d');

    wctx.clearRect(0,0,W,H);
    sctx.clearRect(0,0,W,H);

    // Adjusted colors and alphas for the new look
    drawWave(wctx, vBuf.getChannelData(0), W, H, CONFIG.COLOR.vocal, 0.8, H/2);
    drawWave(wctx, dBuf.getChannelData(0), W, H, CONFIG.COLOR.drum, 0.8, H/2);
    drawSpectrum(sctx, vBuf.getChannelData(0), vBuf.sampleRate, W, H, CONFIG.COLOR.vocal);
    drawSpectrum(sctx, dBuf.getChannelData(0), dBuf.sampleRate, W, H, CONFIG.COLOR.drum);
}

function drawWave(ctx, data, W, H, color, alpha, centerY) {
    const step=Math.max(1,Math.floor(data.length/W));
    const amp=H*0.4; // Adjusted amplitude
    ctx.strokeStyle=color; ctx.lineWidth=2; ctx.globalAlpha=alpha;
    ctx.beginPath();
    for(let x=0;x<W;x++){
        let mn=1,mx=-1;
        for(let j=0;j<step;j++){const s=data[x*step+j]||0;if(s<mn)mn=s;if(s>mx)mx=s;}
        if(x===0) ctx.moveTo(x, centerY+mn*amp);
        else ctx.lineTo(x, centerY+((mn+mx)/2)*amp);
    }
    ctx.stroke();
    ctx.globalAlpha=1;
}

function drawSpectrum(ctx, data, sr, W, H, color) {
    const slice=data.slice(0,CONFIG.FFT_SIZE);
    const fft=simpleFFT(slice);
    const barW=Math.ceil(W/fft.length*3);
    const maxMag=Math.max(...fft)||1;
    ctx.globalAlpha=0.8;
    fft.forEach((mag,i)=>{
        const x=(i/fft.length)*W;
        const barH=(mag/maxMag)*H;
        const grad=ctx.createLinearGradient(0,H,0,H-barH);
        grad.addColorStop(0,color+'cc');
        grad.addColorStop(1,color+'00');
        ctx.fillStyle=grad;
        ctx.fillRect(x,H-barH,barW,barH);
    });
    ctx.globalAlpha=1;
}

// ─── SEQUENCER ───────────────────────────────────────────────────────────────

function buildSequencer(vBuf, dBuf) {
    const steps=CONFIG.SEQ_STEPS;
    const dO=detectOnsets(dBuf.getChannelData(0));
    const dGrid=onsetsToGrid(dO, dBuf.sampleRate, dBuf.duration, steps);

    // Simple drum machine logic (can be improved)
    const kick  = dGrid.map((v,i)=>v&&(i%8===0||i%8===2));
    const snare = dGrid.map((v,i)=>v&&i%8===4);
    const hihat = dGrid.map((v,i)=>v&&(i%2===0)); // more frequent hi-hats
    const perc  = dGrid.map((v,i)=>v&&!kick[i]&&!snare[i]&&!hihat[i]);

    renderSeqRow('cells-kick',  kick,  'kick');
    renderSeqRow('cells-snare', snare, 'snare');
    renderSeqRow('cells-hihat', hihat, 'hihat');
    renderSeqRow('cells-perc',  perc,  'perc');
}

function onsetsToGrid(onsets, sr, dur, steps) {
    const grid=new Array(steps).fill(false);
    onsets.forEach(s=>{
        const idx=Math.min(steps-1,Math.floor(s/sr/dur*steps));
        grid[idx]=true;
    });
    return grid;
}

function renderSeqRow(elId, grid, type) {
    const el=document.getElementById(elId);
    el.innerHTML='';
    grid.forEach(active=>{
        const cell=document.createElement('div');
        cell.className='seq-cell'+(active?' active-'+type:'');
        el.appendChild(cell);
    });
}

function buildRuler() {
    const ruler=document.getElementById('seqRuler');
    ruler.innerHTML='';
    for(let i=0;i<CONFIG.SEQ_STEPS;i++){
        const m=document.createElement('div');
        m.className='ruler-mark';
        m.textContent=i%4===0?String(i/4+1):'';
        ruler.appendChild(m);
    }
}

function estimateBPM(buf) {
    const onsets=detectOnsets(buf.getChannelData(0));
    if(onsets.length<2){document.getElementById('bpmDisplay').textContent='-- BPM';return;}
    const diffs=[];
    for(let i=1;i<onsets.length;i++) diffs.push(onsets[i]-onsets[i-1]);
    const avgSamples=diffs.reduce((s,v)=>s+v,0)/diffs.length;
    const bpm=Math.round(60/(avgSamples/buf.sampleRate));
    document.getElementById('bpmDisplay').textContent=(bpm>40&&bpm<300?bpm:'--')+' BPM';
}

// Functions below this line are for the hidden panels and don't need changes for the new layout.
// They are kept for potential future use.

function simpleFFT(samples){
    const N=samples.length,mag=new Array(Math.floor(N/2)).fill(0);
    for(let k=0;k<mag.length;k++){
        let re=0,im=0;
        for(let n=0;n<N;n++){const a=(2*Math.PI*k*n)/N;re+=samples[n]*Math.cos(a);im-=samples[n]*Math.sin(a);}
        mag[k]=Math.sqrt(re*re+im*im)/N;
    }
    return mag;
}

function detectOnsets(samples){
    const W=CONFIG.ENERGY_WINDOW,out=[];let prev=0;
    for(let i=0;i<samples.length-W;i+=W){
        const c=samples.slice(i,i+W),e=c.reduce((s,v)=>s+v*v,0)/W;
        // A more sensitive onset detection
        if(e>prev*1.2&&e>0.0005)out.push(i);
        prev=e;
    }
    return out;
}
