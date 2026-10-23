import test from 'node:test';
import assert from 'node:assert/strict';
import {diagnoseScan} from '../public/scan-diagnostics.js';
const now=Date.now();
const mk=(symbol,entry={})=>({symbol,status:'WAIT',score:55,lastCandle:now-900000,confirmed:true,stale:false,
  readiness:{checks:[{id:'score',label:'Radar Score ≥80',ok:false},{id:'breakout',label:'Breakout 20 candle',ok:false}]},
  smartTiming:{stage:'WAIT',risk:'MEDIUM'},breakoutRadar:{risk:{blocked:false}},...entry});
const base={ok:true,summary:{updated:now-5000,analyzedAt:now-10000,dataStale:false,coverage:52,totalPairs:813},
  telegram:{enabled:true},coins:[mk('AAA-USDT'),mk('BBB-USDT',{readiness:{checks:[{id:'score',label:'Radar Score ≥80',ok:true},{id:'breakout',label:'Breakout 20 candle',ok:false}]}})]};
test('identifies gate counts without claiming 24h coverage',()=>{
  const out=diagnoseScan(base,now);
  assert.equal(out.screenedInSnapshot,2);assert.equal(out.finalReady,0);
  assert.equal(out.blockers[0].id,'breakout');assert.equal(out.blockers[0].failed,2);
  assert.match(out.note,/Snapshot semasa/);assert.equal(out.coveragePerScan,52);
});
test('stale or missing candles are excluded from gate denominators',()=>{
 const out=diagnoseScan({...base,coins:[mk('A-USDT',{stale:true}),mk('B-USDT',{confirmed:false})]},now);
 assert.equal(out.screenedInSnapshot,0);assert.equal(out.blockers.length,0);
});
