// Server-memory observation log, not orders or a broker fill simulation.
// Conservative handling: when TP and SL overlap within one OHLC bar, mark
// AMBIGUOUS (no intra-candle sequence can be established).
export const TRACK_WINDOW_MS=24*60*60*1000;
const STEP=15*60*1000;
const RESULT=['WIN','LOSS','AMBIGUOUS','EXPIRED','INCOMPLETE'];
export function evaluateSignalSide(signal,candles,targetPct,prior='PENDING') {
  if (prior!=='PENDING') return prior;
  if (!Array.isArray(candles)||!candles.length) return prior;
  const end=signal.closedAt+TRACK_WINDOW_MS;
  const tp=signal.entry*(1+targetPct/100),sl=signal.entry*.98;
  let expected=signal.closedAt;
  for(const bar of [...candles].sort((a,b)=>a.time-b.time)){
    if (bar.time < signal.closedAt || bar.time+STEP > end) continue;
    if(bar.time>expected) return 'INCOMPLETE';
    expected=bar.time+STEP;
    if (!Number.isFinite(bar.high)||!Number.isFinite(bar.low)||bar.low>bar.high) continue;
    const hitTP=bar.high>=tp,hitSL=bar.low<=sl;
    if(hitTP&&hitSL)return 'AMBIGUOUS';
    if(hitSL)return 'LOSS';
    if(hitTP)return 'WIN';
  }
  // Do not declare EXPIRED simply because wall clock passed: ensure subsequent
  // closed OHLC actually extends to 24h, otherwise call it incomplete.
  if (expected>=end)return 'EXPIRED';
  return prior;
}
export class SignalTracker {
  constructor(){this.records=[];this.keys=new Set();}
  capture(candidate,now=Date.now()){
    if(candidate?.status!=='BUY'||!candidate.confirmed||candidate.entry<=0||!candidate.lastCandle)return false;
    const closedAt=candidate.lastCandle+STEP;
    if(now-closedAt>STEP*2||closedAt>now)return false;
    const key=candidate.symbol+'|'+candidate.lastCandle;
    if(this.keys.has(key))return false;
    const liveDeviation=(candidate.price/candidate.entry-1)*100;
    if(!Number.isFinite(liveDeviation)||liveDeviation<-.5||liveDeviation>1)return false;
    if(this.records.filter(r=>r.outcome5==='PENDING'||r.outcome6==='PENDING').length>=40)return false;
    this.keys.add(key);
    this.records.unshift({id:key,symbol:candidate.symbol,entry:candidate.entry,
      candleTime:candidate.lastCandle,closedAt,score:candidate.score,
      outcome5:'PENDING',outcome6:'PENDING',lastChecked:closedAt});
    if(this.records.length>120){const dropped=this.records.splice(120);for(const d of dropped)this.keys.delete(d.id);}
    return true;
  }
  observe(symbol,candles){
    if(!Array.isArray(candles)||!candles.length)return;
    const newest=candles.at(-1)?.time+STEP;
    for(const rec of this.records){
      if(rec.symbol!==symbol||RESULT.includes(rec.outcome5)&&RESULT.includes(rec.outcome6))continue;
      // Reprocess the entire post-signal window to prevent missed intervals
      // when a candidate rotates out of the 52-symbol technical shortlist.
      const after=candles.filter(c=>c.time>=rec.closedAt);
      rec.outcome5=evaluateSignalSide(rec,after,5,rec.outcome5);
      rec.outcome6=evaluateSignalSide(rec,after,6,rec.outcome6);
      if(after.length)rec.lastChecked=newest;
    }
  }
  activeSymbols(){return [...new Set(this.records.filter(r=>r.outcome5==='PENDING'||r.outcome6==='PENDING').map(r=>r.symbol))];}
  snapshot(){
    const side=key=>{const resolved=this.records.filter(r=>r[key]==='WIN'||r[key]==='LOSS');
      return {win:resolved.filter(r=>r[key]==='WIN').length,loss:resolved.filter(r=>r[key]==='LOSS').length,
        ambiguous:this.records.filter(r=>r[key]==='AMBIGUOUS').length,
        incomplete:this.records.filter(r=>r[key]==='INCOMPLETE').length,
        expired:this.records.filter(r=>r[key]==='EXPIRED').length,
        pending:this.records.filter(r=>r[key]==='PENDING').length,
        rate:resolved.length?Math.round(resolved.filter(r=>r[key]==='WIN').length/resolved.length*1000)/10:null};};
    return {trackingSince:this.records.at(-1)?.closedAt||null,serverMemoryOnly:true,
      total:this.records.length,tp5:side('outcome5'),tp6:side('outcome6'),records:this.records.slice(0,25)};
  }
}
