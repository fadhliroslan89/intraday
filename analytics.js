import {isExcludedBase} from './opportunity.js';
import {detectTimingPattern} from './timing.js';
// Pure, testable analysis. A score is an indicator checklist, NOT a probability of profit.
export const CFG = Object.freeze({
  MAX_CANDIDATES: 52,
  MIN_SCAN_TURNOVER: 1_000_000,
  SIGNAL_TURNOVER: 5_000_000,
  SIGNAL_RANGE: 5,
  MAX_SPREAD: 0.55,
  MIN_BUY_SCORE: 80,
  MIN_BUY_ADX: 22,
  MIN_BUY_RVOL: 1.5,
  MAX_ENTRY_ABOVE_SIGNAL_PCT: 1.0,
  MAX_ENTRY_BELOW_SIGNAL_PCT: 0.5,
  TP1: 5,
  TP2: 6,
  SL: 2,
  // Anti-FOMO thresholds are transparent heuristics, not an outcome prediction.
  FOMO_24H_CAUTION: 12,
  FOMO_24H_BLOCK: 25,
  FOMO_EMA_CAUTION: 3.5,
  FOMO_EMA_BLOCK: 6,
  FOMO_45M_BLOCK: 8,
  BREAKOUT_RADAR_GAP: 2.5,
  BREAKOUT_RADAR_RVOL: 1.3,
  BREAKOUT_RADAR_ACCEL: 1.1,
});

export const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
export const round = (x, dp=2) => Number.isFinite(x) ? Number(x.toFixed(dp)) : 0;
export const mean = a => a.length ? a.reduce((s,x)=>s+x,0)/a.length : 0;

export function ema(arr, period) {
  if (arr.length < period) return null;
  let val = mean(arr.slice(0, period));
  const k = 2/(period+1);
  for (let i=period;i<arr.length;i++) val=arr[i]*k+val*(1-k);
  return val;
}
export function rsi(closes, period=14) {
  if (closes.length < period+2) return null;
  let gain=0, loss=0;
  for (let i=1;i<=period;i++) { const d=closes[i]-closes[i-1]; gain+=Math.max(d,0); loss+=Math.max(-d,0); }
  gain/=period; loss/=period;
  for (let i=period+1;i<closes.length;i++) {
    const d=closes[i]-closes[i-1];
    gain=(gain*(period-1)+Math.max(d,0))/period;
    loss=(loss*(period-1)+Math.max(-d,0))/period;
  }
  return loss===0 ? (gain===0 ? 50 : 100) : 100-100/(1+gain/loss);
}
export function adx(candles, p=14) {
  if (candles.length < p*3) return null;
  const tr=[], pdm=[], mdm=[];
  for(let i=1;i<candles.length;i++) {
    const a=candles[i], b=candles[i-1];
    const u=a.high-b.high, d=b.low-a.low;
    tr.push(Math.max(a.high-a.low,Math.abs(a.high-b.close),Math.abs(a.low-b.close)));
    pdm.push(u>d&&u>0?u:0); mdm.push(d>u&&d>0?d:0);
  }
  let atr=tr.slice(0,p).reduce((a,b)=>a+b,0);
  let plus=pdm.slice(0,p).reduce((a,b)=>a+b,0);
  let minus=mdm.slice(0,p).reduce((a,b)=>a+b,0);
  const dx=[];
  for(let i=p;i<tr.length;i++) {
    atr=atr-atr/p+tr[i]; plus=plus-plus/p+pdm[i]; minus=minus-minus/p+mdm[i];
    const a=atr>0?100*plus/atr:0,b=atr>0?100*minus/atr:0;
    dx.push((a+b)>0?100*Math.abs(a-b)/(a+b):0);
  }
  if(dx.length<p) return null;
  let v=mean(dx.slice(0,p));
  for(let i=p;i<dx.length;i++)v=(v*(p-1)+dx[i])/p;
  return v;
}

export function normalizeTicker(t) {
  const symbol=String(t.symbol||'');
  const price=num(t.last), high=num(t.high), low=num(t.low);
  const bid=num(t.buy),ask=num(t.sell);
  return {
    symbol,price,change24:round(num(t.changeRate)*100),
    volume24:num(t.volValue), range24:low>0?round((high-low)/low*100):0,
    high24:high, low24:low,
    spread:bid>0&&ask>=bid?round((ask-bid)/((ask+bid)/2)*100,3):999,
  };
}

export function parseCandles(rows, intervalMin, now=Date.now()) {
  if(!Array.isArray(rows))return [];
  const step=intervalMin*60_000;
  return rows.map(r=>({
    time:num(r[0])*1000,open:num(r[1]),close:num(r[2]),
    high:num(r[3]),low:num(r[4]),volume:num(r[5]),turnover:num(r[6]),
  })).filter(c=>c.time>0&&c.open>0&&c.close>0&&c.high>=c.low&&c.time+step<=now-2_500)
    .sort((a,b)=>a.time-b.time).filter((c,i,a)=>i===0||c.time!==a[i-1].time);
}
const pct = (a,b) => b>0?(a/b-1)*100:0;
export function analyze(t, candles15, candles1h, now=Date.now()) {
  const base={...t,score:0,status:'WAIT',reasons:[],confirmed:false,lastCandle:null,
    entry:0,tp1:0,tp2:0,sl:0,timingPattern:null,rvol:0,rsi:0,adx:0,roc45:0,ema20:0,ema50:0,
    trend15:false,trend1h:false,breakout:false,breakoutLevel:0,volumeAccel:null,spark:[],setup:'Belum cukup data candle'};
  if(isExcludedBase(t.symbol))return {...base,setup:'Stablecoin / aset berpatok tidak layak untuk screener 5–6%',reasons:['Stablecoin ditapis']};
  if(candles15.length<205||candles1h.length<56)return base;
  const c=candles15, h=candles1h, closes=c.map(x=>x.close), hc=h.map(x=>x.close);
  const cur=c.at(-1), prev=c.at(-2);
  const E20=ema(closes,20),E50=ema(closes,50),E200=ema(closes,200);
  const H20=ema(hc,20),H50=ema(hc,50);
  const R=rsi(closes), D=adx(c);
  const rv=mean(c.slice(-21,-1).map(x=>x.turnover));
  const RVOL=rv>0?cur.turnover/rv:0;
  // Confirmed 15m candles only, compare last 3 with the preceding 3. A ratio
  // alone does not prove an actual breakout or predict future price moves.
  const prior3=mean(c.slice(-6,-3).map(x=>x.turnover));
  const recent3=mean(c.slice(-3).map(x=>x.turnover));
  const volumeAccel=prior3>0 ? round(recent3/prior3,2) : null;
  const roc45=pct(cur.close,c.at(-4).close);
  const prevHigh=Math.max(...c.slice(-21,-1).map(x=>x.high));
  const isBreakout=cur.close>prevHigh*1.001;
  const trend15=cur.close>E20&&E20>E50&&E50>E200;
  const trend1h=hc.at(-1)>H20&&H20>H50&&(now-(h.at(-1).time+60*60_000)<2*60*60_000);
  const stretch=pct(cur.close,E20);
  const candleAge=now-(cur.time+15*60_000);
  // Reject stale candles. KuCoin skips empty candle periods on illiquid markets.
  const fresh=candleAge>=0&&candleAge<2*15*60_000;
  const liquid=t.volume24>=CFG.SIGNAL_TURNOVER&&t.spread<=CFG.MAX_SPREAD;
  let score=0, reasons=[];
  if(cur.close>E20)score+=8;
  if(E20>E50)score+=8;
  if(E50>E200)score+=9;
  if(R>=52&&R<=70)score+=12;
  else if(R>=48&&R<=74)score+=6;
  if(roc45>=0.6&&roc45<=5)score+=10;
  else if(roc45>0&&roc45<=7)score+=5;
  if(isBreakout)score+=18;
  else if(cur.close>=prevHigh*0.99)score+=9;
  if(RVOL>=1.8)score+=14;
  else if(RVOL>=1.3)score+=10;
  else if(RVOL>=1)score+=4;
  if(D>=20)score+=6;
  else if(D>=16)score+=3;
  if(trend1h)score+=10;
  if(t.volume24>=CFG.SIGNAL_TURNOVER)score+=3;
  if(t.spread<=CFG.MAX_SPREAD)score+=2;
  if(!trend15)reasons.push('Trend EMA 15m belum sebaris');
  if(!trend1h)reasons.push('Trend 1h belum sah');
  if(!isBreakout)reasons.push('Belum breakout 20 candle');
  if(RVOL<CFG.MIN_BUY_RVOL)reasons.push('Volume breakout lemah (RVOL '+round(RVOL,2)+'x < '+CFG.MIN_BUY_RVOL+'x)');
  if(D<CFG.MIN_BUY_ADX)reasons.push('ADX '+round(D,1)+' < '+CFG.MIN_BUY_ADX+' (trend belum cukup kuat)');
  if(R<53||R>70)reasons.push('RSI di luar zon BUY 53–70');
  if(!liquid)reasons.push('Liquidity / spread tidak sesuai');
  if(stretch>3.5) {score-=12;reasons.push('Harga sudah terlalu jauh dari EMA20');}
  if(t.change24>15){score-=12;reasons.push('Kenaikan 24h terlalu tinggi (chase risk)');}
  if(R>71){score-=10;reasons.push('RSI terlalu panas');}
  if(t.range24<CFG.SIGNAL_RANGE)reasons.push('Range 24h bawah 5%');
  if(!fresh)reasons.push('Candle terkini sudah lapuk');
  score=Math.max(0,Math.min(100,score));
  const buy=fresh&&trend15&&trend1h&&isBreakout&&RVOL>=CFG.MIN_BUY_RVOL&&R>=53&&R<=70&&D>=CFG.MIN_BUY_ADX&&
    roc45>0&&roc45<=5&&stretch<=3.5&&liquid&&t.range24>=CFG.SIGNAL_RANGE&&t.change24<=15&&score>=CFG.MIN_BUY_SCORE;
  const status=buy?'BUY':(fresh&&score>=60&&liquid?'WATCH':'WAIT');
  const entry=cur.close;
  return {...base,score,status,reasons,confirmed:fresh,lastCandle:cur.time,
    entry,tp1:entry*(1+CFG.TP1/100),tp2:entry*(1+CFG.TP2/100),sl:entry*(1-CFG.SL/100),
    volumeAccel,timingPattern:detectTimingPattern(c),rvol:round(RVOL),rsi:round(R,1),adx:round(D,1),roc45:round(roc45),ema20:E20,ema50:E50,
    trend15,trend1h,breakout:isBreakout,breakoutLevel:prevHigh*1.001,spark:c.slice(-35).map(x=>round(x.close,8)),
    setup:buy?'Breakout disahkan + trend 15m/1h':status==='WATCH'?'Momentum dipantau':'Belum penuhi syarat BUY',
    stretch:round(stretch),time:now};
}
export function chooseCandidates(tickers, max=CFG.MAX_CANDIDATES, rotation=0) {
  const eligible=tickers.filter(t=>!isExcludedBase(t.symbol)&&t.price>0&&t.volume24>=CFG.MIN_SCAN_TURNOVER&&t.spread<1.5);
  const vol=[...eligible].sort((a,b)=>b.volume24-a.volume24);
  const movers=[...eligible].sort((a,b)=>b.change24-a.change24);
  const range=[...eligible].sort((a,b)=>b.range24-a.range24);
  const set=new Map();
  function pick(arr,n) {for(const t of arr.slice(0,n))if(set.size<max)set.set(t.symbol,t);}
  // Reserve rotating slots so less popular candidates are sampled as well.
  pick(vol,Math.floor(max*.40));
  pick(movers.filter(t=>t.change24>0),Math.floor(max*.30));
  pick(range,Math.floor(max*.15));
  const remainder=eligible.filter(t=>!set.has(t.symbol));
  const remainingSlots=max-set.size;
  for(let i=0;i<remainingSlots&&remainder.length;i++){
    const t=remainder[(rotation+i)%remainder.length];if(t)set.set(t.symbol,t);
  }
  return [...set.values()].slice(0,max);
}

// Readiness is an explanation of how many BUY checks have passed — never a win probability.
// It is recomputed for each API snapshot so live price deviation and candle expiry count.
export function assessReadiness(c) {
  const empty={level:'NONE',met:0,total:13,percent:0,pending:[],checks:[],breakoutGapPct:null};
  if (!(c && c.entry>0 && c.lastCandle && c.confirmed && !c.stale)) return empty;
  const okEntry=c.entryZoneValid===true;
  const checks=[
    {id:'score',label:'Radar Score ≥80',ok:c.score>=CFG.MIN_BUY_SCORE,
      detail:`Score ${round(c.score,0)}/100 · perlu ≥${CFG.MIN_BUY_SCORE}`},
    {id:'trend15',label:'Trend EMA 15m searah',ok:c.trend15===true,detail:'Susunan EMA20 > EMA50 > EMA200 belum lengkap'},
    {id:'trend1h',label:'Trend 1H disahkan',ok:c.trend1h===true,detail:'Trend EMA20 / EMA50 1H belum sah'},
    {id:'breakout',label:'Breakout 20 candle',ok:c.breakout===true,detail:'Candle 15m belum tutup di atas paras breakout'},
    {id:'rvol',label:'RVOL ≥1.50x',ok:c.rvol>=CFG.MIN_BUY_RVOL,
      detail:`RVOL ${round(c.rvol,2).toFixed(2)}x · perlu ≥${CFG.MIN_BUY_RVOL.toFixed(2)}x`},
    {id:'adx',label:'ADX ≥22',ok:c.adx>=CFG.MIN_BUY_ADX,
      detail:`ADX ${round(c.adx,1).toFixed(1)} · perlu ≥${CFG.MIN_BUY_ADX}`},
    {id:'rsi',label:'RSI 53–70',ok:c.rsi>=53&&c.rsi<=70,
      detail:`RSI ${round(c.rsi,1)} · perlu 53–70`},
    {id:'momentum',label:'Momentum 45m positif, ≤5%',ok:c.roc45>0&&c.roc45<=5,
      detail:`Momentum 45m ${round(c.roc45,2)}% · perlu >0% hingga 5%`},
    {id:'liquid',label:'Volume ≥$5M & spread ≤0.55%',ok:c.volume24>=CFG.SIGNAL_TURNOVER&&c.spread<=CFG.MAX_SPREAD,
      detail:`Volume $${round(c.volume24/1e6,2)}M / spread ${round(c.spread,3)}%`},
    {id:'range',label:'Range 24h ≥5%',ok:c.range24>=CFG.SIGNAL_RANGE,
      detail:`Range 24h ${round(c.range24,2)}% · perlu ≥${CFG.SIGNAL_RANGE}%`},
    {id:'chase',label:'Harga tidak terlalu panas',ok:c.stretch<=3.5&&c.change24<=15,
      detail:`Jarak EMA20 ${round(c.stretch,2)}% / 24h ${round(c.change24,2)}%`},
    {id:'fresh',label:'Candle tertutup & masih segar',ok:c.confirmed===true&&!c.stale,
      detail:'Candle lama — tunggu analisis seterusnya'},
    {id:'entry',label:'Harga live dalam zon anti-chase',ok:okEntry,
      detail:`Harga live ${round(c.entryDistancePct,2)}% dari rujukan; zon -${CFG.MAX_ENTRY_BELOW_SIGNAL_PCT}% hingga +${CFG.MAX_ENTRY_ABOVE_SIGNAL_PCT}%`},
  ];
  const met=checks.filter(x=>x.ok).length, total=checks.length;
  const pending=checks.filter(x=>!x.ok).map(({id,label,detail})=>({id,label,detail}));
  const level=c.status==='BUY'?'BUY':met>=10&&c.score>=60?'NEAR BUY':met>=7&&c.score>=40?'EARLY':'MONITOR';
  const gap=c.breakoutLevel>0&&c.entry>0?round((c.breakoutLevel/c.entry-1)*100,2):null;
  return {level,met,total,percent:round(met/total*100),pending,
    checks:checks.map(({id,label,ok})=>({id,label,ok})),breakoutGapPct:gap};
}


// V1.3 anti-FOMO: severe extensions are a hard block for the early radar.
// CAUTION is informational; nothing here is a forecast or win probability.
export function classifyFomo(c) {
  if (!c || !(c.entry>0) || c.stale || !c.confirmed) {
    return {level:'UNKNOWN',blocked:true,flags:['Data candle belum disahkan atau lapuk']};
  }
  const flags=[];
  const ch=num(c.change24),stretch=num(c.stretch),roc=num(c.roc45),R=num(c.rsi);
  const distance=Number.isFinite(c.entryDistancePct)?c.entryDistancePct:null;
  let severe=false;
  if(ch>=CFG.FOMO_24H_BLOCK){flags.push(`24h sudah naik ${round(ch,2)}% (had ${CFG.FOMO_24H_BLOCK}%)`);severe=true;}
  else if(ch>=CFG.FOMO_24H_CAUTION)flags.push(`24h naik ${round(ch,2)}%: pantau risiko mengejar harga`);
  if(stretch>=CFG.FOMO_EMA_BLOCK){flags.push(`Harga ${round(stretch,2)}% di atas EMA20 (terlalu jauh)`);severe=true;}
  else if(stretch>=CFG.FOMO_EMA_CAUTION)flags.push(`Jarak dari EMA20 ${round(stretch,2)}%`);
  if(roc>=CFG.FOMO_45M_BLOCK){flags.push(`Momentum 45m +${round(roc,2)}% (lonjakan pantas)`);severe=true;}
  else if(roc>5)flags.push(`Momentum 45m +${round(roc,2)}% (tinggi)`);
  if(R>=76){flags.push(`RSI ${round(R,1)} terlalu panas`);severe=true;}
  else if(R>71)flags.push(`RSI ${round(R,1)} menghampiri zon panas`);
  if(distance!==null&&distance>CFG.MAX_ENTRY_ABOVE_SIGNAL_PCT){
    flags.push(`Harga live +${round(distance,2)}% dari rujukan candle: di luar zon entry`);
  }
  return {level:severe?'OVEREXTENDED':flags.length?'CAUTION':'NORMAL',blocked:severe,flags};
}

// Separate explanatory shortlist ranking, NOT the official BUY score.
// Computed only from fresh closed candles with live ticker constraints.
export function assessBreakout(c) {
  const risk=classifyFomo(c);
  const r=c?.readiness||{};
  const gap=Number.isFinite(r.breakoutGapPct)?r.breakoutGapPct:null;
  if (!c?.entry || !c?.confirmed || c?.stale || risk.level==='UNKNOWN') {
    return {stage:'NO_DATA',quality:0,acceleration:null,gapPct:null,risk,
      why:['Data candle tidak lengkap atau tidak segar']};
  }
  const accel=Number.isFinite(c.volumeAccel)?c.volumeAccel:null;
  const liquid=c.volume24>=CFG.SIGNAL_TURNOVER&&c.spread<=CFG.MAX_SPREAD;
  const pendingBreakout=!c.breakout;
  const closeToBreakout=Number.isFinite(gap)&&gap>=0&&gap<=CFG.BREAKOUT_RADAR_GAP;
  const volumeStrong=c.rvol>=CFG.BREAKOUT_RADAR_RVOL;
  const volumeRising=accel!==null&&accel>=CFG.BREAKOUT_RADAR_ACCEL;
  const adxStrong=c.adx>=CFG.MIN_BUY_ADX;
  const trendSupported=c.trend15||c.trend1h;
  const why=[];
  if(closeToBreakout)why.push(`Lagi ${round(gap,2)}% ke breakout 20 candle`);
  else if(Number.isFinite(gap))why.push(gap<0?'Harga telah lepasi paras breakout':'Jarak breakout masih '+round(gap,2)+'%');
  if(volumeStrong)why.push(`RVOL ${round(c.rvol,2)}x`);
  else why.push(`RVOL ${round(c.rvol,2)}x di bawah ${CFG.BREAKOUT_RADAR_RVOL}x`);
  if(accel!==null)why.push(`Pecutan volume 3 candle ${round(accel,2)}x${volumeRising?' (menaik)':accel<.85?' (menurun)':''}`);
  else why.push('Pecutan volume tidak tersedia');
  if(!liquid)why.push('Liquidity / spread tidak cukup');
  const quality=Math.max(0,Math.min(100,Math.round(
    Math.min(35,num(c.score)*.35)+
    (closeToBreakout?18:Number.isFinite(gap)&&gap>=0&&gap<=4?8:0)+
    (volumeStrong?12:0)+(volumeRising?12:0)+
    (adxStrong?7:0)+(trendSupported?10:0)+(liquid?6:0)
    -(risk.level==='CAUTION'?15:0)-(risk.blocked?45:0)
  )));
  let stage='MONITOR';
  if(risk.blocked)stage='OVEREXTENDED';
  else if(!liquid)stage='MONITOR';
  else if(pendingBreakout&&closeToBreakout&&volumeStrong&&volumeRising&&num(c.score)>=40&&trendSupported)stage='EARLY BREAKOUT';
  else if(pendingBreakout&&num(c.score)>=40&&
    ((volumeStrong&&volumeRising)||(closeToBreakout&&adxStrong&&trendSupported)))stage='BUILDING';
  else if((accel!==null&&accel<.85)||num(c.rvol)<.9)stage='COOLING';
  return {stage,quality,acceleration:accel,gapPct:Number.isFinite(gap)?round(gap,2):null,risk,why};
}
