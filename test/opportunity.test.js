import test from 'node:test';
import assert from 'node:assert/strict';
import {assessOpportunity,isExcludedBase} from '../opportunity.js';
import {chooseCandidates,analyze} from '../analytics.js';
const ready={symbol:'SOL-USDT',confirmed:true,stale:false,score:76,volume24:13e6,range24:7,
  rvol:1.75,adx:28,spread:0.08,change24:6,trend15:true,trend1h:true,
  breakoutRadar:{risk:{blocked:false}},smartTiming:{stage:'WATCH RESISTANCE',withinZone:true},
  readiness:{breakoutGapPct:0.8}};
test('Excludes stablecoins, including USD-pegged pairs and gold-pegged XAUT',()=>{
  for(const base of ['USDC','DAI','USDE','FDUSD','USDT','PYUSD','XAUT']){
    assert.equal(isExcludedBase(base+'-USDT'),true,base);
  }
  assert.equal(isExcludedBase('BTC-USDT'),false);
  const tickers=[{symbol:'USDC-USDT',price:1,volume24:1e9,spread:0.01,change24:0,range24:0.1},
    {symbol:'SOL-USDT',price:5,volume24:1e7,spread:0.1,change24:4,range24:6}];
  assert.deepEqual(chooseCandidates(tickers,5).map(t=>t.symbol),['SOL-USDT']);
  assert.equal(analyze(tickers[0],[],[]).status,'WAIT');
});
test('Qualified Watch needs real momentum, liquidity, volatility and resistance proximity',()=>{
  const r=assessOpportunity(ready);assert.equal(r.qualified,true);assert.equal(r.label,'QUALIFIED WATCH');
  assert.ok(r.score>50);
});
test('Weak RVOL, ADX, score, range and price too far from breakout are rejected with reasons',()=>{
  const r=assessOpportunity({...ready,score:20,rvol:.3,adx:16,range24:.3,readiness:{breakoutGapPct:4}});
  assert.equal(r.qualified,false);assert.ok(r.reasons.length>=5);
  assert.ok(r.reasons.some(x=>x.includes('RVOL')));
});
test('Overextended and false breakout are not Qualified WATCH even with strong score',()=>{
  assert.equal(assessOpportunity({...ready,change24:70}).qualified,false);
  assert.equal(assessOpportunity({...ready,breakoutRadar:{risk:{blocked:true}}}).qualified,false);
  assert.equal(assessOpportunity({...ready,smartTiming:{stage:'FALSE BREAKOUT'}}).qualified,false);
  assert.equal(assessOpportunity({...ready,symbol:'USDC-USDT'}).qualified,false);
});
