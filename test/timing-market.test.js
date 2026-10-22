import test from 'node:test';
import assert from 'node:assert/strict';
import {Market} from '../market.js';
const now=Date.now();
const raw={symbol:'TRAP-USDT',price:100,change24:3,volume24:20e6,range24:6,spread:.04,
  status:'BUY',score:91,confirmed:true,lastCandle:now-900000,entry:100,
  breakout:true,breakoutLevel:99,rvol:2,volumeAccel:1.5,adx:29,rsi:60,roc45:1.7,
  trend15:true,trend1h:true,stretch:1.2,setup:'BUY',
  timingPattern:{type:'FALSE_BREAKOUT',atr:1,level:100,upperWickRatio:.2},reasons:[]};
test('Closed false-breakout signal vetoes BUY and cannot reappear in near-buy/early breakout shortlists',()=>{
  const m=new Market();m.lastTicker=now;m.lastTechnical=now;
  m.tickers=[{symbol:'TRAP-USDT',price:100,change24:3,volume24:20e6,range24:6,spread:.04}];
  m.analysis.set('TRAP-USDT',raw);
  const d=m.snapshot();
  assert.equal(d.coins[0].status,'WAIT');
  assert.equal(d.coins[0].smartTiming.stage,'FALSE BREAKOUT');
  assert.equal(d.timingWarnings.length,1);
  assert.equal(d.nearBuy.length,0);
  assert.equal(d.breakoutCandidates.length,0);
  assert.equal(d.summary.falseBreakoutCount,1);
});
