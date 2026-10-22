import {assessEntryTiming} from './timing.js';
import {SignalTracker} from './signal-tracker.js';
import {CFG, normalizeTicker, parseCandles, analyze, chooseCandidates, round, assessReadiness, assessBreakout} from './analytics.js';
const HOST='https://api.kucoin.com';
const HEADERS={'User-Agent':'KuCoin-Daily-Radar/1.0','Accept':'application/json'};
const intervalMs={ '15min':900_000, '1hour':3_600_000 };

async function kucoin(path,tries=2) {
  let last;
  for(let attempt=0;attempt<tries;attempt++){
    try {
      const res=await fetch(HOST+path,{headers:HEADERS,signal:AbortSignal.timeout(11_000)});
      if(!res.ok)throw new Error(`KuCoin HTTP ${res.status}`);
      const body=await res.json();
      if(body.code!=='200000')throw new Error(`KuCoin code ${body.code||'unknown'}`);
      return body.data;
    }catch(e) {last=e; if(attempt<tries-1)await new Promise(r=>setTimeout(r,650));}
  }
  throw last;
}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
export class Market {
  constructor(){
    this.tickers=[];this.analysis=new Map();this.cache=new Map();this.lastTicker=0;
    this.lastTechnical=0;this.scanRunning=false;this.nextRotation=0;this.error='';
    this.startTime=Date.now();this.totalSymbols=0;this.lastRunCandidate=0;
    this.symSet=null;this.nextMeta=0;this.signalTracker=new SignalTracker();
  }
  async init(){
    await this.updateTickers();
    await this.updateAnalysis();
  }
  async updateSymbols(){
    if(Date.now()<this.nextMeta)return;
    this.nextMeta=Date.now()+6*3_600_000;
    try{
      const data=await kucoin('/api/v2/symbols');
      if(Array.isArray(data))this.symSet=new Set(data.filter(s=>s.quoteCurrency==='USDT'&&s.enableTrading!==false).map(s=>s.symbol));
    }catch(e){console.warn('Symbols metadata unavailable:',e.message);}
  }
  async updateTickers(){
    try{
      const data=await kucoin('/api/v1/market/allTickers');
      const list=Array.isArray(data?.ticker)?data.ticker:[];
      if(!list.length)throw new Error('KuCoin returned an empty ticker list');
      this.tickers=list.filter(t=>/^[A-Z0-9]+-USDT$/.test(t.symbol)&&
        (!this.symSet||this.symSet.has(t.symbol)))
        .map(normalizeTicker).filter(t=>t.price>0);
      this.lastTicker=Date.now();this.totalSymbols=this.tickers.length;this.error='';
      await this.updateSymbols();
    }catch(e){this.error=`Ticker: ${e.message}`;console.error(this.error);}
  }
  async candles(symbol,type){
    const key=symbol+'|'+type, existing=this.cache.get(key),now=Date.now();
    if(existing&&existing.expires>now)return existing.data;
    const period=intervalMs[type], need=type==='15min'?242:90;
    const qs=new URLSearchParams({symbol,type,startAt:String(Math.floor((now-period*need)/1000)),endAt:String(Math.floor(now/1000))});
    const data=await kucoin('/api/v1/market/candles?'+qs);
    const parsed=parseCandles(data,type==='15min'?15:60,now);
    if(!parsed.length)throw new Error(`Empty ${type} candles for ${symbol}`);
    // Refresh shortly after next candle closes; also guard cache against very long sleeps.
    const nextBoundary=Math.floor(now/period)*period+period+12_000;
    this.cache.set(key,{data:parsed,expires:Math.min(now+period+15_000,nextBoundary)});
    if(this.cache.size>600){const first=this.cache.keys().next().value;this.cache.delete(first);}
    return parsed;
  }
  async updateAnalysis(){
    if(this.scanRunning)return;
    this.scanRunning=true;
    const start=Date.now();
    try{
      if(!this.tickers.length)return;
      const candidates=chooseCandidates(this.tickers,CFG.MAX_CANDIDATES,this.nextRotation);
      // Reserve up to 8 technical slots for pending tracked signals, otherwise
      // rotating shortlist selection could prevent observation of TP/SL bars.
      const present=new Set(candidates.map(c=>c.symbol));
      const tickerBySymbol=new Map(this.tickers.map(t=>[t.symbol,t]));
      let reserve=0;
      for(const symbol of this.signalTracker.activeSymbols()){
        if(present.has(symbol)||reserve>=8)continue;
        const t=tickerBySymbol.get(symbol);if(!t)continue;
        candidates[candidates.length-1-reserve]=t;present.add(symbol);reserve++;
      }
      this.nextRotation+=17;
      this.lastRunCandidate=candidates.length;
      let index=0;
      const worker=async()=>{
        while(index<candidates.length){
          const t=candidates[index++];
          try{
            const [fifteen,hour]=await Promise.all([this.candles(t.symbol,'15min'),this.candles(t.symbol,'1hour')]);
            this.signalTracker.observe(t.symbol,fifteen);
            const result=analyze(t,fifteen,hour);
            // Server captures a BUY only if the live ticker still falls within
            // the anti-chase zone and the candle is recent/fully closed.
            this.signalTracker.capture(result);
            this.analysis.set(t.symbol,result);
          }catch(e){
            console.warn(`Candle ${t.symbol}: ${e.message}`);
            // Never manufacture a BUY status when technical candles unavailable.
            const old=this.analysis.get(t.symbol);
            if(!old)this.analysis.set(t.symbol,{...t,status:'WAIT',score:0,confirmed:false,setup:'Candle tidak tersedia',reasons:[e.message],spark:[]});
          }
          await delay(110); // gentle per-worker pacing
        }
      };
      await Promise.all(Array.from({length:4},worker));
      this.lastTechnical=Date.now();
      if(this.analysis.size>160){
        const keep=new Set(candidates.map(c=>c.symbol));
        for(const symbol of this.analysis.keys()){if(this.analysis.size<=120)break;if(!keep.has(symbol))this.analysis.delete(symbol);}
      }
    }finally{this.scanRunning=false;console.log(`Analysis: ${this.lastRunCandidate} candidates / ${Date.now()-start}ms`);}
  }
  snapshot(){
    const tickers=[...this.tickers];const prices=new Map(tickers.map(t=>[t.symbol,t]));
    const selected=[];
    for(const [symbol,a] of this.analysis){
      const t=prices.get(symbol);if(!t)continue;
      // For live price/24h fields use fresh allTickers; signal is based on last CLOSED candle.
      const {symbol:_,price:__,change24:___,volume24:____,range24:_____,high24:______,low24:_______,spread:________,...technicals}=a;
      const isOld=a.lastCandle && (Date.now() - a.lastCandle)>60*60_000;
      const freshnessExpired=a.lastCandle && Date.now()-(a.lastCandle+15*60_000)>30*60_000;
      const distancePct=a.entry>0 ? (t.price/a.entry-1)*100 : null;
      const priceDiverged=a.status==='BUY'&&a.entry>0&&(
        distancePct < -CFG.MAX_ENTRY_BELOW_SIGNAL_PCT || distancePct > CFG.MAX_ENTRY_ABOVE_SIGNAL_PCT);
      const suppressed=isOld||freshnessExpired;
      const status=suppressed||priceDiverged?'WAIT':a.status;
      const reasons=[...(a.reasons||[])];
      if(priceDiverged) reasons.push('BUY dibatalkan: harga live di luar zon entry (-'+CFG.MAX_ENTRY_BELOW_SIGNAL_PCT+'% / +'+CFG.MAX_ENTRY_ABOVE_SIGNAL_PCT+'% daripada candle signal)');
      if(suppressed)reasons.push('Signal tamat tempoh: data candle lama, tunggu scan baru');
      const item={...t,...technicals,status,reasons,confirmed:!suppressed&&!!a.confirmed,
        stale:!!suppressed,entryDistancePct:distancePct===null?null:round(distancePct,2),
        entryZoneLow:a.entry>0?a.entry*(1-CFG.MAX_ENTRY_BELOW_SIGNAL_PCT/100):0,
        entryZoneHigh:a.entry>0?a.entry*(1+CFG.MAX_ENTRY_ABOVE_SIGNAL_PCT/100):0,
        entryZoneValid:a.entry>0&&!suppressed&&!priceDiverged&&
          distancePct>=-CFG.MAX_ENTRY_BELOW_SIGNAL_PCT&&distancePct<=CFG.MAX_ENTRY_ABOVE_SIGNAL_PCT};
      item.readiness=assessReadiness(item);
      item.breakoutRadar=assessBreakout(item);
      item.smartTiming=assessEntryTiming(item);
      // Anti-FOMO hard block: even a cached WATCH/BUY does not become a live
      // recommendation while the live 24h move or closed candles are extreme.
      if(item.breakoutRadar.risk.blocked && item.breakoutRadar.risk.level==='OVEREXTENDED'){
        if(item.status!=='WAIT')item.reasons.push('Anti-FOMO: setup dipadam daripada BUY/WATCH kerana harga OVEREXTENDED');
        item.status='WAIT';
        item.setup='OVEREXTENDED · elak kejar harga';
      }
      // A confirmed false-breakout candle is a veto, never an entry signal.
      if(item.smartTiming.stage==='FALSE BREAKOUT'){
        if(item.status!=='WAIT')item.reasons.push('Smart Timing: close candle mengesahkan breakout gagal');
        item.status='WAIT';item.setup='FALSE BREAKOUT · tunggu struktur baharu';
      }
      item.readiness=assessReadiness(item);
      selected.push(item);
    }
    selected.sort((a,b)=>b.score-a.score||b.volume24-a.volume24);
    // Informational only: readiness does not alter BUY / WATCH / WAIT classification.
    // Exclude BUY (already displayed in priority) and stale/missing OHLC candidates.
    const eligibleReadiness=selected.filter(c=>c.readiness.level!=='NONE'&&c.status!=='BUY'&&
      !c.breakoutRadar.risk.blocked&&c.smartTiming?.stage!=='FALSE BREAKOUT');
    const priorityOrder={'NEAR BUY':0,EARLY:1,MONITOR:2};
    eligibleReadiness.sort((a,b)=>priorityOrder[a.readiness.level]-priorityOrder[b.readiness.level]||
      b.readiness.met-a.readiness.met||b.score-a.score||b.volume24-a.volume24);
    const nearBuy=eligibleReadiness.filter(c=>c.readiness.level==='NEAR BUY').slice(0,8);
    const earlyMomentum=eligibleReadiness.filter(c=>c.readiness.level==='EARLY').slice(0,8);
    const monitorOnly=eligibleReadiness.filter(c=>c.readiness.level==='MONITOR').slice(0,3);
    // Risk alert cards remain visible separately (not as opportunity signals).
    const safeRadar=selected.filter(c=>!c.breakoutRadar.risk.blocked&&
      ['EARLY BREAKOUT','BUILDING'].includes(c.breakoutRadar.stage)&&c.smartTiming?.stage!=='FALSE BREAKOUT');
    safeRadar.sort((a,b)=>b.breakoutRadar.quality-a.breakoutRadar.quality||b.volume24-a.volume24);
    const overextended=selected.filter(c=>c.breakoutRadar.stage==='OVEREXTENDED')
      .sort((a,b)=>b.change24-a.change24);
    const timingEligible=selected.filter(c=>c.smartTiming&&c.smartTiming.stage!=='NO_DATA');
    const timingOpportunities=timingEligible.filter(c=>['PULLBACK WATCH','CONFIRMED BREAKOUT','WAIT RETEST','WATCH RESISTANCE'].includes(c.smartTiming.stage)&&
      c.breakoutRadar?.risk?.blocked!==true).sort((a,b)=>{
        const aRank={'PULLBACK WATCH':0,'CONFIRMED BREAKOUT':1,'WAIT RETEST':2,'WATCH RESISTANCE':3}[a.smartTiming.stage]??4;
        const bRank={'PULLBACK WATCH':0,'CONFIRMED BREAKOUT':1,'WAIT RETEST':2,'WATCH RESISTANCE':3}[b.smartTiming.stage]??4;
        return aRank-bRank||b.score-a.score;
      });
    const timingWarnings=timingEligible.filter(c=>c.smartTiming.stage==='FALSE BREAKOUT')
      .sort((a,b)=>b.volume24-a.volume24);
    const summary={
      totalPairs:tickers.length, analyzed:selected.filter(x=>x.confirmed).length,
      buy:selected.filter(x=>x.status==='BUY').length,watch:selected.filter(x=>x.status==='WATCH').length,
      totalVolume:round(tickers.reduce((s,x)=>s+x.volume24,0)),
      updated:this.lastTicker, analyzedAt:this.lastTechnical,
      dataStale:Date.now()-this.lastTicker>90_000,
      candleScanRunning:this.scanRunning,coverage:this.lastRunCandidate,
      nearCount:eligibleReadiness.filter(c=>c.readiness.level==='NEAR BUY').length,
      earlyCount:eligibleReadiness.filter(c=>c.readiness.level==='EARLY').length,
      breakoutCount:safeRadar.filter(c=>c.breakoutRadar.stage==='EARLY BREAKOUT').length,
      buildingCount:safeRadar.filter(c=>c.breakoutRadar.stage==='BUILDING').length,
      overextendedCount:overextended.length,
      timingCount:timingOpportunities.length,falseBreakoutCount:timingWarnings.length,
    };
    return {ok:this.lastTicker>0&&!summary.dataStale,summary,coins:selected.slice(0,130),
      nearBuy,earlyMomentum,monitorOnly,
      breakoutCandidates:safeRadar.slice(0,8),overextendedCandidates:overextended.slice(0,8),
      timingCandidates:timingOpportunities.slice(0,8),timingWarnings:timingWarnings.slice(0,8),
      signalPerformance:this.signalTracker.snapshot(),
      marketTickers:tickers.map(t=>({symbol:t.symbol,price:t.price,change24:t.change24,volume24:t.volume24})),
      error:this.error,config:CFG};
  }
}
