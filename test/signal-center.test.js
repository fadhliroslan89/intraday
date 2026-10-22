import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSignalCenter,classifyCenterCoin,netTargetGrossPct} from '../public/signal-center-model.js';
const now=1792672800000;
const ctx={ok:true,now,summary:{updated:now-30000,analyzedAt:now-60000,dataStale:false}};
const base={symbol:'SOL-USDT',price:200,lastCandle:now-900000,confirmed:true,stale:false,status:'BUY',entryZoneValid:true,
 score:88,rvol:1.8,adx:28,smartTiming:{stage:'CONFIRMED BREAKOUT',risk:'LOW'},breakoutRadar:{risk:{blocked:false},stage:'EARLY BREAKOUT'},readiness:{level:'NEAR BUY'},opportunity:{qualified:true,score:81}};
const c=(change={})=>({...base,...change});
test('READY only from confirmed official BUY in active zone',()=>{
 assert.equal(classifyCenterCoin(c(),ctx).label,'READY');
 assert.equal(classifyCenterCoin(c({status:'WATCH'}),ctx).label,'WAIT');
 assert.equal(classifyCenterCoin(c({status:'BUY',entryZoneValid:false}),ctx).label,'WAIT');
});
test('False breakout and anti-FOMO veto READY',()=>{
 assert.equal(classifyCenterCoin(c({smartTiming:{stage:'FALSE BREAKOUT',risk:'HIGH'}}),ctx).label,'AVOID');
 assert.equal(classifyCenterCoin(c({breakoutRadar:{risk:{blocked:true}}}),ctx).label,'AVOID');
});
test('Offline or stale analysis must never yield READY',()=>{
 assert.equal(classifyCenterCoin(c(),{...ctx,ok:false}).label,'OFFLINE');
 assert.equal(classifyCenterCoin(c(),{...ctx,summary:{...ctx.summary,analyzedAt:now-25*60000}}).label,'OFFLINE');
 assert.equal(classifyCenterCoin(c({lastCandle:now-60*60000}),ctx).label,'WAIT');
});
test('Risk HIGH vetoes READY and weak candidates are AVOID',()=>{
 assert.equal(classifyCenterCoin(c({smartTiming:{stage:'CONFIRMED BREAKOUT',risk:'HIGH'}}),ctx).label,'WAIT');
 assert.equal(classifyCenterCoin(c({status:'WAIT',score:20,opportunity:{qualified:false,score:0},readiness:{level:'NONE'},breakoutRadar:{risk:{blocked:false},stage:'NONE'}}),ctx).label,'AVOID');
});
test('Stablecoins never READY',()=>{
 assert.equal(classifyCenterCoin(c({symbol:'USDC-USDT'}),ctx).label,'AVOID');
});
test('Sorting prioritizes READY over WAIT and counts only analyzed coins',()=>{
 const data={ok:true,summary:ctx.summary,coins:[c({symbol:'ETH-USDT',status:'WAIT'}),c(),c({symbol:'USDC-USDT'})]};
 const m=buildSignalCenter(data,now);
 assert.deepEqual([m.ready.length,m.waiting.length,m.avoided.length],[1,1,1]);
 assert.equal(m.active[0].symbol,'SOL-USDT');
});
test('5% net requires gross above 5% with transaction costs',()=>{
 assert.ok(netTargetGrossPct(5) > 5.4 && netTargetGrossPct(5)<5.5);
 assert.ok(netTargetGrossPct(6) > 6.4 && netTargetGrossPct(6)<6.5);
});
