import test from 'node:test';
import assert from 'node:assert/strict';
import {Market} from '../market.js';

test('BUY is withdrawn when ticker price runs outside anti-chase entry zone',()=>{
  const m=new Market();
  m.lastTicker=Date.now();
  m.tickers=[{symbol:'TEST-USDT',price:101.5,change24:2,volume24:10e6,range24:6,spread:.03}];
  const t=Date.now()-900_000;
  m.analysis.set('TEST-USDT',{symbol:'TEST-USDT',status:'BUY',score:90,entry:100,
    lastCandle:t-900_000,confirmed:true,reasons:[],tp1:105,tp2:106,sl:98});
  let snap=m.snapshot();
  assert.equal(snap.coins[0].status,'WAIT');
  assert.ok(snap.coins[0].reasons.some(r=>r.includes('di luar zon')));
  assert.equal(snap.summary.buy,0);
  m.tickers[0].price=100.5;
  snap=m.snapshot();
  assert.equal(snap.coins[0].status,'BUY');
  assert.equal(snap.summary.buy,1);
});
