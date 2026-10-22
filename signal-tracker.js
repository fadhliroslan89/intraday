// Paper signal observation only; no order placement or broker fill inference.
// Conservative OHLC handling: simultaneous TP & SL is AMBIGUOUS.
export const TRACK_WINDOW_MS=24*60*60*1000;
const STEP=15*60*1000;
const TERMINAL=['WIN','LOSS','AMBIGUOUS','EXPIRED','INCOMPLETE'];
export const COST=Object.freeze({feePctPerSide:0.10,slippagePctPerSide:0.10});
export function requiredGrossPctForNet(netPct,fee=COST.feePctPerSide,slippage=COST.slippagePctPerSide){
  const cost=(fee+slippage)/100;
  return ((1+netPct/100)*(1+cost)/(1-cost)-1)*100;
}
export function estimatedNetPct(grossPct,fee=COST.feePctPerSide,slippage=COST.slippagePctPerSide){
  const cost=(fee+slippage)/100;
  return ((1+grossPct/100)*(1-cost)/(1+cost)-1)*100;
}
export function evaluateSignalSide(signal,candles,targetPct,prior='PENDING') {
  if(prior!=='PENDING')return prior;
  if(!Array.isArray(candles)||!candles.length)return prior;
  const end=signal.closedAt+TRACK_WINDOW_MS;
  const tp=signal.entry*(1+targetPct/100),sl=signal.entry*.98;
  let expected=signal.closedAt;
  for(const bar of [...candles].sort((a,b)=>a.time-b.time)){
    if(bar.time<signal.closedAt||bar.time+STEP>end)continue;
    if(bar.time>expected)return 'INCOMPLETE';
    expected=bar.time+STEP;
    if(!Number.isFinite(bar.high)||!Number.isFinite(bar.low)||bar.low>bar.high)continue;
    const hitTP=bar.high>=tp,hitSL=bar.low<=sl;
    if(hitTP&&hitSL)return 'AMBIGUOUS';
    if(hitSL)return 'LOSS';
    if(hitTP)return 'WIN';
  }
  return expected>=end?'EXPIRED':prior;
}
export class SignalTracker{
  constructor(onChange=()=>{}){this.records=[];this.keys=new Set();this.onChange=onChange;}
  restore(records){
    if(!Array.isArray(records))return 0;
    const seen=new Set();
    this.records=records.filter(r=>{
      if(!r||typeof r.id!=='string'||typeof r.symbol!=='string'||!Number.isFinite(Number(r.entry))||
        !Number.isFinite(Number(r.closedAt))||seen.has(r.id))return false;
      seen.add(r.id);return true;
    }).slice(0,2000).map(r=>({
      ...r,
      outcome5Net:r.outcome5Net||'PENDING',
      outcome6Net:r.outcome6Net||'PENDING'
    }));
    this.keys=new Set(this.records.map(r=>r.id));return this.records.length;
  }
  capture(candidate,now=Date.now()){
    if(candidate?.status!=='BUY'||!candidate.confirmed||candidate.entry<=0||!candidate.lastCandle)return false;
    const closedAt=candidate.lastCandle+STEP;
    if(now-closedAt>STEP*2||closedAt>now)return false;
    const key=candidate.symbol+'|'+candidate.lastCandle;
    if(this.keys.has(key))return false;
    const liveDeviation=(candidate.price/candidate.entry-1)*100;
    if(!Number.isFinite(liveDeviation)||liveDeviation<-.5||liveDeviation>1)return false;
    if(this.activeSymbols().length>=40)return false;
    this.keys.add(key);
    this.records.unshift({id:key,symbol:candidate.symbol,entry:candidate.entry,
      candleTime:candidate.lastCandle,closedAt,score:candidate.score,
      outcome5:'PENDING',outcome6:'PENDING',outcome5Net:'PENDING',outcome6Net:'PENDING',lastChecked:closedAt});
    if(this.records.length>2000){const dropped=this.records.splice(2000);for(const d of dropped)this.keys.delete(d.id);}
    this.onChange();return true;
  }
  observe(symbol,candles){
    if(!Array.isArray(candles)||!candles.length)return;
    const newest=candles.at(-1)?.time+STEP;
    let dirty=false;
    for(const rec of this.records){
      if(rec.symbol!==symbol||['outcome5','outcome6','outcome5Net','outcome6Net'].every(k=>TERMINAL.includes(rec[k])))continue;
      const after=candles.filter(c=>c.time>=rec.closedAt);
      if(!after.length){
        if(Date.now()>rec.closedAt+TRACK_WINDOW_MS+60*60*1000){
          for(const k of ['outcome5','outcome6','outcome5Net','outcome6Net']){
            if(rec[k]==='PENDING'){rec[k]='INCOMPLETE';dirty=true;}
          }
        }
        continue;
      }
      const prev=[rec.outcome5,rec.outcome6,rec.outcome5Net,rec.outcome6Net].join('|');
      rec.outcome5=evaluateSignalSide(rec,after,5,rec.outcome5);
      rec.outcome6=evaluateSignalSide(rec,after,6,rec.outcome6);
      rec.outcome5Net=evaluateSignalSide(rec,after,requiredGrossPctForNet(5),rec.outcome5Net);
      rec.outcome6Net=evaluateSignalSide(rec,after,requiredGrossPctForNet(6),rec.outcome6Net);
      if(prev!==[rec.outcome5,rec.outcome6,rec.outcome5Net,rec.outcome6Net].join('|'))dirty=true;
      rec.lastChecked=newest;
    }
    if(dirty)this.onChange();
  }
  activeSymbols(){return [...new Set(this.records.filter(r=>
    ['outcome5','outcome6','outcome5Net','outcome6Net'].some(k=>!TERMINAL.includes(r[k]))).map(r=>r.symbol))];}
  snapshot(){
    const side=key=>{
      const wins=this.records.filter(r=>r[key]==='WIN').length;
      const losses=this.records.filter(r=>r[key]==='LOSS').length;
      return {win:wins,loss:losses,
        ambiguous:this.records.filter(r=>r[key]==='AMBIGUOUS').length,
        incomplete:this.records.filter(r=>r[key]==='INCOMPLETE').length,
        expired:this.records.filter(r=>r[key]==='EXPIRED').length,
        pending:this.records.filter(r=>r[key]==='PENDING').length,
        rate:wins+losses?Math.round(wins/(wins+losses)*1000)/10:null};
    };
    return {trackingSince:this.records.at(-1)?.closedAt||null,total:this.records.length,
      tp5:side('outcome5'),tp6:side('outcome6'),
      tp5Net:side('outcome5Net'),tp6Net:side('outcome6Net'),
      costs:{...COST,requiredGross5:requiredGrossPctForNet(5),requiredGross6:requiredGrossPctForNet(6),
        estimatedNetAtGross5:estimatedNetPct(5),estimatedNetAtGross6:estimatedNetPct(6),
        estimatedNetAtGrossStop:estimatedNetPct(-2)},
      records:this.records.slice(0,35)};
  }
}
