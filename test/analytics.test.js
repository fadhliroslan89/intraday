import test from 'node:test';
import assert from 'node:assert/strict';
import {ema,rsi,adx,parseCandles,analyze,chooseCandidates,normalizeTicker} from '../analytics.js';
test('EMA/RSi basics',()=>{
  assert.equal(ema([1,2,3,4,5],3),4);
  assert.equal(rsi(Array(20).fill(10)),50);
  assert.ok(rsi(Array.from({length:30},(_,i)=>10+i))>99);
});
test('normalizes KuCoin bid / ask and liquidity',()=>{
  const t=normalizeTicker({symbol:'SOL-USDT',last:'100',changeRate:'0.055',volValue:'20000000',high:'105',low:'95',buy:'99.9',sell:'100.1'});
  assert.equal(t.change24,5.5);assert.equal(t.volume24,20e6);assert.ok(t.spread>0);
});
test('reject open candle and sorts KuCoin descending candle response',()=>{
  const now=Date.UTC(2026,9,22,9,31,0);
  const mins=15*60;
  const rows=[[(now/1000|0)-60,'1','1','1','1','3','10'],[(now/1000|0)-mins*2,'1','1.1','1.2','.9','3','10'],[(now/1000|0)-mins*3,'1','1.1','1.2','.9','3','10']];
  const r=parseCandles(rows,15,now);assert.equal(r.length,2);assert.ok(r[0].time<r[1].time);
});
test('unconfirmed/insufficient candle data cannot create BUY',()=>{
  const t={symbol:'BTC-USDT',price:100,change24:8,volume24:20e6,range24:9,spread:.1};
  const r=analyze(t,[],[]);assert.equal(r.status,'WAIT');assert.equal(r.confirmed,false);
});
test('candidate selection never duplicates symbols',()=>{
  const tickers=Array.from({length:100},(_,i)=>({symbol:`COIN${i}-USDT`,price:1,change24:i/10,volume24:(100-i)*1e6,range24:i*.1,spread:.02}));
  const a=chooseCandidates(tickers,52,0),b=chooseCandidates(tickers,52,23);
  assert.equal(a.length,52);assert.equal(new Set(a.map(x=>x.symbol)).size,52);assert.equal(b.length,52);
});
test('ADX computes finite number',()=>{
  const candles=Array.from({length:110},(_,i)=>({high:110+i*1.1+Math.sin(i),low:95+i+Math.sin(i),close:100+i+Math.sin(i)}));
  assert.ok(Number.isFinite(adx(candles)));
});
