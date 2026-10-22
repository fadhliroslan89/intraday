import test from 'node:test';
import assert from 'node:assert/strict';
import {SignalStore} from '../signal-store.js';
import {SignalTracker,evaluateSignalSide,estimatedNetPct,requiredGrossPctForNet} from '../signal-tracker.js';
const step=900_000;
test('Cost-adjusted net 5/6 target requires a higher gross move; gross stop is worse net',()=>{
  assert.ok(requiredGrossPctForNet(5)>5.4&&requiredGrossPctForNet(5)<5.5);
  assert.ok(requiredGrossPctForNet(6)>6.4&&requiredGrossPctForNet(6)<6.5);
  assert.ok(estimatedNetPct(-2)<-2.3);
  assert.ok(Math.abs(estimatedNetPct(requiredGrossPctForNet(5))-5)<1e-9);
});
test('Gross +5% price hit is NOT a net +5% WIN when fee and slippage count',()=>{
  const t=new SignalTracker();const c={symbol:'SOL-USDT',status:'BUY',confirmed:true,entry:100,price:100.2,lastCandle:100*step,score:85};
  assert.equal(t.capture(c,101*step),true);
  t.observe('SOL-USDT',[{time:101*step,high:105.1,low:99,open:100,close:104}]);
  const s=t.snapshot();assert.equal(s.tp5.win,1);assert.equal(s.tp5Net.pending,1);
});
test('Restore deduplicates signals and preserves outcomes through a fake PostgreSQL restart',async()=>{
  const data={};
  class Pool {
    async query(sql,args=[]){
      if(sql.includes('SELECT payload'))return {rows:data.default?[{payload:data.default}]:[]};
      if(sql.includes('INSERT INTO')){data.default=JSON.parse(args[1]);return {rows:[]};}
      return {rows:[]};
    }
    async end(){}
  }
  const p1=new SignalStore('postgresql://fake-host/db',Pool);
  assert.equal(await p1.connect(),null);
  const t1=new SignalTracker();
  assert.equal(t1.capture({symbol:'SOL-USDT',status:'BUY',confirmed:true,entry:100,price:100.2,lastCandle:100*step,score:85},101*step),true);
  t1.observe('SOL-USDT',[{time:101*step,high:105.8,low:99.2,open:100,close:103}]);
  assert.equal(await p1.save(t1.records),true);
  const p2=new SignalStore('postgresql://fake-host/db',Pool),loaded=await p2.connect();
  const t2=new SignalTracker();assert.equal(t2.restore([...loaded, ...loaded]),1);
  assert.equal(t2.snapshot().total,1);assert.equal(t2.snapshot().tp5Net.win,1);
  assert.equal(p2.status().persistent,true);
  await p1.close();await p2.close();
});
test('No DB config explicitly reports MEMORY ONLY; no false durability claim',async()=>{
  const s=new SignalStore('');assert.equal(await s.connect(),null);
  assert.equal(s.status().persistent,false);assert.equal(s.status().mode,'MEMORY ONLY');
});
