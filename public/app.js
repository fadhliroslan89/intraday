import {tradePlan} from './trade-math.js';
import {buildSignalCenter,netTargetGrossPct} from './signal-center-model.js';
const $=id=>document.getElementById(id);
const q=(s,root=document)=>root.querySelector(s);
const qa=(s,root=document)=>[...root.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeNum=v=>Number.isFinite(Number(v))?Number(v):0;
const dollars=v=>Number(v).toLocaleString('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2});
const compact=v=>{const n=safeNum(v);return n>=1e9?'$'+(n/1e9).toFixed(2)+'B':n>=1e6?'$'+(n/1e6).toFixed(1)+'M':n>=1000?'$'+(n/1000).toFixed(0)+'K':'$'+n.toFixed(0)};
const price=v=>{const n=safeNum(v);return n>=1000?n.toLocaleString('en-US',{maximumFractionDigits:2}):n>=1?n.toLocaleString('en-US',{maximumFractionDigits:4}):n>=0.01?n.toFixed(5):n>0?n.toPrecision(5):'—'};
const pc=(v,plus=true)=>(plus&&safeNum(v)>0?'+':'')+safeNum(v).toFixed(2)+'%';
const color=v=>safeNum(v)>=0?'positive':'negative';
const time=v=>v?new Date(v).toLocaleString('ms-MY',{timeZone:'Asia/Kuala_Lumpur',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false}):'—';
const stamp=()=>new Date().toISOString();
const STORE='dailyRadarPrefsV1',JOURNAL='dailyRadarJournalV1';
function load(key,fallback){try{const v=JSON.parse(localStorage.getItem(key));return v??fallback;}catch{return fallback;}}
function persist(key,v){try{localStorage.setItem(key,JSON.stringify(v));return true;}catch{toast('Browser tidak benarkan simpan rekod tempatan.');return false;}}
const stored=load(STORE,{});
const prefs={score:'60',volume:'5000000',range:'5',status:'ALL',sort:'score',favorites:[],...stored};
let trades=load(JOURNAL,[]);
if(!Array.isArray(trades))trades=[];
trades=trades.filter(x=>x&&typeof x.symbol==='string'&&/^[A-Z0-9]+-USDT$/.test(x.symbol));
let latest=null,lastDataAt=0,busy=false,seenSignals=new Set(),hasBaseline=false,selectedCoin=null,toastTimer=0;
let nearFilter='ALL',breakoutFilter='OPPORTUNITY',timingFilter='WATCH';
let centerFilter='ALL',centerSelected=null;
const filters={score:$('filterScore'),volume:$('filterVolume'),range:$('filterRange'),sort:$('sortBy')};
for(const [k,el] of Object.entries(filters))if([...el.options].some(x=>x.value===String(prefs[k])))el.value=String(prefs[k]);
const safeSymbol=s=>/^[A-Z0-9]+-USDT$/.test(s||'')?s:'';
const ticker=s=>latest?.marketTickers?.find(t=>t.symbol===s);
const coin=s=>latest?.coins?.find(t=>t.symbol===s);
function toast(msg){const el=$('toast');el.textContent=msg;el.classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.add('hidden'),3100);}
function show(view){qa('.view').forEach(x=>x.classList.toggle('hidden',x.id!==`view-${view}`));qa('.nav-tab').forEach(x=>x.classList.toggle('active',x.dataset.view===view));window.scrollTo({top:0,behavior:'smooth'});if(view==='journal')renderJournal();}
qa('.nav-tab').forEach(b=>b.addEventListener('click',()=>show(b.dataset.view)));
function graph(values,width=360,height=135){
  if(!Array.isArray(values)||values.length<2)return `<div class="muted" style="text-align:center;padding-top:45px">Carta candle belum tersedia</div>`;
  const vals=values.map(safeNum),lo=Math.min(...vals),hi=Math.max(...vals),spread=hi-lo||hi*.01||1;
  const points=vals.map((v,i)=>`${(i/(vals.length-1)*width).toFixed(1)},${(height-8-(v-lo)/spread*(height-22)).toFixed(1)}`);
  const upward=vals.at(-1)>=vals[0];const stroke=upward?'#54e8b5':'#f48693';
  const id='fill'+Math.abs(Math.trunc(vals[0]*1e6));
  const poly=points.join(' '),last=points.at(-1).split(',');
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Trend 35 candle 15 minit" preserveAspectRatio="none"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${stroke}" stop-opacity=".25"/><stop offset="1" stop-color="${stroke}" stop-opacity=".01"/></linearGradient></defs><polygon points="0,${height} ${poly} ${width},${height}" fill="url(#${id})"/><polyline points="${poly}" fill="none" stroke="${stroke}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${last[0]}" cy="${last[1]}" r="4" fill="${stroke}"/></svg>`;
}
const badge=c=>`<span class="status-tag tag-${c==='BUY'?'BUY':c==='WATCH'?'WATCH':'WAIT'}">${c==='BUY'?'● ':c==='WATCH'?'◉ ':'○ '}${esc(c)}</span>`;
const isFav=s=>prefs.favorites.includes(s);
function filterCoins(){
  if(!latest)return [];
  const s=$('searchInput').value.trim().toUpperCase();
  const result=latest.coins.filter(c=>{
    if(prefs.status==='STAR'&&!isFav(c.symbol))return false;
    if(prefs.status==='BUY'&&c.status!=='BUY')return false;
    if(prefs.status==='WATCH'&&c.status!=='WATCH')return false;
    if(s&&!c.symbol.includes(s))return false;
    if(c.score<Number(filters.score.value))return false;
    if(c.volume24<Number(filters.volume.value)||c.range24<Number(filters.range.value))return false;
    return true;
  });
  const sort=filters.sort.value;
  return result.sort((a,b)=>(safeNum(b[sort])-safeNum(a[sort]))||b.score-a.score);
}
function renderCoinRow(c){
  return `<tr><td><div class="symbol-cell"><button class="coin-star ${isFav(c.symbol)?'saved':''}" data-star="${esc(c.symbol)}" aria-label="Favorite ${esc(c.symbol)}">${isFav(c.symbol)?'★':'☆'}</button><span class="coin-icon">${esc(c.symbol.split('-')[0].slice(0,2))}</span><div><div class="coin-name">${esc(c.symbol.split('-')[0])}</div><div class="coin-pair">/ USDT</div></div></div></td><td><strong>$${price(c.price)}</strong></td><td class="${color(c.change24)}">${pc(c.change24)}</td><td>${compact(c.volume24)}</td><td>${c.rvol?safeNum(c.rvol).toFixed(2)+'x':'—'}</td><td>${c.rsi?safeNum(c.rsi).toFixed(1):'—'}</td><td><div class="score-cell"><b>${c.score||0}</b><span class="score-bar"><i style="width:${c.score||0}%"></i></span></div></td><td>${badge(c.status)}${c.smartTiming?.stage==='FALSE BREAKOUT'?'<div class="mini-warning">⛔ FALSE BREAKOUT</div>':c.breakoutRadar?.risk?.level==='OVEREXTENDED'?'<div class="mini-warning">⛔ FOMO</div>':c.breakoutRadar?.risk?.level==='CAUTION'?'<div class="mini-warning">⚠ Caution</div>':''}</td><td><button class="row-action" data-open="${esc(c.symbol)}" aria-label="Butiran ${esc(c.symbol)}">↗</button></td></tr>`;
}
function renderMobileRow(c){return `<div class="mobile-coin"><div class="mobile-row mobile-top"><div class="mobile-label"><button class="coin-star ${isFav(c.symbol)?'saved':''}" data-star="${esc(c.symbol)}">${isFav(c.symbol)?'★':'☆'}</button><span class="coin-icon">${esc(c.symbol.split('-')[0].slice(0,2))}</span><div><div class="mobile-symbol">${esc(c.symbol)}</div><div class="mobile-price">$${price(c.price)}</div></div></div>${badge(c.status)}</div><div class="mobile-info"><div><small>24H MOVE</small><b class="${color(c.change24)}">${pc(c.change24)}</b></div><div><small>VOLUME</small><b>${compact(c.volume24)}</b></div><div><small>RVOL</small><b>${c.rvol?safeNum(c.rvol).toFixed(2)+'x':'—'}</b></div><div><small>SCORE</small><b class="up">${c.score||0}/100</b></div></div><div class="mobile-row mobile-bottom"><span class="muted">Range ${pc(c.range24,false)} · RSI ${c.rsi||'—'}</span><button class="small-btn" data-open="${esc(c.symbol)}">Lihat Setup →</button></div></div>`;}
function render(){
  if(!latest)return;
  const s=latest.summary;
  $('kpiPairs').textContent=s.totalPairs||'—';$('kpiAnalyzed').textContent=s.analyzed||0;
  $('kpiBuy').textContent=s.buy||0;$('kpiWatch').textContent=s.watch||0;
  $('updatedAt').textContent=s.updated?'Data harga: '+time(s.updated)+' MYT':'Menunggu data...';
  $('coverageInfo').textContent=`· ${s.coverage||0} calon/pusingan`;const current=filterCoins();
  $('resultCount').textContent=current.length;
  $('coinsTable').innerHTML=current.length?current.map(renderCoinRow).join(''):'<tr><td colspan="9" class="table-loading">Tiada coin padan tapisan</td></tr>';
  $('coinMobileList').innerHTML=current.map(renderMobileRow).join('');
  $('emptyState').classList.toggle('hidden',current.length>0);
  const top=[...latest.coins].filter(c=>['BUY','WATCH'].includes(c.status)&&c.confirmed&&c.volume24>=1_000_000)
    .sort((a,b)=>(a.status==='BUY'?-1:0)-(b.status==='BUY'?-1:0)||b.score-a.score).slice(0,3);
  $('topPicks').innerHTML=top.length?top.map((c,i)=>`<button type="button" class="pick-card" data-open="${esc(c.symbol)}"><div class="pick-head"><span class="pick-rank">#0${i+1} · PRIORITY</span>${badge(c.status)}</div><div class="pick-symbol">${esc(c.symbol.split('-')[0])}<span class="muted"> / USDT</span></div><div class="pick-sub">$${price(c.price)}</div><div class="pick-stats"><div><small>24H CHANGE</small><strong class="${color(c.change24)}">${pc(c.change24)}</strong></div><div><small>REL. VOL</small><strong>${c.rvol||0}x</strong></div><div><small>RADAR SCORE</small><strong class="up">${c.score}/100</strong></div></div><div class="pick-footer"><span>${esc(c.setup||'Semak setup')}</span><span class="score-bubble">ANALYZE ↗</span></div></button>`).join(''):
    `<div class="pick-placeholder">${s.candleScanRunning?'Scan candle sedang berjalan...':'Belum ada setup teknikal mencukupi. Semak senarai di bawah.'}</div>`;
  renderSignalCenter();
  renderNear();
  renderBreakout();
  renderTiming();
  renderPerformance();
  const isOnline=latest.ok&&!s.dataStale;
  $('connectionPill').classList.toggle('offline',!isOnline);
  $('connectionLabel').textContent=isOnline?'LIVE DATA':'DATA OFFLINE';
  $('globalError').textContent=latest.error||(!isOnline?'Data lama/tidak tersedia. Jangan gunakan signal sehingga sambungan pulih.':'');
  $('globalError').classList.toggle('hidden',!$('globalError').textContent);
  $('journalBadge').textContent=trades.filter(t=>t.status==='OPEN').length;
  if(!q('#view-journal.hidden'))renderJournal();
}
function renderSignalCenter(){
  if(!latest)return;
  const model=buildSignalCenter(latest);
  const filter=centerFilter;
  const search=$('centerSearch').value.trim().toUpperCase();
  const pool=filter==='READY'?model.ready:filter==='WAIT'?model.waiting:filter==='AVOID'?model.avoided:model.active;
  const matching=pool.filter(x=>x.symbol.includes(search));
  const entries=matching.slice(0,12);
  if(!entries.some(x=>x.symbol===centerSelected))centerSelected=entries[0]?.symbol||null;
  const primary=model.offline?'OFFLINE':model.ready.length?'READY DIKESAN':model.waiting.length?'TUNGGU SETUP':'TIADA SETUP';
  $('centerLive').textContent=`${primary} · Data ${time(latest.summary?.updated)} MYT`;
  $('centerCoverage').textContent=`${model.analyzed} coin dengan candle sah`;
  $('centerCounters').innerHTML=`<div class="center-count c-ready"><small>READY · BUY SAH</small><b>${model.ready.length}</b></div>
    <div class="center-count c-wait"><small>WAIT · PANTAU</small><b>${model.waiting.length}</b></div>
    <div class="center-count c-avoid"><small>AVOID · DITAPIS</small><b>${model.avoided.length}</b></div>
    <div class="center-count c-data"><small>CAKUPAN CARTA</small><b>${model.analyzed}<span> / ${latest.summary?.totalPairs||0}</span></b></div>`;
  $('centerCoinList').innerHTML=entries.length?entries.map((r,i)=>{
    const c=r.coin;
    return `<button type="button" class="center-coin ${r.symbol===centerSelected?'active':''}" data-center-select="${esc(r.symbol)}" aria-pressed="${r.symbol===centerSelected}">
       <div class="center-coin-symbol"><b>${esc(r.symbol.replace('-USDT',''))}<small>/USDT</small></b><span class="center-state ${r.label.toLowerCase()}">${r.label}</span></div>
       <div class="center-coin-info"><span>$${price(c.price)}</span><span class="${color(c.change24)}">${pc(c.change24)} 24H</span></div>
       <div class="center-coin-metrics"><span>Score <b>${safeNum(c.score)}/100</b></span><span>RVOL <b>${safeNum(c.rvol).toFixed(2)}x</b></span><span>ADX <b>${safeNum(c.adx).toFixed(1)}</b></span></div>
     </button>`;
  }).join(''):
    `<div class="center-empty">${model.offline?'Data pasaran belum segar. Tiada status READY boleh dipercayai.':filter==='ALL'?'Tiada READY atau WAIT berkualiti sekarang. Jangan paksa entry; semak AVOID untuk audit.':'Tiada coin dalam kategori ini buat masa ini.'}</div>`;
  const selected=entries.find(x=>x.symbol===centerSelected);
  if(!selected){$('centerDetail').innerHTML=`<div class="center-detail-empty"><div class="center-big-symbol">${model.offline?'DATA OFFLINE':'TIADA ENTRY'}</div><p>${model.offline?'Tunggu sambungan KuCoin dan analisis candle pulih.':'Belum ada setup yang layak dalam penapis ini. Kekalkan disiplin dan jangan paksa trade.'}</p></div>`;}
  else{
    const r=selected,c=r.coin,t=c.smartTiming||{},risk=c.breakoutRadar?.risk||{},isReady=r.label==='READY';
    const candleClose=positiveOrNull(c.lastCandle)?time(c.lastCandle+900000)+' MYT':'—';
    const zoneLow=isReady?c.entryZoneLow:t.entryZoneLow;
    const zoneHigh=isReady?c.entryZoneHigh:t.entryZoneHigh;
    const validZone=Number.isFinite(zoneLow)&&zoneLow>0&&Number.isFinite(zoneHigh)&&zoneHigh>=zoneLow;
    const costs=latest.signalPerformance?.costs||{};
    const gross5=Number.isFinite(costs.requiredGross5)?costs.requiredGross5:netTargetGrossPct(5);
    const gross6=Number.isFinite(costs.requiredGross6)?costs.requiredGross6:netTargetGrossPct(6);
    const tp5=isReady?c.price*(1+gross5/100):null,tp6=isReady?c.price*(1+gross6/100):null;
    const sl=isReady?c.price*.98:null;
    const reasons=[...r.why];
    if(!isReady)for(const reason of t.riskReasons||[])if(reasons.length<4&&!reasons.includes(reason))reasons.push(reason);
    const statusTitle=isReady?'BUY rasmi disahkan — semak risiko sebelum buat keputusan':r.label==='WAIT'?'Tunggu pengesahan — BELUM BUY':'Tidak sesuai untuk entry berdasarkan penapis sekarang';
    $('centerDetail').innerHTML=`<div class="center-detail-head"><div><span class="center-detail-eyebrow">TRADE DECISION · SPOT</span><h2>${esc(r.symbol)}</h2><div class="center-live-price">$${price(c.price)} <span class="${color(c.change24)}">${pc(c.change24)} / 24H</span></div></div><span class="center-state large ${r.label.toLowerCase()}">${r.label}</span></div>
    <div class="center-guidance ${r.label.toLowerCase()}"><strong>${esc(statusTitle)}</strong><small>${isReady?'Status berdasarkan BUY rasmi, candle disahkan dan harga dalam zon. Bukan order automatik.':r.label==='WAIT'?'Jangan entry selagi belum ada BUY rasmi dan zon live sesuai.':'Jangan gunakan coin ini sebagai entry semasa.'}</small></div>
    <div class="center-stats"><div><small>RADAR SCORE</small><b>${safeNum(c.score)}/100</b></div><div><small>REL. VOLUME</small><b>${safeNum(c.rvol).toFixed(2)}x</b></div><div><small>ADX / RSI</small><b>${safeNum(c.adx).toFixed(1)} / ${safeNum(c.rsi).toFixed(1)}</b></div><div><small>TIMING</small><b class="timing-string">${esc(t.stage||'—')}</b></div></div>
    <div class="center-entry-grid"><div class="center-entry-zone"><small>${isReady?'ZON ANTI-CHASE (RUJUKAN SIGNAL)':'ZON ATR (PEMANTAUAN SAHAJA)'}</small><strong>${validZone?'$'+price(zoneLow)+' – $'+price(zoneHigh):'Belum tersedia'}</strong><span>${isReady?'Live di zon: YA':`Live di zon ATR: ${t.withinZone?'YA':'TIDAK / TIADA'}`}</span></div>
    <div class="center-entry-zone"><small>CANDLE 15M DISAHKAN</small><strong>${candleClose}</strong><span>Timing risk: ${esc(t.risk||'—')} · Trend 1H: ${c.trend1h?'SEARAH':'BELUM'}</span></div></div>
    <div class="center-targets"><div><small>TP1 · +5% NET*</small><strong class="up">${isReady?'$'+price(tp5):'—'}</strong></div><div><small>TP2 · +6% NET*</small><strong class="up">${isReady?'$'+price(tp6):'—'}</strong></div><div><small>SL · −2% KASAR*</small><strong class="down">${isReady?'$'+price(sl):'—'}</strong></div></div>
    <div class="center-explain"><strong>${isReady?'KENAPA READY':'KENAPA BELUM READY / ELAK'}</strong><ul>${reasons.slice(0,4).map(t=>`<li>${esc(t)}</li>`).join('')}</ul></div>
    <div class="center-actions"><button type="button" data-open="${esc(r.symbol)}" class="center-primary">Semak 13 syarat &amp; carta ↗</button><a class="center-secondary" href="https://www.tradingview.com/chart/?symbol=KUCOIN%3A${encodeURIComponent(r.symbol.replace('-',''))}" target="_blank" rel="noopener noreferrer">TradingView ↗</a></div>
    <p class="center-target-foot">*TP/SL ialah simulasi daripada harga LIVE ketika READY, bukan harga fill. Anggaran fee 0.10% + slippage 0.10% setiap sisi; SL kasar −2%. Semak spread, struktur harga dan risiko sendiri.</p>`;
  }
  const tg=latest.telegram||{};
  $('telegramPanel').classList.toggle('tg-active',!!tg.enabled);
  $('telegramState').textContent=tg.enabled?'TELEGRAM · AKTIF':tg.configured?'TELEGRAM · BELUM AKTIF':'TELEGRAM · PERLU SETUP';
  $('telegramInfo').textContent=tg.enabled?`Bot dipasangkan · ${tg.sent||0} alert dihantar · FINAL READY sahaja`:
    tg.state==='WAITING PAIRING'?'Token diset. Hantar /start KOD_PAIRING kepada bot sendiri.':
    tg.state==='DATABASE REQUIRED'?'Database diperlukan untuk elakkan alert berulang.':
    'Set TELEGRAM_BOT_TOKEN dan TELEGRAM_PAIR_CODE dalam Render Environment.';
  const perf=latest.signalPerformance||{},storage=perf.storage||{},rate=perf.tp5Net?.rate;
  $('centerTrack').innerHTML=`<span>◉ PRESTASI SIGNAL</span><b>${perf.total||0} signal direkod</b><span>Win rate TP5 net: <strong>${Number.isFinite(rate)?rate.toFixed(1)+'%':'Belum cukup data'}</strong></span><span>${storage.persistent?'✓ Database connected':'⚠ Memory only'}</span>`;
}
const positiveOrNull=v=>Number.isFinite(v)&&v>0;
qa('[data-center-filter]').forEach(b=>b.addEventListener('click',()=>{
  centerFilter=b.dataset.centerFilter;
  qa('[data-center-filter]').forEach(x=>x.classList.toggle('chosen',x.dataset.centerFilter===centerFilter));
  centerSelected=null;renderSignalCenter();
}));
$('centerSearch').addEventListener('input',()=>{centerSelected=null;renderSignalCenter();});
$('centerCoinList').addEventListener('click',e=>{
  const el=e.target.closest('[data-center-select]');if(!el)return;
  centerSelected=el.dataset.centerSelect;renderSignalCenter();
});
$('centerRefresh').addEventListener('click',()=>{loadDashboard(true);toast('Memuat data live...');});

function renderReadinessCard(c, i){
  const r=c.readiness||{},near=r.level==='NEAR BUY',early=r.level==='EARLY';
  const kind=near?'NEAR BUY':early?'EARLY MOMENTUM':'MONITOR SAHAJA';
  const risk=c.breakoutRadar?.risk;
  const riskChip=risk?.level==='CAUTION'?'<span class="risk-chip caution">⚠ HATI-HATI</span>':'';
  const labelColor=near?'near-label-green':early?'near-label-blue':'near-label-grey';
  const blockers=(r.pending||[]).slice(0,3).map(x=>`<li>${esc(x.detail||x.label)}</li>`).join('');
  const more=Math.max(0,(r.pending||[]).length-3);
  const gap=Number.isFinite(r.breakoutGapPct)?(r.breakoutGapPct>0?`Lagi ${pc(r.breakoutGapPct,false)} ke paras breakout`:'Breakout sudah lepasi paras rujukan'):'Jarak breakout tidak tersedia';
  return `<button type="button" class="near-card" data-open="${esc(c.symbol)}" aria-label="Analisis ${esc(c.symbol)}; ${kind}">
    <div class="near-card-head"><span class="near-kind ${labelColor}">${esc(kind)}</span><span class="near-readiness">${r.met||0}/${r.total||13} semakan ${riskChip}</span></div>
    <div class="near-card-top"><div><h3>${esc(c.symbol.split('-')[0])}<span> / USDT</span></h3><p>$${price(c.price)}</p></div><span class="near-score">${c.score||0}<small>/100</small></span></div>
    <div class="near-progress" role="img" aria-label="${r.met||0} daripada ${r.total||13} kriteria lulus"><span style="width:${Math.max(0,Math.min(100,Number(r.percent)||0))}%"></span></div>
    <div class="near-card-metrics"><div><small>REL. VOL</small><strong>${safeNum(c.rvol).toFixed(2)}x</strong></div><div><small>ADX</small><strong>${safeNum(c.adx).toFixed(1)}</strong></div><div><small>24H</small><strong class="${color(c.change24)}">${pc(c.change24)}</strong></div></div>
    <div class="near-gap">${esc(gap)}</div>
    <div class="near-blockers"><div>SYARAT BELUM LULUS</div><ul>${blockers||'<li>Tiada halangan direkodkan</li>'}</ul>${more?`<span class="near-more">+${more} lagi · buka analisis penuh</span>`:''}</div>
    <div class="near-open">Lihat semua semakan <span>↗</span></div>
  </button>`;
}
function renderNear(){
  if(!latest)return;
  if(!latest.ok||latest.summary?.dataStale){
    $('nearCards').innerHTML='<div class="pick-placeholder">Data pasaran offline atau sudah lapuk. Calon momentum tidak dipaparkan sehingga data pulih.</div>';
    $('nearCounter').textContent='Menunggu data yang segar';
    $('nearTime').textContent='Data belum tersedia';
    return;
  }
  const n=latest.nearBuy||[],e=latest.earlyMomentum||[],m=latest.monitorOnly||[];
  $('nearCounter').innerHTML=`<span class="near-stat">NEAR BUY <b>${latest.summary?.nearCount??n.length}</b></span><span class="near-stat">EARLY MOMENTUM <b>${latest.summary?.earlyCount??e.length}</b></span><span class="near-stat">Calon dianalisis <b>${latest.summary?.analyzed||0}</b></span>`;
  $('nearTime').textContent=latest.summary?.analyzedAt?'Scan teknikal: '+time(latest.summary.analyzedAt)+' MYT':'Menunggu scan';
  const mixed=[...n.slice(0,4),...e.slice(0,4)];
  const mixedSet=new Set(mixed.map(c=>c.symbol));
  mixed.push(...[...n,...e].filter(c=>!mixedSet.has(c.symbol)).slice(0,8-mixed.length));
  let shown=nearFilter==='NEAR BUY'?n:nearFilter==='EARLY'?e:mixed;
  const fallback=nearFilter==='ALL'&&shown.length===0;
  if(fallback)shown=m;
  $('nearCards').innerHTML=shown.length?shown.slice(0,8).map(renderReadinessCard).join(''):
    `<div class="pick-placeholder">${latest.summary?.candleScanRunning?'Scan sedang berjalan...':nearFilter==='ALL'?'Tiada calon segar. Semak sambungan dan data candle.':`Tiada ${nearFilter==='NEAR BUY'?'NEAR BUY':'EARLY MOMENTUM'} sekarang. Ini normal apabila syarat belum cukup.`}</div>`;
  if(fallback&&m.length){
    $('nearCards').insertAdjacentHTML('afterbegin','<div class="near-explainer">Belum ada NEAR BUY atau EARLY MOMENTUM. Berikut ialah calon <b>MONITOR SAHAJA</b> yang paling hampir — bukan signal entry.</div>');
  }
}
// V1.3 early radar quality ranking. Risk exclusions never become BUY.
function renderBreakoutCard(c){
  const b=c.breakoutRadar||{},risk=b.risk||{},isRisk=b.stage==='OVEREXTENDED';
  const kind=isRisk?'⛔ OVEREXTENDED':b.stage==='EARLY BREAKOUT'?'◈ EARLY BREAKOUT':'◌ BUILDING';
  const details=(isRisk?(risk.flags||[]):(b.why||[])).slice(0,3).map(s=>`<li>${esc(s)}</li>`).join('');
  const desc=isRisk?'DISINGKIRKAN DARIPADA CALON ENTRY':'BELUM DISAHKAN BUY · PEMANTAUAN SAHAJA';
  return `<button type="button" class="breakout-card ${isRisk?'blocked':''}" data-open="${esc(c.symbol)}" aria-label="Butiran ${esc(c.symbol)}; ${esc(kind)}">
    <div class="breakout-card-top"><span class="breakout-tag ${isRisk?'danger':b.stage==='EARLY BREAKOUT'?'ready':'building'}">${esc(kind)}</span><span class="risk-chip ${risk.level==='CAUTION'?'caution':'neutral'}">${esc(risk.level==='CAUTION'?'⚠ CAUTION':risk.level==='OVEREXTENDED'?'BLOCKED':'CHECKLIST')}</span></div>
    <div class="breakout-title-row"><div><h3>${esc(c.symbol.split('-')[0])}<span> / USDT</span></h3><small>$${price(c.price)}</small></div><div class="breakout-quality"><strong>${Number(b.quality)||0}<small>/100</small></strong><span>QUALITY RANK</span></div></div>
    <div class="breakout-metrics"><div><small>24H CHANGE</small><b class="${color(c.change24)}">${pc(c.change24)}</b></div><div><small>RVOL</small><b>${safeNum(c.rvol).toFixed(2)}x</b></div><div><small>VOL ACCEL.</small><b>${Number.isFinite(b.acceleration)?Number(b.acceleration).toFixed(2)+'x':'—'}</b></div><div><small>BREAKOUT GAP</small><b>${Number.isFinite(b.gapPct)?pc(b.gapPct,false):'—'}</b></div></div>
    <div class="breakout-divider"></div><div class="breakout-description ${isRisk?'red':''}">${esc(desc)}</div>
    <ul class="breakout-reasons">${details||'<li>Tiada bacaan tambahan.</li>'}</ul>
    <div class="near-open">${isRisk?'Lihat amaran risiko':'Semak setup & 13 syarat'} <span>↗</span></div>
  </button>`;
}
function renderBreakout(){
  if(!latest)return;
  const panel=$('breakoutCards'),count=$('breakoutCounters'),t=$('breakoutTime');
  if(!latest.ok||latest.summary?.dataStale){
    count.innerHTML='';panel.innerHTML='<div class="pick-placeholder">Data pasaran offline / lapuk. Calon tidak akan ditunjukkan.</div>';
    t.textContent='Data tidak segar';return;
  }
  const s=latest.summary||{},good=latest.breakoutCandidates||[],bad=latest.overextendedCandidates||[];
  count.innerHTML=`<span class="breakout-counter">◈ EARLY BREAKOUT <strong>${s.breakoutCount||0}</strong></span><span class="breakout-counter">◌ BUILDING <strong>${s.buildingCount||0}</strong></span><span class="breakout-counter red">⛔ OVEREXTENDED <strong>${s.overextendedCount||0}</strong></span>`;
  t.textContent=s.analyzedAt?'Candle dianalisis: '+time(s.analyzedAt)+' MYT':'Menunggu scan teknikal';
  const rows=breakoutFilter==='FOMO'?bad:good;
  panel.innerHTML=rows.length?rows.slice(0,8).map(renderBreakoutCard).join(''):
    `<div class="pick-placeholder">${s.candleScanRunning?'Scan candle sedang berjalan...':breakoutFilter==='FOMO'?'Tiada calon OVEREXTENDED dalam shortlist semasa.':'Belum ada calon EARLY BREAKOUT atau BUILDING. Syarat volume dan breakout belum cukup.'}</div>`;
}
qa('[data-breakout-filter]').forEach(b=>b.addEventListener('click',()=>{
  breakoutFilter=b.dataset.breakoutFilter;
  qa('[data-breakout-filter]').forEach(x=>x.classList.toggle('selected',x.dataset.breakoutFilter===breakoutFilter));
  renderBreakout();
}));

qa('[data-near-filter]').forEach(b=>b.addEventListener('click',()=>{
  nearFilter=b.dataset.nearFilter;
  qa('[data-near-filter]').forEach(x=>x.classList.toggle('selected',x.dataset.nearFilter===nearFilter));
  renderNear();
}));

// V1.4: Distinct from BUY. Only fresh, confirmed closed-candle interpretations.
function renderTimingCard(c){
  const t=c.smartTiming||{},trap=t.stage==='FALSE BREAKOUT',filtered=c.opportunity?.qualified===false;
  const stage=t.stage||'WAIT',risk=t.risk||'HIGH';
  const level=Number.isFinite(t.level)?'$'+price(t.level):'—';
  const zone=Number.isFinite(t.entryZoneLow)&&Number.isFinite(t.entryZoneHigh)
    ?`$${price(t.entryZoneLow)} – $${price(t.entryZoneHigh)}`:'Tiada (tunggu struktur baharu)';
  const notes=(filtered?(c.opportunity?.reasons||[]):(t.notes||[]).concat((t.riskReasons||[]).slice(0,2))).slice(0,4).map(x=>`<li>${esc(x)}</li>`).join('');
  return `<button class="timing-card ${trap?'timing-trap':''}" type="button" data-open="${esc(c.symbol)}" aria-label="Smart timing ${esc(c.symbol)}">
    <div class="timing-card-top"><span class="timing-stage ${trap?'trap':''}">${esc(stage)}</span><span class="timing-risk ${filtered?'high':risk==='HIGH'?'high':risk==='MEDIUM'?'medium':'low'}">${filtered?'TIDAK LULUS':`RISIKO ${esc(risk)}`}</span></div>
    <div class="timing-symbol"><strong>${esc(c.symbol.split('-')[0])}<small>/USDT</small></strong><span>$${price(c.price)}</span></div>
    <div class="timing-metrics"><div><small>SCORE ASAL</small><b>${c.score||0}/100</b></div><div><small>RVOL</small><b>${safeNum(c.rvol).toFixed(2)}x</b></div><div><small>ATR14</small><b>${Number.isFinite(t.atrPct)?pc(t.atrPct,false):'—'}</b></div><div><small>LIVE DALAM ZON</small><b>${t.withinZone?'YA':'TIDAK'}</b></div></div>
    <div class="timing-zone"><small>RESISTANCE RUJUKAN</small><b>${level}</b><small>ZON ATR (BUKAN ENTRY AUTOMATIK)</small><b>${zone}</b></div>
    <ul class="timing-reasons">${notes}</ul><div class="near-open">Lihat penjelasan penuh <span>↗</span></div>
  </button>`;
}
function renderTiming(){
  const cards=$('timingCards'),ct=$('timingCounters'),clock=$('timingTime');
  if(!latest?.ok||latest?.summary?.dataStale){cards.innerHTML='<div class="pick-placeholder">Data live lapuk / offline; signal timing disembunyikan.</div>';ct.textContent='';return;}
  const s=latest.summary||{},good=latest.timingCandidates||[],rejected=latest.timingRejected||[],bad=latest.timingWarnings||[];
  ct.innerHTML=`<span class="breakout-counter">✓ QUALIFIED <strong>${s.timingCount||0}</strong></span><span class="breakout-counter red">× DITAPIS <strong>${s.filteredCount||0}</strong></span><span class="breakout-counter red">⛔ FALSE BREAKOUT <strong>${s.falseBreakoutCount||0}</strong></span><span class="breakout-counter">STABLECOIN EXCLUDED <strong>${s.stablecoinExcluded||0}</strong></span>`;
  clock.textContent=s.analyzedAt?'Scan: '+time(s.analyzedAt)+' MYT':'Menunggu analisis';
  const selected=timingFilter==='TRAP'?bad:timingFilter==='REJECTED'?rejected:good;
  cards.innerHTML=selected.length?selected.map(renderTimingCard).join(''):`<div class="pick-placeholder">${s.candleScanRunning?'Sedang mengimbas candle...':timingFilter==='TRAP'?'Tiada breakout palsu dikesan.':timingFilter==='REJECTED'?'Tiada coin ditapis pada scan ini.':'Tiada calon berkualiti yang lulus penapis sekarang. Tiada keperluan untuk paksa entry.'}</div>`;
}
qa('[data-timing-filter]').forEach(b=>b.addEventListener('click',()=>{
  timingFilter=b.dataset.timingFilter;
  qa('[data-timing-filter]').forEach(x=>x.classList.toggle('selected',x.dataset.timingFilter===timingFilter));
  renderTiming();
}));
const outcomeLabel={PENDING:'BELUM CUKUP DATA',WIN:'TP TERSENTUH',LOSS:'SL TERSENTUH',AMBIGUOUS:'TIDAK PASTI',EXPIRED:'TIADA TP / SL 24H',INCOMPLETE:'DATA TERPUTUS'};
function renderPerformance(){
  const perf=latest?.signalPerformance||{},stats=$('performanceStats'),list=$('performanceList'),state=$('trackerStore');
  if(!latest?.ok||latest?.summary?.dataStale){stats.innerHTML='<div class="pick-placeholder">Data offline / lapuk. Tracker tidak boleh dikemas kini.</div>';list.innerHTML='';return;}
  const a=perf.tp5||{},b=perf.tp6||{},na=perf.tp5Net||{},nb=perf.tp6Net||{},storage=perf.storage||{};
  const persistent=storage.persistent===true,disconnected=storage.mode==='DISCONNECTED';
  state.innerHTML=`<span class="store-dot ${persistent?'on':'off'}"></span><strong>${persistent?'PERSISTENT · DATABASE CONNECTED':disconnected?'DB DISCONNECTED · HISTORY UNSAVED':'MEMORY ONLY · HISTORY NOT DURABLE'}</strong><span>${persistent?'Data sejarah disimpan dalam PostgreSQL.':disconnected?'Sambungan PostgreSQL gagal. Semak Render Logs.':'Sila set DATABASE_URL di Render → Environment untuk simpan merentas restart.'}</span>`;
  stats.innerHTML=`<div class="perf-stat"><small>BUY DICATAT ${persistent?'(DATABASE)':'(SEJAK RESTART)'}</small><strong>${perf.total||0}</strong></div>
    <div class="perf-stat"><small>TP +5% BERSIH* · WIN/LOSS</small><strong>${na.rate===null||na.rate===undefined?'—':na.rate.toFixed(1)+'%'}</strong><span>${na.win||0} hit / ${na.loss||0} stop</span></div>
    <div class="perf-stat"><small>TP +6% BERSIH* · WIN/LOSS</small><strong>${nb.rate===null||nb.rate===undefined?'—':nb.rate.toFixed(1)+'%'}</strong><span>${nb.win||0} hit / ${nb.loss||0} stop</span></div>
    <div class="perf-stat"><small>TP 5% / 6% KASAR</small><strong>${a.rate==null?'—':a.rate.toFixed(1)+'%'} / ${b.rate==null?'—':b.rate.toFixed(1)+'%'}</strong><span>Daripada WIN / LOSS sahaja</span></div>`;
  const costs=perf.costs||{};
  const assumption=`* Kos anggaran ${(costs.feePctPerSide??.1).toFixed(2)}% fee + ${(costs.slippagePctPerSide??.1).toFixed(2)}% slippage setiap side. Untuk TP bersih 5% perlu harga kasar +${safeNum(costs.requiredGross5).toFixed(2)}%; TP bersih 6% perlu +${safeNum(costs.requiredGross6).toFixed(2)}%. SL kasar −2% ≈ ${pc(costs.estimatedNetAtGrossStop,false)} bersih. Bukan fill sebenar.`;
  const rows=perf.records||[];
  list.innerHTML=`<div class="cost-info">${esc(assumption)}</div>`+(rows.length?`<div class="perf-list-head"><span>SEJARAH SIGNAL ${persistent?'· DATABASE':'· RAM'}</span><span>NET TP5 / NET TP6</span></div>`+
    rows.slice(0,12).map(r=>`<div class="perf-row"><div><b>${esc(r.symbol)}</b><small>${time(r.closedAt)} · rujukan $${price(r.entry)} · skor ${r.score||0}</small></div><div><span class="outcome ${r.outcome5Net==='WIN'?'win':r.outcome5Net==='LOSS'?'loss':''}">${esc(outcomeLabel[r.outcome5Net]||r.outcome5Net||'—')}</span><span class="outcome ${r.outcome6Net==='WIN'?'win':r.outcome6Net==='LOSS'?'loss':''}">${esc(outcomeLabel[r.outcome6Net]||r.outcome6Net||'—')}</span></div></div>`).join(''):
    '<div class="pick-placeholder">Belum ada BUY rasmi yang sempat diperhatikan. Hit rate belum boleh dihitung tanpa rekod WIN/LOSS.</div>');
}
function renderTradePreview(){
  const el=$('paperTradePreview');if(!el)return;
  const entry=Number($('journalEntry')?.value),fee=Number($('journalFee')?.value);
  const plan=tradePlan(entry,fee);
  if(!plan){el.innerHTML='<span class="down">Masukkan entry dan fee yang sah untuk pengiraan TP/SL.</span>';return;}
  el.innerHTML=`<div class="calculator-head">PARAS BERDASARKAN ENTRY MANUAL · YURAN ${esc(fee.toFixed(2))}% SETIAP SIDE</div>
  <div class="calculator-grid">
    <div><small>TP1 +5% BERSIH*</small><b class="up">$${price(plan.tp1Net)}</b></div>
    <div><small>TP2 +6% BERSIH*</small><b class="up">$${price(plan.tp2Net)}</b></div>
    <div><small>STOP −2% HARGA</small><b class="down">$${price(plan.slGross)}</b></div>
    <div><small>NET JIKA STOP*</small><b class="down">${pc(plan.slNetPct,false)}</b></div>
  </div>
  <p>* Simulasi selepas fee dua hala, tanpa slippage / perubahan spread. TP net ialah harga yang diperlukan untuk keuntungan bersih sasaran, bukan ramalan atau order automatik.</p>`;
}
function openDrawer(sym){
  const c=coin(sym);if(!c)return;
  selectedCoin=sym;
  $('drawerSymbol').textContent=sym;
  const points=c.spark||[];
  const reasons=(c.reasons||[]).slice(0,9).map(x=>`<p>• ${esc(x)}</p>`).join('')||'<p>Tiada halangan utama direkodkan.</p>';
  const delta=c.entryDistancePct;
  const deltaText=Number.isFinite(delta)?pc(delta):'—';
  const readiness=c.readiness||{checks:[],pending:[],met:0,total:13,level:'NONE'};
  const checksHtml=(readiness.checks||[]).map(k=>`<div class="readiness-check ${k.ok?'passed':'missing'}"><span>${k.ok?'✓':'○'}</span><span>${esc(k.label)}</span></div>`).join('');
  const risk=c.breakoutRadar?.risk||{level:'UNKNOWN',flags:[]};
  const riskBox=risk.level==='OVEREXTENDED'
    ?`<div class="anti-fomo-notice blocked"><strong>⛔ OVEREXTENDED — Anti-FOMO aktif</strong><p>${esc((risk.flags||[]).join(' • '))}</p><span>Disingkirkan daripada calon BUY/WATCH dan Early Breakout.</span></div>`
    :risk.level==='CAUTION'
      ?`<div class="anti-fomo-notice caution"><strong>⚠ CAUTION · Harga mungkin sudah memanjang</strong><p>${esc((risk.flags||[]).join(' • '))}</p></div>`
      :`<div class="anti-fomo-notice normal"><strong>◈ Anti-FOMO: ${esc(risk.level)}</strong><p>Tiada faktor lanjutan melampau mengikut ambang V1.3; ini bukan signal beli.</p></div>`;
  const warning=c.status==='BUY' 
    ?'<div class="trade-guidance ready">BUY disahkan pada candle tertutup; semak harga, spread dan order book sebelum sebarang entry.</div>'
    :`<div class="trade-guidance">${c.status==='WATCH'?'WATCH — setup belum mengesahkan BUY.':'WAIT — tiada setup BUY yang sah.'} Paper trade di bawah ialah rekod latihan manual sahaja.</div>`;
  $('drawerBody').innerHTML=`
    <div class="detail-price">$${price(c.price)}</div><div class="${color(c.change24)}" style="font-weight:850">${pc(c.change24)} · 24H</div>
    <div class="detail-graph">${graph(points)}</div><div class="mobile-row">${badge(c.status)}<span class="muted">Candle tutup: ${c.lastCandle?time(c.lastCandle+900000):'—'}</span></div>
    ${warning}
    ${riskBox}
    <div class="quality-detail"><strong>OPPORTUNITY QUALITY · ${esc(c.opportunity?.label||'BELUM DINILAI')}</strong><p>${c.opportunity?.qualified?'Lulus penapis pemerhatian. Ini bukan arahan BUY.':esc((c.opportunity?.reasons||['Data tidak lengkap']).slice(0,7).join(' • '))}</p></div>
    <div class="timing-drawer"><h3>SMART ENTRY TIMING · V1.5</h3>
      <div class="timing-drawer-kpis"><span>Status: <strong>${esc(c.smartTiming?.stage||'NO DATA')}</strong></span><span>Risk: <strong>${esc(c.smartTiming?.risk||'HIGH')}</strong></span></div>
      <p>${esc((c.smartTiming?.notes||['Data candle tidak cukup']).join(' • '))}</p>
      <div class="form-hint">Resistance: ${Number.isFinite(c.smartTiming?.level)?'$'+price(c.smartTiming.level):'—'} · Zon ATR: ${Number.isFinite(c.smartTiming?.entryZoneLow)?'$'+price(c.smartTiming.entryZoneLow)+' – $'+price(c.smartTiming.entryZoneHigh):'Tiada'} · ${c.smartTiming?.withinZone?'Harga live dalam zon':'Harga live di luar zon / zon tidak tersedia'}</div>
      <p class="timing-drawer-warnings">${esc((c.smartTiming?.riskReasons||[]).join(' • ')||'Tiada amaran tambahan menurut ambang heuristik')}</p>
      <div class="form-hint">Skor teknikal: ${c.score||0}/100 · Risiko diasingkan. Semua paras hanya untuk pemerhatian, bukan harga order atau jaminan.</div>
    </div>
    <div class="breakout-drawer-strip"><div><small>QUALITY RANK</small><strong>${c.breakoutRadar?.quality||0}/100</strong></div><div><small>VOL ACCEL 3×15m</small><strong>${Number.isFinite(c.volumeAccel)?c.volumeAccel.toFixed(2)+'x':'—'}</strong></div><div><small>BREAKOUT GAP</small><strong>${Number.isFinite(readiness.breakoutGapPct)?pc(readiness.breakoutGapPct,false):'—'}</strong></div></div>
    <div class="detail-grid">
      <div class="detail-item"><small>RADAR SCORE</small><strong class="up">${c.score||0}/100</strong></div><div class="detail-item"><small>VOLUME 24H</small><strong>${compact(c.volume24)}</strong></div>
      <div class="detail-item"><small>RELATIVE VOLUME</small><strong>${c.rvol||'—'}x</strong></div><div class="detail-item"><small>RSI / ADX</small><strong>${c.rsi||'—'} / ${c.adx||'—'}</strong></div>
      <div class="detail-item"><small>24H RANGE</small><strong>${pc(c.range24,false)}</strong></div><div class="detail-item"><small>SPREAD</small><strong>${pc(c.spread,false)}</strong></div>
      <div class="detail-item"><small>TP1 +5% KASAR †</small><strong class="up">${c.entry?'$'+price(c.tp1):'—'}</strong></div><div class="detail-item"><small>TP2 +6% KASAR †</small><strong class="up">${c.entry?'$'+price(c.tp2):'—'}</strong></div>
      <div class="detail-item"><small>RUJUKAN CANDLE †</small><strong>${c.entry?'$'+price(c.entry):'—'}</strong></div><div class="detail-item"><small>STOP −2% KASAR †</small><strong class="down">${c.entry?'$'+price(c.sl):'—'}</strong></div>
      <div class="detail-item"><small>LIVE vs CANDLE</small><strong class="${delta>=0?'up':'down'}">${deltaText}</strong></div><div class="detail-item"><small>ZON HARGA UNTUK SIGNAL BUY</small><strong>${c.entryZoneLow?'$'+price(c.entryZoneLow)+' – $'+price(c.entryZoneHigh):'—'}</strong></div>
    </div><div class="form-hint">† Paras rujukan daripada close candle 15m terakhir; ini BUKAN harga entry sebenar dan TP di atas belum ditolak fee. Zon entry ialah filter anti-chase, bukan pesanan beli. Harga live: $${price(c.price)}.</div>
    <div class="readiness-detail"><h3>13 pemeriksaan BUY · ${readiness.met}/${readiness.total} lulus</h3><p>${c.status==='BUY'?'BUY disahkan pada candle yang telah tutup. Tetap semak spread dan risiko.':'Ini hanya tahap kesiapsiagaan teknikal, BUKAN signal BUY atau kebarangkalian menang.'}</p><div class="readiness-check-grid">${checksHtml||'<span class="muted">Tidak cukup data candle untuk analisis.</span>'}</div></div>
    <div class="detail-reasons"><h3>${esc(c.setup||'Analisis')} · Sebab belum BUY</h3>${reasons}</div>
    <div class="detail-actions"><a href="https://www.kucoin.com/trade/${encodeURIComponent(sym)}" target="_blank" rel="noopener noreferrer">Open KuCoin ↗</a><a href="https://www.tradingview.com/chart/?symbol=KUCOIN%3A${encodeURIComponent(sym.replace('-',''))}" target="_blank" rel="noopener noreferrer">TradingView ↗</a></div>
    <form id="paperForm" class="form-card"><h3>+ Rekod Paper Trade</h3><p>Entry manual sahaja — tiada order dihantar ke exchange.</p><div class="form-fields"><label>Entry Price (USDT)<input id="journalEntry" type="number" step="any" min="0.000000001" required value="${safeNum(c.price)}"></label><label>Position Size (USDT)<input id="journalSize" type="number" min="1" step="any" required value="100"></label><label>Fee setiap side (%)<input id="journalFee" type="number" min="0" max="5" step="0.01" required value="0.1"></label><label>Note (optional)<input id="journalNote" type="text" maxlength="120" placeholder="Setup / sebab masuk"></label></div>
      <div id="paperTradePreview" class="paper-trade-preview" aria-live="polite"></div>
      <button class="primary-btn" type="submit">+ Tambah ke Journal (Manual)</button><div class="form-hint">P/L jurnal menggunakan entry sebenar yang diisi, fee dua hala dan harga exit manual. Tiada sambungan akaun exchange.</div></form>`;
  $('overlay').classList.remove('hidden');$('coinDrawer').classList.remove('hidden');$('coinDrawer').scrollTop=0;document.body.style.overflow='hidden';
  $('journalEntry').addEventListener('input',renderTradePreview);$('journalFee').addEventListener('input',renderTradePreview);renderTradePreview();
  q('#paperForm').addEventListener('submit',e=>{e.preventDefault();
    const entry=Number($('journalEntry').value),size=Number($('journalSize').value),fee=Number($('journalFee').value),note=$('journalNote').value.trim();
    if(!Number.isFinite(entry)||entry<=0||!Number.isFinite(size)||size<=0||!tradePlan(entry,fee))return toast('Semak nilai entry, size dan fee.');
    trades.unshift({id:globalThis.crypto?.randomUUID?.()||String(Date.now()),symbol:sym,status:'OPEN',entry,size,fee,note,opened:stamp(),exit:null,closed:null,
      signalStatus:c.status,signalScore:c.score,signalCandle:c.lastCandle||null});
    if(persist(JOURNAL,trades)){toast(`Paper trade ${sym} direkodkan.`);closeDrawer();show('journal');}
  });
}
function closeDrawer(){selectedCoin=null;closeAll();}
function closeAll(){$('overlay').classList.add('hidden');$('coinDrawer').classList.add('hidden');$('settingsDrawer').classList.add('hidden');document.body.style.overflow='';}
$('closeDrawer').addEventListener('click',closeDrawer);$('closeSettings').addEventListener('click',closeAll);$('overlay').addEventListener('click',closeAll);
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeAll();});
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-open],[data-star]');if(!b)return;
  if(b.dataset.open)openDrawer(b.dataset.open);
  if(b.dataset.star){const sym=b.dataset.star;
    if(!safeSymbol(sym))return;
    prefs.favorites=isFav(sym)?prefs.favorites.filter(x=>x!==sym):[...prefs.favorites,sym];persist(STORE,prefs);render();}
});
qa('.filter-chip').forEach(b=>b.addEventListener('click',()=>{prefs.status=b.dataset.status;qa('.filter-chip').forEach(x=>x.classList.toggle('selected',x.dataset.status===prefs.status));persist(STORE,prefs);render();}));
qa('.filter-chip').forEach(x=>x.classList.toggle('selected',x.dataset.status===prefs.status));
for(const [key,el] of Object.entries(filters))el.addEventListener('change',()=>{prefs[key]=el.value;persist(STORE,prefs);render();});
$('searchInput').addEventListener('input',render);
$('refreshBtn').addEventListener('click',()=>{loadDashboard(true);toast('Memuat semula data pelayan...');});
$('settingsBtn').addEventListener('click',()=>{
  $('settingsScore').value=filters.score.value;
  $('settingsScoreValue').textContent=filters.score.value+'+';
  $('settingsVolume').value=filters.volume.value;
  $('overlay').classList.remove('hidden');$('settingsDrawer').classList.remove('hidden');document.body.style.overflow='hidden';
});
$('settingsScore').addEventListener('input',()=>{$('settingsScoreValue').textContent=$('settingsScore').value+'+';});
$('saveSettings').addEventListener('click',()=>{
  // Nearest supported select threshold
  filters.score.value=$('settingsScore').value;filters.volume.value=$('settingsVolume').value;
  prefs.score=filters.score.value;prefs.volume=filters.volume.value;persist(STORE,prefs);render();closeAll();toast('Tapisan disimpan.');
});
function pnl(t,exit){if(!(exit>0))return null;return (t.size||0)*((exit/t.entry)*(1-(t.fee||0)/100)-(1+(t.fee||0)/100));}
function tradePnl(t){const exit=t.status==='CLOSED'?t.exit:ticker(t.symbol)?.price;return pnl(t,exit);}
function renderJournal(){
  const closed=trades.filter(t=>t.status==='CLOSED'),win=closed.filter(t=>tradePnl(t)>0).length;
  const realized=closed.reduce((s,t)=>s+(tradePnl(t)||0),0);
  $('journalTotal').textContent=trades.length;$('journalOpen').textContent=trades.filter(t=>t.status==='OPEN').length;
  $('journalWin').textContent=closed.length?((win/closed.length)*100).toFixed(1)+'%':'—';
  $('journalPnl').textContent=(realized>0?'+':'')+dollars(realized);
  $('journalPnl').className='kpi-value '+(realized>=0?'up':'down');
  $('journalRows').innerHTML=trades.length?trades.map(t=>{
    const current=t.status==='OPEN'?ticker(t.symbol)?.price:t.exit;
    const profit=tradePnl(t);const roi=profit===null?null:(profit/(t.size*(1+t.fee/100)))*100;
    return `<div class="journal-row"><div><strong>${esc(t.symbol)}</strong><small>${esc(time(t.opened))} · ${t.status==='OPEN'?'OPEN':'CLOSED'} · signal ${esc(t.signalStatus||'manual')}</small></div><div><strong>Entry $${price(t.entry)}</strong><small>Size ${dollars(t.size)} · Fee ${t.fee}%/side</small></div><div><strong>${t.status==='OPEN'?'Mark':'Exit'} ${current?'$'+price(current):'—'}</strong><small>${esc(t.note||'Tiada note')}</small></div><div><div class="pnl-value ${profit===null?'muted':profit>=0?'up':'down'}">${profit===null?'—':(profit>0?'+':'')+dollars(profit)}</div><small>${roi===null?'Harga tak tersedia':pc(roi)}</small></div><div>${t.status==='OPEN'?`<button class="small-btn" data-trade-close="${esc(t.id)}">Close Trade</button>`:`<button class="danger-btn" data-trade-delete="${esc(t.id)}">Delete</button>`}</div></div>`;
  }).join(''):'<div class="journal-empty"><strong>Belum ada trade direkodkan.</strong>Buka Radar → pilih mana-mana coin → “Tambah ke Journal”.</div>';
}
$('journalRows').addEventListener('click',e=>{
  const close=e.target.closest('[data-trade-close]');const del=e.target.closest('[data-trade-delete]');
  if(close){const t=trades.find(x=>x.id===close.dataset.tradeClose);if(!t)return;
    const guess=ticker(t.symbol)?.price||t.entry;
    const value=window.prompt(`Exit price sebenar (USDT) untuk ${t.symbol}:`,String(guess));
    if(value===null)return;const n=Number(value);
    if(!Number.isFinite(n)||n<=0)return toast('Masukkan exit price yang sah.');
    t.exit=n;t.status='CLOSED';t.closed=stamp();persist(JOURNAL,trades);renderJournal();render();toast('Trade ditutup dalam jurnal.');
  }
  if(del){if(!window.confirm('Padam rekod trade ini?'))return;trades=trades.filter(x=>x.id!==del.dataset.tradeDelete);persist(JOURNAL,trades);renderJournal();render();}
});
function download(text,filename,mime){const blob=new Blob([text],{type:mime});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),2500);}
$('exportJson').addEventListener('click',()=>{download(JSON.stringify({version:1,exported:stamp(),trades},null,2),'daily-radar-journal.json','application/json');toast('Backup JSON dimuat turun.');});
$('exportCsv').addEventListener('click',()=>{
  const rows=[['Symbol','Status','Opened','Closed','Entry','Exit','Size_USDT','Fee_percent_per_side','PnL_USDT','ROI_percent','Note'],...trades.map(t=>{
    const r=tradePnl(t),roi=r===null?'':r/(t.size*(1+t.fee/100))*100;
    return [t.symbol,t.status,t.opened,t.closed||'',t.entry,t.exit||'',t.size,t.fee,r??'',roi,t.note||''];
  })];
  const csv=rows.map(r=>r.map(v=>{const value=String(v??'');const safe=/^[=+@\-\t\r]/.test(value)&&!/^-[0-9.]+$/.test(value)?"'"+value:value;return '"'+safe.replaceAll('"','""')+'"';}).join(',')).join('\r\n');
  download('\ufeff'+csv,'daily-radar-journal.csv','text/csv;charset=utf-8');toast('CSV dimuat turun.');
});
$('importFile').addEventListener('change',async e=>{
  const f=e.target.files[0];if(!f)return;
  try{
    if(f.size>3_000_000)throw Error('File terlalu besar');
    const parsed=JSON.parse(await f.text());
    if(parsed.version!==1||!Array.isArray(parsed.trades))throw Error('Format backup tidak sesuai');
    const incoming=parsed.trades.filter(t=>t&&safeSymbol(t.symbol)&&['OPEN','CLOSED'].includes(t.status)&&
      Number(t.entry)>0&&Number(t.size)>0&&Number(t.fee)>=0&&Number(t.fee)<=5&&
      (t.status==='OPEN'||Number(t.exit)>0)).slice(0,1000).map(t=>({
        id:String(t.id||'')||globalThis.crypto?.randomUUID?.()||String(Date.now()),symbol:t.symbol,status:t.status,
        entry:Number(t.entry),size:Number(t.size),fee:Number(t.fee),
        opened:String(t.opened||stamp()).slice(0,50),closed:t.closed?String(t.closed).slice(0,50):null,
        exit:t.status==='CLOSED'?Number(t.exit):null,note:String(t.note||'').slice(0,120),
        signalStatus:['BUY','WATCH','WAIT'].includes(t.signalStatus)?t.signalStatus:'manual',signalScore:Number(t.signalScore)||0,signalCandle:Number(t.signalCandle)||null
      }));
    if(!incoming.length)throw Error('Tiada trade sah dalam backup');
    if(!window.confirm(`Import ${incoming.length} trade? Trade dengan ID sama akan digantikan; yang lain dikekalkan.`))return;
    const map=new Map(trades.map(t=>[t.id,t]));for(const t of incoming)map.set(t.id,t);
    trades=[...map.values()].slice(0,1500);persist(JOURNAL,trades);renderJournal();toast(`${incoming.length} trade berjaya diimport.`);
  }catch(err){toast(`Import gagal: ${err.message}`);}finally{e.target.value='';}
});
$('alertsBtn').addEventListener('click',async()=>{
  if(!('Notification' in window))return toast('Browser ini tidak menyokong notification API.');
  const status=await Notification.requestPermission();
  toast(status==='granted'?'Alert browser diaktifkan (semasa tab terbuka).':'Kebenaran notifikasi tidak diberikan.');
});
function alertNewBuys(data){
  const buy=data.coins.filter(c=>c.status==='BUY'&&c.lastCandle).map(c=>`${c.symbol}:${c.lastCandle}`);
  if(!hasBaseline){seenSignals=new Set(buy);hasBaseline=true;return;}
  for(const key of buy){
    if(!seenSignals.has(key)&&document.visibilityState==='visible'&&window.Notification?.permission==='granted'){
      try{new Notification('Daily Radar · BUY setup',{body:`${key.split(':')[0]}: candle 15m confirmed, semak carta sebelum entry.`,tag:key});}catch{}
    }
    seenSignals.add(key);
  }
  if(seenSignals.size>2000)seenSignals=new Set(buy);
}
async function loadDashboard(force=false){
  if(busy)return;
  busy=true;
  try{
    const res=await fetch('/api/dashboard'+(force?'?t='+Date.now():''),{cache:'no-store'});
    if(!res.ok)throw Error(`Server HTTP ${res.status}`);
    const data=await res.json();
    latest=data;lastDataAt=Date.now();render();alertNewBuys(data);
    // Keep any draft entry fields intact while automatic refresh runs.
  }catch(err){
    $('connectionPill').classList.add('offline');$('connectionLabel').textContent='DISCONNECTED';
    $('globalError').textContent='Tidak dapat baca server: '+err.message+' — semak sambungan internet atau Render sedang bangun dari sleep.';
    $('globalError').classList.remove('hidden');
  }finally{busy=false;}
}
loadDashboard();setInterval(()=>loadDashboard(),20_000);

$('telegramHelp').addEventListener('click',()=>{
  const button=q('[data-view="guide"]');if(button)button.click();
  setTimeout(()=>$('telegramGuide')?.scrollIntoView({behavior:'smooth',block:'start'}),60);
});
