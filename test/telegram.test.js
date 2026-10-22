import test from 'node:test';
import assert from 'node:assert/strict';
import {TelegramAlerts,buildReadyAlert,alertKey,equalSecret} from '../telegram-alert.js';
const now=Date.now();
const coin={symbol:'SOL-USDT',price:200,lastCandle:Math.floor(now/900000)*900000-900000,
 confirmed:true,stale:false,status:'BUY',entryZoneValid:true,entryZoneLow:199,entryZoneHigh:202,
 score:85,rvol:1.9,adx:28,smartTiming:{stage:'CONFIRMED BREAKOUT',risk:'LOW'},
 breakoutRadar:{risk:{blocked:false},stage:'EARLY BREAKOUT'},
 opportunity:{qualified:true,score:81},readiness:{level:'NEAR BUY'}};
const snapshot=(coins=[coin],changes={})=>({ok:true,summary:{updated:now-5000,analyzedAt:now-10000,dataStale:false,candleScanRunning:false},coins,...changes});
const fakeStore=()=>{
 const alerts=new Map();let chat=null;
 return {initialized:true,alerts,async init(){this.initialized=true;},
   async getChatId(){return chat;},async stats(){return {sent:0,last_sent:null};},
   async pair(id){if(chat&&chat!==id)return false;chat=id;return true;},
   async claim(key,symbol,candle){const x=alerts.get(key);if(x?.state==='SENT'||x?.attempts>=3)return false;
     alerts.set(key,{state:'SENDING',attempts:(x?.attempts||0)+1,symbol,candle});return true;},
   async sent(key){alerts.get(key).state='SENT';},
   async failed(key){alerts.get(key).state='FAILED';}};
};
const make=(store,request=async(method)=>method==='getUpdates'?[]:{message_id:3})=>new TelegramAlerts({
 token:'123456789:abcdefghijklmnopqrstuvwxyz',pairCode:'SecretCode123456',store,
 sendRequest:request,now:()=>now
});
test('pair code requires 12+ chars and exact timing-safe equality',()=>{
 assert.equal(equalSecret('SecretCode123456','SecretCode123456'),true);
 assert.equal(equalSecret('SecretCode123457','SecretCode123456'),false);
 assert.equal(equalSecret('short','short'),false);
});
test('no paired user, no Telegram alert',async()=>{
 const store=fakeStore();let sent=0;
 const bot=make(store,async()=>{sent++;return {message_id:3};});
 await bot.check(snapshot());assert.equal(sent,0);
});
test('only READY sends, once per coin+15m candle, and includes clear target/fee disclaimer',async()=>{
 const store=fakeStore();const sent=[];
 const bot=make(store,async(method,body)=>{sent.push({method,body});return {message_id:4};});
 await store.pair('10011');bot.chatId='10011';
 assert.equal(await bot.check(snapshot()),1);
 assert.equal(await bot.check(snapshot()),0);
 assert.equal(sent.length,1);
 assert.match(sent[0].body.text,/FINAL READY/);
 assert.match(sent[0].body.text,/TP1 \(\+5% net anggaran\)/);
 assert.match(sent[0].body.text,/bukan fill sebenar/i);
 assert.equal(store.alerts.get(alertKey(coin)).state,'SENT');
});
test('never alert for WATCH, false breakout, Anti-FOMO, outside-zone or stale data',async()=>{
 for(const edit of [{status:'WATCH'},{entryZoneValid:false},{smartTiming:{stage:'FALSE BREAKOUT',risk:'HIGH'}},
  {breakoutRadar:{risk:{blocked:true}}},{lastCandle:now-70*60000},{symbol:'USDC-USDT'}]){
  const store=fakeStore();let count=0;
  const bot=make(store,async()=>{count++;return {message_id:8};});bot.chatId='99';
  assert.equal(await bot.check(snapshot([{...coin,...edit}])),0,JSON.stringify(edit));assert.equal(count,0);
 }
});
test('offline ticker or analysis and in-progress scan blocks alert',async()=>{
 for(const change of [{ok:false},{summary:{updated:now-200000,analyzedAt:now-10000}},{summary:{updated:now-100,analyzedAt:now-1000,candleScanRunning:true}}]){
  const store=fakeStore();let count=0;const bot=make(store,async()=>{count++;return {message_id:9};});bot.chatId='99';
  assert.equal(await bot.check(snapshot([coin],change)),0);assert.equal(count,0);
 }
});
test('Telegram failure is recorded, retry later uses same signal id',async()=>{
 const store=fakeStore();let calls=0;
 const bot=make(store,async()=>{calls++;if(calls===1)throw Error('test network failure');return {message_id:5};});bot.chatId='99';
 assert.equal(await bot.check(snapshot()),0);
 assert.equal(store.alerts.get(alertKey(coin)).state,'FAILED');
 assert.equal(await bot.check(snapshot()),1);
 assert.equal(await bot.check(snapshot()),0);
});
test('pairing is private, ignores incorrect token and only replies to paired chat /test',async()=>{
 const store=fakeStore();const replies=[];
 const updates=[
  {update_id:1,message:{chat:{id:5,type:'private'},text:'/start wrong123456789'}},
  {update_id:2,message:{chat:{id:6,type:'group'},text:'/start SecretCode123456'}},
  {update_id:3,message:{chat:{id:7,type:'private'},text:'/start SecretCode123456'}},
  {update_id:4,message:{chat:{id:99,type:'private'},text:'/test'}},
  {update_id:5,message:{chat:{id:7,type:'private'},text:'/test'}}];
 const bot=make(store,async(method,args)=>{
  if(method==='getUpdates')return updates.filter(x=>x.update_id>=args.offset);
  replies.push(args);return {message_id:1};
 });
 await bot.poll();assert.equal(bot.chatId,'7');assert.equal(replies.length,2);
 assert.ok(replies.every(r=>String(r.chat_id)==='7'));
 assert.match(replies[1].text,/BUKAN signal BUY/);
});
test('alert presentation handles unsafe symbol text safely',()=>{
 const msg=buildReadyAlert({coin:{...coin,symbol:'<X>-USDT'},label:'READY'},now);
 assert.doesNotMatch(msg,/<X>/);assert.match(msg,/&lt;X&gt;/);
});
