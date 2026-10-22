import test from 'node:test';
import assert from 'node:assert/strict';
import {detectTimingPattern,assessEntryTiming} from '../timing.js';
function bars(n=45) {
  return Array.from({length:n},(_,i)=>({time:i*900000,open:99.8,close:100,high:100.25,low:99.5,turnover:100}));
}
const c = (pattern,more={})=>({entry:100,price:100,confirmed:true,stale:false,rvol:1.8,adx:29,
  volume24:10e6,spread:.05,stretch:1.1,volumeAccel:1.4,breakoutRadar:{risk:{blocked:false,level:'NORMAL'}},
  timingPattern:pattern,...more});
test('False breakout: a formerly confirmed breakout falls below its old resistance on a closed bar',()=>{
  const a=bars(); a[42]={...a[42],open:100,high:102.5,low:99.9,close:102};
  a[44]={...a[44],open:100,high:100.2,low:98.9,close:99};
  const p=detectTimingPattern(a);
  assert.equal(p.type,'FALSE_BREAKOUT');
  const t=assessEntryTiming(c(p));
  assert.equal(t.stage,'FALSE BREAKOUT');assert.equal(t.entryZoneLow,null);assert.equal(t.risk,'HIGH');
});
test('Upper wick rejection on latest fully closed candle is not shown as entry',()=>{
  const a=bars();a[44]={...a[44],open:100,high:103,low:99.6,close:99.8};
  const p=detectTimingPattern(a);
  assert.equal(p.type,'WICK_REJECTION');assert.equal(assessEntryTiming(c(p)).stage,'FALSE BREAKOUT');
});
test('Healthy retest after earlier breakout is PULLBACK WATCH but not BUY',()=>{
  const a=bars();a[42]={...a[42],open:100,high:102.4,low:99.9,close:102};
  a[43]={...a[43],open:101.3,high:101.5,low:100.5,close:101.2};
  a[44]={...a[44],open:100.1,high:101,low:100.20,close:100.6};
  const p=detectTimingPattern(a);assert.equal(p.type,'PULLBACK_HOLD');
  const t=assessEntryTiming(c(p,{price:100.5}));assert.equal(t.stage,'PULLBACK WATCH');
  assert.ok(t.entryZoneHigh>=t.entryZoneLow);
});
test('Risk block has precedence over pretty breakout and price cannot use zoned entry',()=>{
  const p={type:'STRONG_BREAKOUT',atr:1,level:100,upperWickRatio:0.1};
  const t=assessEntryTiming(c(p,{breakoutRadar:{risk:{blocked:true,level:'OVEREXTENDED'}},price:100.25}));
  assert.equal(t.stage,'OVEREXTENDED');assert.equal(t.entryZoneLow,null);
});
test('Stale or unconfirmed candles cannot be labelled PULLBACK WATCH',()=>{
  const pattern={type:'PULLBACK_HOLD',atr:1,level:100};
  assert.equal(assessEntryTiming(c(pattern,{stale:true})).stage,'NO_DATA');
  assert.equal(assessEntryTiming(c(pattern,{confirmed:false})).stage,'NO_DATA');
});
