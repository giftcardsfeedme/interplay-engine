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
    COLOR: { vocal:'#00d4ff', drum:'#ff6b35', green:'#2ed573', red:'#ff4757', amber:'#ffa502', grid:'#1e1e2e', tick:'#444455' },
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
    setStatus('Load stems or hit DEMO');
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

async function runDemo() {
    setStatus('Building demo...');
    const actx=getACtx(); const sr=44100; const dur=8; const n=sr*dur;
    const vData=new Float32Array(n).map((_,i)=>(Math.random()*2-1)*0.5*Math.sin(i/180));
    const dData=new Float32Array(n).map((_,i)=>(i%Math.floor(sr*0.5))<2200?(Math.random()*2-1)*0.9:(Math.random()*2-1)*0.04);
    const vBuf=actx.createBuffer(1,n,sr); vBuf.getChannelData(0).set(vData);
    const dBuf=actx.createBuffer(1,n,sr); dBuf.getChannelData(0).set(dData);
    STATE.vBuf=vBuf; STATE.dBuf=dBuf;
    runFullAnalysis(vBuf, dBuf);
}

function runFullAnalysis(vBuf, dBuf) {
    setStatus('Drawing waveforms...');
    drawWaveStation(vBuf, dBuf);
    setStatus('Building sequencer...');
    buildSequencer(vBuf, dBuf);
    setStatus('Forensics...');
    renderForensics(vBuf, dBuf);
    setStatus('Examination...');
    renderExamination(vBuf, dBuf);
    setStatus('Interplay...');
    renderInterplay(vBuf, dBuf);
    setStatus('Ready.');
    showPanels();
    estimateBPM(dBuf);
}

// ─── WAVE STATION ─────────────────────────────────────────────────────────────

function drawWaveStation(vBuf, dBuf) {
    const wc = document.getElementById('waveCanvas');
    const sc = document.getElementById('specCanvas');
    const W  = wc.parentElement.offsetWidth;
    const H  = 180;
    wc.width=W; wc.height=H; sc.width=W; sc.height=H;

    const wctx = wc.getContext('2d');
    const sctx = sc.getContext('2d');

    wctx.clearRect(0,0,W,H);
    sctx.clearRect(0,0,W,H);

    // grid lines
    wctx.strokeStyle='#ffffff08'; wctx.lineWidth=1;
    for(let y=0;y<H;y+=H/4){wctx.beginPath();wctx.moveTo(0,y);wctx.lineTo(W,y);wctx.stroke();}
    for(let x=0;x<W;x+=W/16){wctx.beginPath();wctx.moveTo(x,0);wctx.lineTo(x,H);wctx.stroke();}

    drawWave(wctx, vBuf.getChannelData(0), W, H, CONFIG.COLOR.vocal, 0.7, H*0.35);
    drawWave(wctx, dBuf.getChannelData(0), W, H, CONFIG.COLOR.drum,  0.5, H*0.65);
    drawSpectrum(sctx, vBuf.getChannelData(0), vBuf.sampleRate, W, H, CONFIG.COLOR.vocal);
    drawSpectrum(sctx, dBuf.getChannelData(0), dBuf.sampleRate, W, H, CONFIG.COLOR.drum);
}

function drawWave(ctx, data, W, H, color, alpha, centerY) {
    const step=Math.max(1,Math.floor(data.length/W));
    const amp=H*0.22;
    ctx.strokeStyle=color; ctx.lineWidth=1.5; ctx.globalAlpha=alpha;
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
    const barW=Math.ceil(W/fft.length*4);
    const maxMag=Math.max(...fft)||1;
    ctx.globalAlpha=0.9;
    fft.forEach((mag,i)=>{
        const x=(i/fft.length)*W;
        const barH=(mag/maxMag)*H*0.8;
        const grad=ctx.createLinearGradient(0,H,0,H-barH);
        grad.addColorStop(0,color+'ff');
        grad.addColorStop(1,color+'00');
        ctx.fillStyle=grad;
        ctx.fillRect(x,H-barH,barW,barH);
    });
    ctx.globalAlpha=1;
}

// ─── SEQUENCER ───────────────────────────────────────────────────────────────

function buildSequencer(vBuf, dBuf) {
    const steps=CONFIG.SEQ_STEPS;
    const vO=detectOnsets(vBuf.getChannelData(0));
    const dO=detectOnsets(dBuf.getChannelData(0));

    const vGrid=onsetsToGrid(vO, vBuf.sampleRate, vBuf.duration, steps);
    const dGrid=onsetsToGrid(dO, dBuf.sampleRate, dBuf.duration, steps);

    const kick  = dGrid.map((v,i)=>v&&i%4===0);
    const snare = dGrid.map((v,i)=>v&&i%4===2);
    const hihat = dGrid.map((v,i)=>v&&i%2===1);
    const perc  = dGrid.map((v,i)=>v&&!kick[i]&&!snare[i]&&!hihat[i]);

    renderSeqRow('cells-vocal', vGrid, 'vocal');
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
    for(let i=1;i<Math.min(onsets.length,20);i++) diffs.push(onsets[i]-onsets[i-1]);
    const avgSamples=diffs.reduce((s,v)=>s+v,0)/diffs.length;
    const bpm=Math.round(60/(avgSamples/buf.sampleRate));
    document.getElementById('bpmDisplay').textContent=(bpm>40&&bpm<300?bpm:'--')+' BPM';
}

// ─── FORENSICS ───────────────────────────────────────────────────────────────

function renderForensics(vBuf, dBuf) {
    renderStats('vocal-stats', vBuf);
    renderStats('drum-stats',  dBuf);
    renderMiniWave('vocalWaveform', vBuf, CONFIG.COLOR.vocal);
    renderMiniWave('drumWaveform',  dBuf, CONFIG.COLOR.drum);
}

function renderStats(elId, buf) {
    const ch=buf.getChannelData(0), sr=buf.sampleRate;
    const peak=ch.reduce((m,v)=>Math.max(m,Math.abs(v)),0);
    const rms=Math.sqrt(ch.reduce((s,v)=>s+v*v,0)/ch.length);
    const dc=ch.reduce((s,v)=>s+v,0)/ch.length;
    const rows=[
        ['Duration',     buf.duration.toFixed(3)+' s'],
        ['Sample Rate',  sr.toLocaleString()+' Hz'],
        ['Channels',     buf.numberOfChannels],
        ['Peak Amp',     peak.toFixed(4)],
        ['RMS Energy',   rms.toFixed(4)],
        ['Crest Factor', (rms>0?peak/rms:0).toFixed(2)],
        ['DC Offset',    dc.toFixed(5)],
           ['Freq Centroid',Math.round(computeCentroid(ch,sr))+' Hz'],
        ['Samples',      ch.length.toLocaleString()],
    ];
    document.getElementById(elId).innerHTML=rows.map(([k,v])=>
        `<div class="stat-row"><span class="stat-key">${k}</span><span class="stat-val">${v}</span></div>`
    ).join('');
}

function computeCentroid(samples, sr) {
    const fft=simpleFFT(samples.slice(0,CONFIG.FFT_SIZE)), fr=sr/CONFIG.FFT_SIZE;
    let num=0,den=0;
    fft.forEach((m,i)=>{num+=m*i*fr;den+=m;});
    return den>0?num/den:0;
}

function renderMiniWave(id, buf, color) {
    const c=document.getElementById(id), ctx2=c.getContext('2d');
    const data=buf.getChannelData(0);
    const W=c.parentElement.offsetWidth||300, H=c.height;
    c.width=W; ctx2.clearRect(0,0,W,H);
    ctx2.strokeStyle=color; ctx2.lineWidth=1; ctx2.globalAlpha=0.8;
    const step=Math.max(1,Math.floor(data.length/W));
    ctx2.beginPath();
    for(let x=0;x<W;x++){
        let mn=1,mx=-1;
        for(let j=0;j<step;j++){const s=data[x*step+j]||0;if(s<mn)mn=s;if(s>mx)mx=s;}
        ctx2.moveTo(x,(1+mn)*H/2); ctx2.lineTo(x,(1+mx)*H/2);
    }
    ctx2.stroke();
}

// ─── EXAMINATION ─────────────────────────────────────────────────────────────

function renderExamination(vBuf, dBuf) {
    const vE=computeEnergy(vBuf.getChannelData(0)), dE=computeEnergy(dBuf.getChannelData(0));
    const vB=computeBands(vBuf.getChannelData(0),vBuf.sampleRate);
    const dB=computeBands(dBuf.getChannelData(0),dBuf.sampleRate);
    renderLine('vocalEnergy',vE,'RMS',CONFIG.COLOR.vocal);
    renderLine('drumEnergy', dE,'RMS',CONFIG.COLOR.drum);
    renderBar('vocalBands',  vB,CONFIG.COLOR.vocal);
    renderBar('drumBands',   dB,CONFIG.COLOR.drum);
}

function computeEnergy(samples) {
    const W=CONFIG.ENERGY_WINDOW,out=[];
    for(let i=0;i<samples.length;i+=W){
        const c=samples.slice(i,i+W);
        out.push(parseFloat(Math.sqrt(c.reduce((s,v)=>s+v*v,0)/c.length).toFixed(4)));
    }
    return out;
}

function computeBands(samples, sr) {
    const fft=simpleFFT(samples.slice(0,CONFIG.FFT_SIZE)),fr=sr/CONFIG.FFT_SIZE,out={};
    for(const [n,[lo,hi]] of Object.entries(CONFIG.BAND_RANGES)){
        const s=fft.slice(Math.floor(lo/fr),Math.floor(hi/fr));
        out[n]=s.length?parseFloat((s.reduce((a,v)=>a+v,0)/s.length).toFixed(4)):0;
    }
    return out;
}

function renderLine(id,data,label,color){
    destroyChart(id);
    STATE.charts[id]=new Chart(document.getElementById(id).getContext('2d'),{
        type:'line',
        data:{labels:data.map((_,i)=>i),datasets:[{label,data,borderColor:color,backgroundColor:color+'22',borderWidth:1,pointRadius:0,fill:true,tension:0.3}]},
        options:cOpts('Frame','RMS'),
    });
}

function renderBar(id,bands,color){
    destroyChart(id);
    STATE.charts[id]=new Chart(document.getElementById(id).getContext('2d'),{
        type:'bar',
        data:{labels:Object.keys(bands).map(k=>k.toUpperCase()),datasets:[{label:'Energy',data:Object.values(bands),backgroundColor:color+'99',borderColor:color,borderWidth:1}]},
        options:cOpts('Band','Magnitude'),
    });
}

// ─── INTERPLAY ───────────────────────────────────────────────────────────────

function renderInterplay(vBuf, dBuf) {
    const vE=computeEnergy(vBuf.getChannelData(0)),dE=computeEnergy(dBuf.getChannelData(0));
    const vO=detectOnsets(vBuf.getChannelData(0)),dO=detectOnsets(dBuf.getChannelData(0));
    const matrix=buildMatrix(vO,dO,vBuf.sampleRate);
    const sync=buildSync(vO,dO,vBuf.sampleRate,vBuf.duration);
    const avg=matrix.length?matrix.reduce((s,m)=>s+Math.abs(m.latency),0)/matrix.length:0;
    const lock=matrix.length?matrix.filter(m=>Math.abs(m.latency)<CONFIG.LATENCY_THRESHOLD_MS).length/matrix.length*100:0;
    const corr=pearson(vE,dE);

    const sc=v=>v>=70?'#2ed573':v>=40?'#ffa502':'#ff4757';
    document.getElementById('syncScore').textContent='SYNC '+lock.toFixed(1)+'%';
    document.getElementById('syncScore').style.color=sc(lock);
    document.getElementById('latencyScore').textContent='LAT '+avg.toFixed(1)+'ms';
    document.getElementById('latencyScore').style.color=avg<20?'#2ed573':avg<50?'#ffa502':'#ff4757';
    document.getElementById('corrScore').textContent='CORR '+corr;
    document.getElementById('corrScore').style.color=sc((corr+1)/2*100);

    renderScatter('interplayChart',matrix);
    renderDual('energyOverlap',vE,dE);
    renderSync('onsetSync',sync);
}

function detectOnsets(samples){
    const W=CONFIG.ENERGY_WINDOW,out=[];let prev=0;
    for(let i=0;i<samples.length-W;i+=W){
        const c=samples.slice(i,i+W),e=c.reduce((s,v)=>s+v*v,0)/W;
        if(e>prev*1.5&&e>0.001)out.push(i);
        prev=e;
    }
    return out;
}

function buildMatrix(vO,dO,sr){
    const out=[];
    for(let i=0;i<Math.max(vO.length,dO.length);i++){
        if(vO[i]!==undefined&&dO[i]!==undefined)
            out.push({time:parseFloat((vO[i]/sr).toFixed(3)),latency:parseFloat(((vO[i]-dO[i])/sr*1000).toFixed(2))});
    }
    return out;
}

function buildSync(vO,dO,sr,dur){
    const res=100,tl=Array.from({length:res},(_,i)=>({t:parseFloat((i/res*dur).toFixed(2)),vocal:0,drum:0}));
    vO.forEach(s=>{const i=Math.min(res-1,Math.floor(s/sr/dur*res));tl[i].vocal=1;});
    dO.forEach(s=>{const i=Math.min(res-1,Math.floor(s/sr/dur*res));tl[i].drum=1;});
    return tl;
}

function pearson(a,b){
    const n=Math.min(a.length,b.length),aS=a.slice(0,n),bS=b.slice(0,n);
    const am=aS.reduce((s,v)=>s+v,0)/n,bm=bS.reduce((s,v)=>s+v,0)/n;
    let num=0,ad=0,bd=0;
    for(let i=0;i<n;i++){const da=aS[i]-am,db=bS[i]-bm;num+=da*db;ad+=da*da;bd+=db*db;}
    return ad&&bd?parseFloat((num/Math.sqrt(ad*bd)).toFixed(3)):0;
}

function renderScatter(id,matrix){
    destroyChart(id);
    STATE.charts[id]=new Chart(document.getElementById(id).getContext('2d'),{
        type:'scatter',
        data:{datasets:[{label:'Latency (ms)',data:matrix.map(m=>({x:m.time,y:m.latency})),
        backgroundColor:matrix.map(m=>Math.abs(m.latency)<CONFIG.LATENCY_THRESHOLD_MS?CONFIG.COLOR.green:CONFIG.COLOR.red),pointRadius:4}]},
        options:cOpts('Timestamp (s)','Latency (ms)'),
    });
}

function renderDual(id,vE,dE){
    destroyChart(id);
    const n=Math.min(vE.length,dE.length);
    STATE.charts[id]=new Chart(document.getElementById(id).getContext('2d'),{
        type:'line',
        data:{labels:Array.from({length:n},(_,i)=>i),datasets:[
            {label:'Vocal',data:vE.slice(0,n),borderColor:CONFIG.COLOR.vocal,backgroundColor:CONFIG.COLOR.vocal+'22',borderWidth:1,pointRadius:0,fill:true,tension:0.3},
            {label:'Drum', data:dE.slice(0,n),borderColor:CONFIG.COLOR.drum, backgroundColor:CONFIG.COLOR.drum+'22', borderWidth:1,pointRadius:0,fill:true,tension:0.3},
        ]},options:cOpts('Frame','RMS'),
    });
}

function renderSync(id,sync){
    destroyChart(id);
    STATE.charts[id]=new Chart(document.getElementById(id).getContext('2d'),{
        type:'bar',
        data:{labels:sync.map(s=>s.t.toFixed(1)),datasets:[
            {label:'Vocal',data:sync.map(s=>s.vocal),backgroundColor:CONFIG.COLOR.vocal+'cc'},
            {label:'Drum', data:sync.map(s=>s.drum), backgroundColor:CONFIG.COLOR.drum+'cc'},
        ]},
        options:{responsive:true,animation:{duration:300},
            plugins:{legend:{labels:{color:'#444455',font:{family:'Courier New',size:10}}}},
            scales:{
                x:{title:{display:true,text:'Time (s)',color:'#444455'},ticks:{color:'#444455',font:{family:'Courier New',size:9},maxTicksLimit:8},grid:{color:'#1e1e2e'}},
                y:{title:{display:true,text:'Onset',color:'#444455'},ticks:{color:'#444455',font:{family:'Courier New',size:9}},grid:{color:'#1e1e2e'},max:1.2},
            }},
    });
}

// ─── UTILITIES ───────────────────────────────────────────────────────────────

function cOpts(xL,yL){
    return{responsive:true,animation:{duration:300},
        plugins:{legend:{labels:{color:'#444455',font:{family:'Courier New',size:10}}}},
        scales:{
            x:{title:{display:true,text:xL,color:'#444455'},ticks:{color:'#444455',font:{family:'Courier New',size:9},maxTicksLimit:8},grid:{color:'#1e1e2e'}},
            y:{title:{display:true,text:yL,color:'#444455'},ticks:{color:'#444455',font:{family:'Courier New',size:9}},grid:{color:'#1e1e2e'}},
        }};
}

function simpleFFT(samples){
    const N=samples.length,mag=new Array(Math.floor(N/2)).fill(0);
    for(let k=0;k<mag.length;k++){
        let re=0,im=0;
        for(let n=0;n<N;n++){const a=(2*Math.PI*k*n)/N;re+=samples[n]*Math.cos(a);im-=samples[n]*Math.sin(a);}
        mag[k]=Math.sqrt(re*re+im*im)/N;
    }
    return mag;
}
