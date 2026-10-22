// Telegram FINAL READY alert engine. Uses the exact same READY rules as the website.
// All bot credentials are environment-only. No endpoints expose tokens/chat ids.
import {buildSignalCenter,netTargetGrossPct} from './public/signal-center-model.js';
import {timingSafeEqual} from 'node:crypto';

const API='https://api.telegram.org/bot';
const FIFTEEN=15*60_000;
const formatPrice=value=>{
  const v=Number(value);
  if(!Number.isFinite(v)||v<=0)return '—';
  return v>=1000?v.toLocaleString('en-US',{maximumFractionDigits:2}):
    v>=1?v.toFixed(4):v>=0.01?v.toFixed(5):v.toPrecision(6);
};
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[ch]));
export function equalSecret(a,b){
  const x=Buffer.from(String(a||''));const y=Buffer.from(String(b||''));
  return x.length>=12&&x.length===y.length&&timingSafeEqual(x,y);
}
export function alertKey(coin){return `${coin.symbol}|${coin.lastCandle}`;}
export function buildReadyAlert(entry,now=Date.now(),url='https://intraday-t1ln.onrender.com'){
  const c=entry.coin, fee4=netTargetGrossPct(4),fee6=netTargetGrossPct(6);
  const live=c.price, when=new Intl.DateTimeFormat('en-MY',{timeZone:'Asia/Kuala_Lumpur',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false}).format(c.lastCandle+FIFTEEN);
  const q=s=>escapeHtml(s);
  return [`🟢 <b>FINAL READY · BUY SIGNAL CONFIRMED</b>`,
    `<b>${q(c.symbol.replace('-','/'))}</b> · KuCoin Spot`,
    `🕒 Candle 15m tutup: <b>${q(when)} MYT</b>`,
    `💵 Harga live semasa scan: <b>$${formatPrice(live)}</b>`,
    `📍 Zon anti-chase: <b>$${formatPrice(c.entryZoneLow)} – $${formatPrice(c.entryZoneHigh)}</b>`,
    `🎯 TP1 (+4% net anggaran): <b>$${formatPrice(live*(1+fee4/100))}</b>`,
    `🎯 TP2 (+6% net anggaran): <b>$${formatPrice(live*(1+fee6/100))}</b>`,
    `🛑 SL (−2% kasar): <b>$${formatPrice(live*.98)}</b>`,
    `📊 Score ${q(c.score)}/100 | RVOL ${q(Number(c.rvol).toFixed(2))}x | ADX ${q(Number(c.adx).toFixed(1))}`,
    `✅ BUY rasmi + timing READY ketika imbasan; tiada auto-order.`,
    `⚠️ Harga/zona boleh berubah sebelum mesej tiba. TP selepas kos ialah simulasi, bukan fill sebenar.`,
    `<a href="${q(url)}">Buka Daily Radar</a>`].join('\n');
}

export class TelegramStore{
  constructor(poolProvider,enabled=()=>true){this.poolProvider=poolProvider;this.enabled=enabled;this.initialized=false;}
  get pool(){if(!this.enabled()||!this.poolProvider())throw Error('PostgreSQL tidak tersedia');return this.poolProvider();}
  async init(){
    await this.pool.query(`CREATE TABLE IF NOT EXISTS radar_telegram_config (
      config_key TEXT PRIMARY KEY,chat_id TEXT NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await this.pool.query(`CREATE TABLE IF NOT EXISTS radar_telegram_alerts (
      signal_key TEXT PRIMARY KEY,symbol TEXT NOT NULL,candle_open BIGINT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',attempts INTEGER NOT NULL DEFAULT 0,
      telegram_message_id BIGINT,last_error TEXT,created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),sent_at TIMESTAMPTZ)`);
    this.initialized=true;
  }
  async getChatId(){const r=await this.pool.query(`SELECT chat_id FROM radar_telegram_config WHERE config_key='main'`);return r.rows?.[0]?.chat_id||null;}
  async pair(chatId){
    await this.pool.query(`INSERT INTO radar_telegram_config(config_key,chat_id)
      VALUES('main',$1) ON CONFLICT(config_key) DO NOTHING`,[String(chatId)]);
    return await this.getChatId()===String(chatId);
  }
  async claim(key,symbol,candle){
    await this.pool.query(`INSERT INTO radar_telegram_alerts(signal_key,symbol,candle_open)
      VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[key,symbol,candle]);
    const r=await this.pool.query(`UPDATE radar_telegram_alerts SET status='SENDING',attempts=attempts+1,updated_at=NOW()
      WHERE signal_key=$1 AND attempts < 3 AND (
      status='PENDING' OR (status='FAILED' AND updated_at < NOW()-INTERVAL '45 seconds')
      OR (status='SENDING' AND updated_at < NOW()-INTERVAL '3 minutes'))
      RETURNING signal_key`,[key]);
    return (r.rowCount||0)>0;
  }
  async sent(key,messageId){await this.pool.query(`UPDATE radar_telegram_alerts SET status='SENT', telegram_message_id=$2,
    updated_at=NOW(),sent_at=NOW(),last_error=NULL WHERE signal_key=$1`,[key,messageId||null]);}
  async failed(key,error){await this.pool.query(`UPDATE radar_telegram_alerts SET status='FAILED',last_error=$2,
    updated_at=NOW() WHERE signal_key=$1`,[key,String(error).slice(0,160)]);}
  async stats(){const r=await this.pool.query(`SELECT COUNT(*) FILTER(WHERE status='SENT')::INTEGER AS sent,
    MAX(sent_at) AS last_sent FROM radar_telegram_alerts`);return r.rows?.[0]||{sent:0,last_sent:null};}
}

export class TelegramAlerts{
  constructor({token='',pairCode='',store,sendRequest=null,website='https://intraday-t1ln.onrender.com',now=()=>Date.now()}={}){
    this.token=token;this.pairCode=pairCode;this.store=store;this.website=website;this.now=now;
    this.request=sendRequest||this.fetchTelegram.bind(this);
    this.chatId=null;this.offset=0;this.polling=false;this.scanning=false;this.initialized=false;
    this.lastError='';this.sentCount=0;this.lastSent=null;
  }
  get configured(){return this.token.length>=20&&this.pairCode.length>=12;}
  status(){return {configured:this.configured,paired:!!this.chatId,storage:this.store?.initialized?'POSTGRESQL':'NOT READY',
    enabled:this.configured&&!!this.chatId&&!!this.store?.initialized,
    sent:this.sentCount,lastSent:this.lastSent,
    state:!this.token?'SET TOKEN':!this.pairCode?'SET PAIR CODE':!this.configured?'CHECK CONFIG':
      !this.store?.initialized?'DATABASE REQUIRED':!this.chatId?'WAITING PAIRING':'ACTIVE',
    lastError:this.lastError?'Semak Render logs / arahan bot':'',note:'Alert hanya apabila READY pada scan server; Render Free boleh tidur.'};}
  async fetchTelegram(method,args){
    const r=await fetch(`${API}${this.token}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(args),signal:AbortSignal.timeout(9000)});
    const data=await r.json();
    if(!r.ok||!data.ok)throw Error(`Telegram ${r.status}: ${String(data.description||'API failure').slice(0,140)}`);
    return data.result;
  }
  async init(){
    if(!this.configured)return;
    await this.store.init();
    this.chatId=await this.store.getChatId();
    const stat=await this.store.stats();this.sentCount=stat.sent||0;this.lastSent=stat.last_sent||null;
    this.initialized=true;this.lastError='';
  }
  async poll(){
    if(!this.configured||this.polling)return;
    this.polling=true;
    try{
      if(!this.store.initialized)await this.init();
      const updates=await this.request('getUpdates',{offset:this.offset,timeout:0,limit:30,allowed_updates:['message']});
      for(const u of updates||[]){
        this.offset=Math.max(this.offset,u.update_id+1);
        const chat=u.message?.chat,body=u.message?.text?.trim()||'';
        if(!chat||chat.type!=='private')continue;
        const id=String(chat.id);
        if(body.startsWith('/start ')){
          const supplied=body.slice(7).trim();
          if(!equalSecret(supplied,this.pairCode))continue;
          const matched=await this.store.pair(id);
          if(matched){this.chatId=id;await this.request('sendMessage',{chat_id:id,text:'✅ Daily Radar V1.7 berjaya dipasangkan! Taip /test untuk ujian atau /status untuk semak sambungan.'});}
          else await this.request('sendMessage',{chat_id:id,text:'⚠️ Bot sudah dipasangkan kepada chat lain. Tiada perubahan dibuat.'});
        } else if(id===this.chatId && body==='/test'){
          await this.request('sendMessage',{chat_id:id,text:'🧪 UJIAN TELEGRAM · Daily Radar V1.7\nSambungan bot berjaya. Ini BUKAN signal BUY.'});
        } else if(id===this.chatId && body==='/status'){
          await this.request('sendMessage',{chat_id:id,text:'✅ Telegram aktif. Alert automatik hanya untuk FINAL READY pada candle 15m yang disahkan. Server mesti aktif untuk scan.'});
        }
      }
      this.lastError='';
    }catch(e){this.lastError='Telegram pairing/poll error';console.warn('Telegram pairing/poll:',String(e.message||e).slice(0,160));}
    finally{this.polling=false;}
  }
  async check(snapshot){
    if(this.scanning||!this.configured||!this.chatId||!this.store?.initialized)return 0;
    this.scanning=true;let delivered=0;
    try{
      const now=this.now(),model=buildSignalCenter(snapshot,now);
      if(model.offline||snapshot?.summary?.candleScanRunning)return 0;
      for(const record of model.ready){
        // Recheck CURRENT snapshot; never use a previously cached READY/old candle.
        const c=record.coin;
        if(!c?.lastCandle||now-(c.lastCandle+FIFTEEN)>30*60_000)continue;
        const key=alertKey(c);
        if(!await this.store.claim(key,c.symbol,c.lastCandle))continue;
        try{
          const response=await this.request('sendMessage',{chat_id:this.chatId,text:buildReadyAlert(record,now,this.website),
            parse_mode:'HTML',disable_web_page_preview:true});
          await this.store.sent(key,response?.message_id);
          delivered++;this.sentCount++;this.lastSent=new Date().toISOString();this.lastError='';
          console.log(`Telegram FINAL READY sent: ${c.symbol} candle ${c.lastCandle}`);
        }catch(e){
          this.lastError='Telegram delivery failed';
          console.warn(`Telegram send failed for ${c.symbol}:`,String(e.message||e).slice(0,140));
          await this.store.failed(key,String(e.message||e));
        }
      }
    }catch(e){this.lastError='Telegram database/check error';console.warn('Telegram check:',String(e.message||e).slice(0,160));}
    finally{this.scanning=false;}
    return delivered;
  }
}
