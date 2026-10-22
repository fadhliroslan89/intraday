import test from 'node:test';
import assert from 'node:assert/strict';
import {Market} from '../market.js';
const now=Date.now(), candle=now-900000;
const t=(symbol,over={})=>({symbol,price:100,change24:5,volume24:12e6,range24:7,spread:.03,...over});
const a=(symbol,over={})=>({symbol,price:100,change24:5,volume24:12e6,range24:7,spread:.03,
  status:'WAIT',score:70,confirmed:true,lastCandle:candle,entry:100,breakout:false,breakoutLevel:101,
  rvol:1.7,volumeAccel:1.35,adx:27,rsi:60,roc45:2,trend15:true,trend1h:true,stretch:.8,
  timingPattern:{type:'NEAR_RESISTANCE',atr:1.8,level:101,upperWickRatio:.14},reasons:[],...over});
test('Market snapshot places strong resistance watch in QUALIFIED, weak one in REJECTED, stablecoin outside timing candidates',()=>{
  const m=new Market();m.lastTicker=now;
  m.tickers=[t('SOL-USDT'),t('WEAK-USDT',{range24:1}),t('USDC-USDT',{price:1,range24:.03})];
  m.analysis.set('SOL-USDT',a('SOL-USDT'));
  m.analysis.set('WEAK-USDT',a('WEAK-USDT',{score:22,rvol:.5,adx:16,range24:1}));
  m.analysis.set('USDC-USDT',a('USDC-USDT',{entry:1,price:1,score:30,rvol:.2,range24:.03,breakoutLevel:1.0002}));
  const d=m.snapshot();
  assert.deepEqual(d.timingCandidates.map(x=>x.symbol),['SOL-USDT']);
  assert.deepEqual(d.timingRejected.map(x=>x.symbol),['WEAK-USDT']);
  assert.equal(d.summary.stablecoinExcluded,1);
  assert.equal(d.summary.timingCount,1);
  assert.equal(d.summary.filteredCount,1);
  assert.equal(d.coins.find(x=>x.symbol==='USDC-USDT').status,'WAIT');
  assert.ok(d.timingRejected[0].opportunity.reasons.length>=3);
});
