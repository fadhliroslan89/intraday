// Single-source presentation of EXISTING server conditions.
// This module never creates BUY signals, places orders, or claims win probabilities.
const finite = v => typeof v==='number' && Number.isFinite(v);
const positive = v => finite(v) && v>0;
const round = (v,d=2)=>Number(v.toFixed(d));
const safe = (s)=>String(s||'');
export function netTargetGrossPct(netPct, perSideFee=0.1, perSideSlippage=0.1){
  const cost=(perSideFee+perSideSlippage)/100;
  return ((1+netPct/100)*(1+cost)/(1-cost)-1)*100;
}
export function classifyCenterCoin(c, context={}){
  const {ok=false,summary={}}=context;
  const now=finite(context.now)?context.now:Date.now();
  const offline=!ok || summary.dataStale===true || !positive(summary.updated) || now-summary.updated>90_000 || !positive(summary.analyzedAt) || now-summary.analyzedAt>20*60_000;
  const symbol=safe(c?.symbol), b=symbol.split('-')[0];
  const isPegged=!!c?.opportunity?.reasons?.some(x=>/stablecoin|berpatok/i.test(safe(x)))||
    ['USDC','USDE','USDD','TUSD','USDP','DAI','PYUSD','FDUSD','USD1','FRAX','USDS','RLUSD','BUSD','USDT'].includes(b);
  const closed=!!c?.confirmed && !c?.stale && positive(c?.lastCandle) && now-(c.lastCandle+900_000)<=30*60_000;
  const risk=c?.breakoutRadar?.risk||{};
  const stage=c?.smartTiming?.stage||'NO_DATA';
  const danger=!!risk.blocked||['FALSE BREAKOUT','OVEREXTENDED'].includes(stage)||isPegged;
  const validPrice=positive(c?.price);
  const allowReady=!!(c?.status==='BUY'&&closed&&!danger&&validPrice&&c?.entryZoneValid===true&&
    c?.smartTiming?.risk!=='HIGH'&&
    !['NO_DATA','WAIT','FALSE BREAKOUT','OVEREXTENDED'].includes(stage));
  const watch=!!(c?.opportunity?.qualified || ['NEAR BUY','EARLY'].includes(c?.readiness?.level)||
    ['EARLY BREAKOUT','BUILDING'].includes(c?.breakoutRadar?.stage)||c?.status==='WATCH');
  const label=offline?'OFFLINE':allowReady?'READY':danger?'AVOID':watch||c?.status==='BUY'?'WAIT':'AVOID';
  const why=[];
  if(offline)why.push('Data pasaran atau imbasan teknikal belum segar. Tiada entry sehingga sambungan pulih.');
  else if(isPegged)why.push('Pasangan stablecoin / aset berpatok dikecualikan daripada strategi 5–6%.');
  else if(risk.blocked)why.push('Anti-FOMO: harga sudah terlalu tinggi atau momentum memanjang.');
  else if(stage==='FALSE BREAKOUT')why.push('False breakout: candle gagal mempertahankan paras breakout.');
  else if(!closed)why.push('Candle 15m yang disahkan belum segar. Tunggu kemas kini.');
  if(!offline&&c?.status==='BUY'&&!c.entryZoneValid)why.push('BUY terdahulu tetapi harga live sudah di luar zon anti-chase.');
  if(!offline&&c?.status==='BUY'&&stage==='WAIT')why.push('Timing breakout belum meyakinkan walaupun syarat teknikal lain lulus.');
  if(!offline&&c?.smartTiming?.risk==='HIGH')why.push('Risiko timing dinilai HIGH.');
  if(label==='WAIT'&&why.length<3){
    for(const r of c?.readiness?.pending||[])if(why.length<3)why.push(safe(typeof r==='object' ? r.label||r.reason : r));
    for(const r of c?.opportunity?.reasons||[])if(why.length<3)why.push(safe(r));
  }
  if(label==='AVOID'&&why.length===0)why.push('Tidak lulus penapis peluang atau momentum minimum sekarang.');
  if(label==='READY')why.push('Signal BUY rasmi, candle sah dan zon anti-chase dipenuhi; risiko masih wujud.');
  const unique=[...new Set(why.filter(Boolean))].slice(0,4);
  const qualified=label==='READY'||label==='WAIT';
  const score=finite(c?.score)?c.score:0;
  const quality=finite(c?.opportunity?.score)?c.opportunity.score:0;
  const priority=(label==='READY'?300:label==='WAIT'?150:0)+
    (c?.opportunity?.qualified?60:0)+
    (c?.readiness?.level==='NEAR BUY'?30:0)+
    (c?.breakoutRadar?.stage==='EARLY BREAKOUT'?20:0)+
    quality*.3+score*.65+
    (finite(c?.rvol)?Math.min(15,c.rvol*3):0);
  return {symbol,label,why:unique,priority,qualified,score,quality,closed,
    zoneType:label==='READY'?'ANTI_CHASE':c?.smartTiming?.entryZoneLow!=null?'ATR_WATCH':'NONE'};
}
export function buildSignalCenter(data, now=Date.now()){
  const context={ok:data?.ok===true,summary:data?.summary||{},now};
  const list=(data?.coins||[]).map(c=>({...classifyCenterCoin(c,context),coin:c}));
  list.sort((a,b)=>b.priority-a.priority||a.symbol.localeCompare(b.symbol));
  const ready=list.filter(x=>x.label==='READY');
  const waiting=list.filter(x=>x.label==='WAIT');
  const avoided=list.filter(x=>x.label==='AVOID');
  return {ready,waiting,avoided,active:[...ready,...waiting],all:list,
    offline:!context.ok||context.summary.dataStale===true||now-context.summary.updated>90_000||now-context.summary.analyzedAt>20*60_000,
    analyzed:data?.summary?.analyzed||0};
}
