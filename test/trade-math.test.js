import test from 'node:test';
import assert from 'node:assert/strict';
import {tradePlan} from '../public/trade-math.js';

test('trade plan uses manual fill and fees for net +5 / +6 targets',()=>{
  const p=tradePlan(0.06229,0.1);
  assert.ok(p);
  const netRoi=exit=>(exit/p.entry*(1-.001)/(1+.001)-1)*100;
  assert.ok(Math.abs(netRoi(p.tp1Net)-5)<1e-8);
  assert.ok(Math.abs(netRoi(p.tp2Net)-6)<1e-8);
  assert.ok(p.tp1Net>p.tp1Gross);
  assert.ok(p.tp2Net>p.tp2Gross);
  assert.ok(p.slNetPct< -2);
});
test('trade plan re-calculates from user input and validates unreasonable values',()=>{
  const a=tradePlan(.06229,.1), b=tradePlan(.065,.1);
  assert.ok(b.tp1Net>a.tp1Net);
  assert.equal(tradePlan(0,.1),null);
  assert.equal(tradePlan(10,6),null);
  assert.equal(tradePlan(Infinity,.1),null);
});
