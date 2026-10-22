import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SignalTracker, requiredGrossPctForNet, estimatedNetPct} from '../signal-tracker.js';
import {tradePlan} from '../public/trade-math.js';
import {buildReadyAlert} from '../telegram-alert.js';
import {CFG} from '../analytics.js';
const STEP=900000, closed=100*STEP;
const s=(suffix)=>({symbol:`${suffix}-USDT`,entry:100,closedAt:closed,candleTime:closed-STEP,
  score:90,outcome5:'WIN',outcome5Net:'WIN',outcome6:'PENDING',outcome6Net:'PENDING',id:`${suffix}|${closed-STEP}`});
test('old TP5 history remains marked legacy; TP4 rate must exclude old TP5 wins',()=>{
  const t=new SignalTracker();
  assert.equal(t.restore([s('OLD')]),1);
  assert.equal(t.records[0].target1Pct,5);
  assert.equal(t.snapshot().tp5NetLegacy.win,1);
  assert.equal(t.snapshot().tp4Net.rate,null);
  assert.equal(t.snapshot().tp4Net.win,0);
  assert.equal(t.snapshot().legacyCount,1);
});
test('old 5% signals keep evaluating 5%, new signals evaluate 4% separately',()=>{
  const t=new SignalTracker();t.restore([{...s('OLD'),outcome5:'PENDING',outcome5Net:'PENDING'}]);
  const newSignal={symbol:'NEW-USDT',entry:100,price:100,lastCandle:closed-STEP,score:90,status:'BUY',confirmed:true};
  assert.equal(t.capture(newSignal,closed),true);
  t.observe('OLD-USDT',[{time:closed,low:99,high:104.5,open:100,close:104.2}]);
  t.observe('NEW-USDT',[{time:closed,low:99,high:104.5,open:100,close:104.2}]);
  const stats=t.snapshot();
  assert.equal(stats.tp5NetLegacy.pending,1,'old 5% TP should not be won at gross 4.5%');
  assert.equal(stats.tp4Net.win,1,'new 4% TP should win at gross 4.5%');
  assert.equal(stats.tp6Net.pending,2);
  assert.equal(stats.total,2);
});
test('net 4% requires ~4.42% gross after fee and slippage; no weaker BUY criteria',()=>{
  const target=requiredGrossPctForNet(4);
  assert.ok(target>4.41&&target<4.43);
  assert.ok(Math.abs(estimatedNetPct(target)-4)<1e-8);
  assert.equal(CFG.TP1,4);
  assert.equal(CFG.TP2,6);
  assert.equal(CFG.SIGNAL_RANGE,5,'BUY 24h range filter stays strict');
  const p=tradePlan(100,.1);
  assert.ok(p.tp1Net>104&&p.tp1Net<104.3);
});
test('Telegram FINAL READY and PWA labels show updated 4–6% target',()=>{
  const candidate={symbol:'SOL-USDT',price:100,lastCandle:closed-STEP,
    entryZoneLow:99.5,entryZoneHigh:101,score:90,rvol:2,adx:27};
  const alert=buildReadyAlert({coin:candidate},closed);
  assert.match(alert,/TP1 \(\+4% net anggaran\)/);
  assert.match(alert,/TP2 \(\+6% net anggaran\)/);
  assert.doesNotMatch(alert,/TP1 \(\+5%/);
  const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  assert.match(html,/Daily target <span>4–6/);
  assert.match(html,/V1\.7\.2/);
  assert.doesNotMatch(html,/Hunt the <em>5–6%/);
});
