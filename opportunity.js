// V1.5: screening for watchlist quality, not a promise of returns or an order signal.
export const STABLE_BASES = new Set([
  'USDC','USDT','TUSD','USDD','USDE','USD1','FDUSD','DAI','PYUSD','USDP',
  'GUSD','FRAX','LUSD','SUSD','EURI','EURC','EURCV','EURS','EURQ','RLUSD','USDS',
  'UST','USTC','BUSD','MIM','DJED','USDY','XAUT' // XAUT is gold backed, not volatile crypto momentum
]);
export function isExcludedBase(symbol) {
  const base=String(symbol||'').toUpperCase().split('-')[0];
  return STABLE_BASES.has(base);
}
export const OPPORTUNITY_RULES=Object.freeze({
  minScore:45,minVolume:5_000_000,minRange:4,minRvol:1.15,minAdx:20,maxSpread:0.55,
  maxBreakoutGap:2.5,max24Rise:25,
});
export function assessOpportunity(c){
  const r=OPPORTUNITY_RULES, reasons=[];
  const check=(good,reason)=>{if(!good)reasons.push(reason);};
  if(!c||!c.symbol) return {qualified:false,label:'DATA TIADA',score:0,reasons:['Tiada data coin']};
  if(isExcludedBase(c.symbol)) reasons.push('Stablecoin / aset berpatok: dikecualikan daripada sasaran 4–6%');
  check(c.confirmed===true&&!c.stale,'Candle 15m belum disahkan atau lapuk');
  check(Number(c.score)>=r.minScore,`Radar Score < ${r.minScore}`);
  check(Number(c.volume24)>=r.minVolume,'Volume 24h < USDT 5 juta');
  check(Number(c.range24)>=r.minRange,'Julat 24h < 4%');
  check(Number(c.rvol)>=r.minRvol,'RVOL < 1.15x');
  check(Number(c.adx)>=r.minAdx,'ADX < 20');
  check(Number(c.spread)<=r.maxSpread,'Spread > 0.55%');
  check(c.breakoutRadar?.risk?.blocked!==true,'Anti-FOMO / OVEREXTENDED');
  check(c.smartTiming?.stage!=='FALSE BREAKOUT','Breakout palsu');
  check(Number(c.change24)<r.max24Rise,'Sudah naik ≥25% dalam 24 jam');
  const allowed=new Set(['PULLBACK WATCH','CONFIRMED BREAKOUT','WAIT RETEST','WATCH RESISTANCE']);
  check(allowed.has(c.smartTiming?.stage),'Tiada struktur breakout/retest yang jelas');
  const gap=c.readiness?.breakoutGapPct;
  // For live resistance watch, gap must be near; for a confirmed breakout/retest,
  // recent structure is more informative than the current breakout gap.
  if(c.smartTiming?.stage==='WATCH RESISTANCE'){
    check(Number.isFinite(gap)&&gap>=0&&gap<=r.maxBreakoutGap,'Jarak resistance > 2.5% / data tiada');
  }
  const qualified=reasons.length===0;
  const points=Math.max(0,Math.min(100,Math.round(
    Math.min(35,Number(c.score||0)*.35)+
    (Number(c.rvol)>=1.5?20:Number(c.rvol)>=1.15?12:0)+
    (Number(c.adx)>=25?12:Number(c.adx)>=20?7:0)+
    (Number(c.range24)>=5?10:Number(c.range24)>=4?6:0)+
    (c.trend15?10:0)+(c.trend1h?8:0)+
    (c.smartTiming?.withinZone?5:0)
  )));
  return {qualified,label:qualified?'QUALIFIED WATCH':'DITAPIS',score:points,reasons,
    criteria:'Score ≥45, RVOL ≥1.15x, ADX ≥20, range ≥4%, turnover ≥$5M, spread ≤0.55%'};
}
