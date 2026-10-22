import test from 'node:test';
import assert from 'node:assert/strict';
import {SignalTracker, evaluateSignalSide,TRACK_WINDOW_MS} from '../signal-tracker.js';
const step=900000;
const sig={closedAt:step*100,entry:100};
const bar=(n,high=101,low=99)=>({time:sig.closedAt+n*step,high,low,open:100,close:100});
test('No same-signal candle lookahead and TP4 can hit while TP6 stays pending',()=>{
  assert.equal(evaluateSignalSide(sig,[bar(-1,110,80)],4),'PENDING');
  assert.equal(evaluateSignalSide(sig,[bar(0,104.2,99)],4),'WIN');
  assert.equal(evaluateSignalSide(sig,[bar(0,104.2,99)],6),'PENDING');
});
test('Same 15m bar touches TP & SL -> AMBIGUOUS, never a win',()=>{
  assert.equal(evaluateSignalSide(sig,[bar(0,106.5,97)],4),'AMBIGUOUS');
  assert.equal(evaluateSignalSide(sig,[bar(0,106.5,97)],6),'AMBIGUOUS');
});
test('Closed candle hits stop before target, outcome is LOSS',()=>{
  assert.equal(evaluateSignalSide(sig,[bar(0,100,97.8)],4),'LOSS');
});
test('Skipped candle yields INCOMPLETE, excluded from reported win rate',()=>{
  assert.equal(evaluateSignalSide(sig,[bar(1,106,99)],4),'INCOMPLETE');
  assert.equal(evaluateSignalSide(sig,[bar(0),bar(2,106,99)],4),'INCOMPLETE');
});
test('No hits and continuous 24h closed data => EXPIRED',()=>{
  const bars=Array.from({length:TRACK_WINDOW_MS/step},(_,i)=>bar(i,102,99));
  assert.equal(evaluateSignalSide(sig,bars,4),'EXPIRED');
});
test('Duplicate BUY candle ignored, scoring excludes ambiguity and timeout',()=>{
  const t=new SignalTracker();
  const c={symbol:'ABC-USDT',status:'BUY',confirmed:true,entry:100,price:100.5,
    lastCandle:step*99,score:82};
  assert.equal(t.capture(c,step*100),true);
  assert.equal(t.capture(c,step*100),false);
  t.observe('ABC-USDT',[bar(0,105.3,99)]);
  const perf=t.snapshot();
  assert.equal(perf.total,1);
  assert.equal(perf.tp4.win,1);
  assert.equal(perf.tp6.pending,1);
  assert.equal(perf.tp4.rate,100);
});
