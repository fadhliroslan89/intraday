import test from 'node:test';
import assert from 'node:assert/strict';
import {assessReadiness, assessBreakout, classifyFomo, analyze} from '../analytics.js';
import {Market} from '../market.js';

const now=Date.now();
function candidate(overrides={}) {
  const c={
    symbol:'TEST-USDT',score:68,status:'WAIT',confirmed:true,stale:false,
    entry:1,price:1,lastCandle:now-900_000,volume24:12e6,spread:.03,
    trend15:true,trend1h:true,breakout:false,breakoutLevel:1.02,
    rvol:1.9,volumeAccel:1.35,adx:26,rsi:60,roc45:2.1,
    range24:8,stretch:1.5,change24:6,entryZoneValid:true,entryDistancePct:0,
    ...overrides,
  };
  c.readiness=assessReadiness(c);
  return c;
}

test('IRYS-type +65% daily move is explicitly blocked as overextended',()=>{
  const c=candidate({change24:65.64,score:41,rvol:.94,volumeAccel:.6});
  const risk=classifyFomo(c),b=assessBreakout(c);
  assert.equal(risk.level,'OVEREXTENDED');
  assert.equal(risk.blocked,true);
  assert.equal(b.stage,'OVEREXTENDED');
  assert.ok(risk.flags.some(x=>x.includes('65.64%')));
});

test('12-25% daily move gives caution without claiming BUY',()=>{
  const c=candidate({change24:13});
  assert.equal(classifyFomo(c).level,'CAUTION');
  assert.equal(assessBreakout(c).stage,'EARLY BREAKOUT');
  assert.equal(c.status,'WAIT');
});

test('candidate near breakout with confirmed volume acceleration is ranked but not BUY',()=>{
  const c=candidate();
  const b=assessBreakout(c);
  assert.equal(b.stage,'EARLY BREAKOUT');
  assert.ok(b.quality>=50);
  assert.equal(c.status,'WAIT');
  assert.equal(b.acceleration,1.35);
});

test('absence of volume acceleration never produces EARLY BREAKOUT',()=>{
  assert.notEqual(assessBreakout(candidate({volumeAccel:null})).stage,'EARLY BREAKOUT');
  assert.notEqual(assessBreakout(candidate({volumeAccel:.8})).stage,'EARLY BREAKOUT');
  assert.notEqual(assessBreakout(candidate({rvol:.6})).stage,'EARLY BREAKOUT');
});

test('missing/stale OHLC data never creates an early-radar candidate',()=>{
  assert.equal(assessBreakout(candidate({entry:0})).stage,'NO_DATA');
  assert.equal(assessBreakout(candidate({confirmed:false})).stage,'NO_DATA');
  assert.equal(assessBreakout(candidate({stale:true})).stage,'NO_DATA');
});

test('snapshot excludes overextended from both opportunities and near BUY',()=>{
  const m=new Market();m.lastTicker=Date.now();
  m.tickers=[
    {symbol:'IRYS-USDT',price:1,change24:65.64,volume24:12e6,range24:70,spread:.03},
    {symbol:'EARLY-USDT',price:1,change24:6,volume24:12e6,range24:8,spread:.03},
  ];
  m.analysis.set('IRYS-USDT',candidate({symbol:'IRYS-USDT',status:'WATCH',change24:65.64,score:75}));
  m.analysis.set('EARLY-USDT',candidate({symbol:'EARLY-USDT'}));
  const x=m.snapshot();
  assert.equal(x.coins.find(c=>c.symbol==='IRYS-USDT').status,'WAIT');
  assert.equal(x.overextendedCandidates.length,1);
  assert.equal(x.overextendedCandidates[0].symbol,'IRYS-USDT');
  assert.ok(x.breakoutCandidates.some(c=>c.symbol==='EARLY-USDT'));
  assert.ok(!x.breakoutCandidates.some(c=>c.symbol==='IRYS-USDT'));
  assert.ok(!x.nearBuy.some(c=>c.symbol==='IRYS-USDT'));
});

test('volume acceleration uses only the most recent closed 3 vs preceding 3 candles',()=>{
  const n=210,t=Date.now();
  const c15=Array.from({length:n},(_,i)=>({time:t-(n-i)*900_000,close:100+i*.04,open:100+i*.04,high:101+i*.04,low:99+i*.04,turnover:50000,volume:1000}));
  for(let i=n-3;i<n;i++)c15[i].turnover=75000;
  const h=Array.from({length:90},(_,i)=>({time:t-(90-i)*3600_000,close:100+i*.1,open:100+i*.1,high:101+i*.1,low:99+i*.1,turnover:500000,volume:1000}));
  const info=analyze({symbol:'TEST-USDT',price:109,change24:5,volume24:12e6,range24:7,spread:.02},c15,h,t);
  assert.equal(info.volumeAccel,1.5);
  assert.ok(info.lastCandle>0);
});
