// Informational analysis of CLOSED 15m candles, not executable order levels.
// All thresholds are heuristics and can miss or misclassify reversals.
const round=(n,p=2)=>Number.isFinite(n)?Number(n.toFixed(p)):0;
const maxHigh=c=>Math.max(...c.map(x=>x.high));
export function detectTimingPattern(candles){
  const empty={type:'NO_DATA',atr:null,level:null,recentBreakoutAt:null,bodyRatio:null,closePosition:null,upperWickRatio:null};
  if(!Array.isArray(candles)||candles.length<35)return empty;
  const c=candles,cur=c.at(-1),prior=c.at(-2),n=c.length;
  const TR=c.slice(-14).map((bar,i)=>{
    const prev=c[n-14+i-1];return Math.max(bar.high-bar.low,Math.abs(bar.high-prev.close),Math.abs(bar.low-prev.close));
  });
  const atr=TR.reduce((a,b)=>a+b,0)/TR.length;
  const range=Math.max(cur.high-cur.low,0);
  const bodyRatio=range>0?Math.abs(cur.close-cur.open)/range:0;
  const closePosition=range>0?(cur.close-cur.low)/range:.5;
  const upperWickRatio=range>0?(cur.high-Math.max(cur.open,cur.close))/range:0;
  const currentLevel=maxHigh(c.slice(-21,-1))*1.001;
  let recent=null;
  // A breakout in one of the previous five CLOSED bars, tested against the
  // 20 bars that preceded that bar. Never include current bar's high in its own resistance.
  for(let i=n-2;i>=Math.max(21,n-6);i--){
    const candidateLevel=maxHigh(c.slice(i-20,i))*1.001;
    if(c[i].close>candidateLevel){recent={time:c[i].time,level:candidateLevel};break;}
  }
  let type='BASE';
  // Recent confirmed breakout lost on the latest close: first-class trap warning.
  if(recent && cur.close<recent.level*.998)type='FALSE_BREAKOUT';
  else if(cur.high>currentLevel&&cur.close<currentLevel*.998&&upperWickRatio>=.40)type='WICK_REJECTION';
  else if(cur.close>currentLevel&&bodyRatio>=.45&&closePosition>=.70)type='STRONG_BREAKOUT';
  else if(cur.close>currentLevel)type='WEAK_BREAKOUT';
  else if(recent&&cur.low<=recent.level+atr*.35&&cur.close>=recent.level&&cur.close>cur.open)type='PULLBACK_HOLD';
  else if(recent&&cur.close>=recent.level)type='WAIT_RETEST';
  else if(cur.close>=currentLevel*.975&&cur.close<currentLevel)type='NEAR_RESISTANCE';
  const level=recent&&['FALSE_BREAKOUT','PULLBACK_HOLD','WAIT_RETEST'].includes(type)?recent.level:currentLevel;
  return {type,atr:round(atr,10),level:round(level,10),recentBreakoutAt:recent?.time||null,
    bodyRatio:round(bodyRatio,3),closePosition:round(closePosition,3),upperWickRatio:round(upperWickRatio,3)};
}
export function assessEntryTiming(c){
  const pat=c?.timingPattern;
  const bad={stage:'NO_DATA',risk:'HIGH',riskReasons:['Candle tidak cukup atau telah lapuk'],
    entryZoneLow:null,entryZoneHigh:null,withinZone:false,atrPct:null,notes:['Tiada signal entry']};
  if(!c?.confirmed||c?.stale||!pat?.level||!pat.atr||!c.entry||!c.price)return bad;
  const risk=c.breakoutRadar?.risk||{blocked:false,level:'UNKNOWN'};
  const liquid=c.volume24>=5e6&&c.spread<=.55;
  const riskReasons=[];
  if(risk.blocked)riskReasons.push('Anti-FOMO: terlalu jauh / melonjak');
  if(!liquid)riskReasons.push('Liquidity atau spread tidak memadai');
  if(['FALSE_BREAKOUT','WICK_REJECTION'].includes(pat.type))riskReasons.push('Breakout gagal pada candle tertutup');
  if(pat.upperWickRatio>=.42)riskReasons.push('Upper wick tinggi: tekanan jual di paras atas');
  if(c.rvol<1.3)riskReasons.push('RVOL di bawah 1.3x');
  if(c.adx<22)riskReasons.push('ADX di bawah 22');
  if(c.stretch>3.5)riskReasons.push('Harga terlalu jauh dari EMA20');
  if(c.volumeAccel!==null&&c.volumeAccel<.80)riskReasons.push('Volume tiga candle semakin lemah');
  let stage='WAIT';
  if(risk.blocked)stage='OVEREXTENDED';
  else if(['FALSE_BREAKOUT','WICK_REJECTION'].includes(pat.type))stage='FALSE BREAKOUT';
  else if(pat.type==='PULLBACK_HOLD'&&liquid)stage='PULLBACK WATCH';
  else if(pat.type==='STRONG_BREAKOUT'&&liquid&&c.rvol>=1.3)stage='CONFIRMED BREAKOUT';
  else if(pat.type==='WEAK_BREAKOUT'||pat.type==='WAIT_RETEST')stage='WAIT RETEST';
  else if(pat.type==='NEAR_RESISTANCE'&&liquid)stage='WATCH RESISTANCE';
  // Entry zone is a reference near a previously computed 20-candle high,
  // NOT a buy limit instruction; no zone is offered on false breakouts or severe risk.
  const blocked=['OVEREXTENDED','FALSE BREAKOUT','WAIT'].includes(stage);
  const low=!blocked?pat.level:null;
  const high=!blocked?pat.level+Math.min(.5*pat.atr,.008*pat.level):null;
  const withinZone=low!==null&&c.price>=low&&c.price<=high;
  if(!blocked&&!withinZone)riskReasons.push('Harga live di luar zon rujukan: tunggu, jangan kejar');
  const highRisk=blocked||!liquid||pat.upperWickRatio>=.55||c.stretch>3.5||risk.level==='CAUTION';
  const rating=highRisk?'HIGH':riskReasons.length||!withinZone?'MEDIUM':'LOW';
  const notes=[
    pat.type==='FALSE_BREAKOUT'?'Close telah kembali di bawah paras breakout terdahulu':
    pat.type==='WICK_REJECTION'?'Harga melepasi resistance tetapi candle tutup semula di bawah':
    pat.type==='PULLBACK_HOLD'?'Candle menguji semula resistance lama dan tutup di atasnya':
    pat.type==='STRONG_BREAKOUT'?'Candle breakout bertutup dekat bahagian atas dengan badan kukuh':
    pat.type==='WEAK_BREAKOUT'?'Close atas resistance tetapi candle belum kukuh':
    pat.type==='WAIT_RETEST'?'Breakout lepas: tunggu uji semula paras rujukan':
    'Belum ada pengesahan entry pada candle tertutup',
    ...(low!==null&&!withinZone?['Harga live bukan dalam zon rujukan']:[]),
  ];
  return {stage,risk:rating,riskReasons,entryZoneLow:low===null?null:round(low,10),
    entryZoneHigh:high===null?null:round(high,10),withinZone,
    atrPct:round(pat.atr/c.entry*100),candleType:pat.type,
    level:pat.level,bodyRatio:pat.bodyRatio,upperWickRatio:pat.upperWickRatio,notes};
}
