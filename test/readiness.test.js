import test from 'node:test';
import assert from 'node:assert/strict';
import {assessReadiness} from '../analytics.js';
import {Market} from '../market.js';

const now=Date.now();
function candidate(overrides={}) {
  return {
    symbol:'SAMPLE-USDT',score:84,status:'WAIT',confirmed:true,stale:false,
    entry:100,price:100.2,lastCandle:now-900_000,
    trend15:true,trend1h:true,breakout:true,breakoutLevel:99,
    rvol:1.8,adx:25,rsi:58,roc45:1.3,volume24:8e6,spread:.04,
    range24:6,stretch:1.5,change24:4,entryZoneValid:true,entryDistancePct:.2,
    ...overrides,
  };
}

test('near BUY means 10/13 checks and NOT BUY, with clear remaining blockers',()=>{
  const v=candidate({score:74,breakout:false,breakoutLevel:101,rvol:1.2});
  const r=assessReadiness(v);
  assert.equal(r.total,13);
  assert.equal(r.met,10);
  assert.equal(r.level,'NEAR BUY');
  assert.deepEqual(r.pending.map(x=>x.id),['score','breakout','rvol']);
  assert.ok(r.breakoutGapPct>0);
});

test('7/13 passing checks falls into EARLY only, not BUY',()=>{
  const r=assessReadiness(candidate({score:65,trend1h:false,breakout:false,rvol:.8,adx:18,change24:17,stretch:4}));
  assert.equal(r.met,7);
  assert.equal(r.level,'EARLY');
});

test('expiry / missing candles exclude readiness and do not invent a signal',()=>{
  assert.equal(assessReadiness(candidate({stale:true})).level,'NONE');
  assert.equal(assessReadiness(candidate({confirmed:false})).level,'NONE');
  assert.equal(assessReadiness(candidate({entry:0})).level,'NONE');
  assert.equal(assessReadiness(candidate({status:'BUY'})).level,'BUY');
});

test('server snapshot ranks near BUY without modifying existing BUY/WAIT classification',()=>{
  const m=new Market();m.lastTicker=Date.now();
  m.tickers=[{symbol:'SAMPLE-USDT',price:100.2,change24:4,volume24:8e6,range24:6,spread:.04}];
  m.analysis.set('SAMPLE-USDT',candidate({score:74,breakout:false,rvol:1.2}));
  const s=m.snapshot();
  assert.equal(s.summary.buy,0);
  assert.equal(s.coins[0].status,'WAIT');
  assert.equal(s.nearBuy.length,1);
  assert.equal(s.earlyMomentum.length,0);
  assert.equal(s.summary.nearCount,1);
  assert.equal(s.nearBuy[0].readiness.level,'NEAR BUY');
});
