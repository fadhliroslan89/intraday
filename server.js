import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Market} from './market.js';
import {TelegramAlerts,TelegramStore} from './telegram-alert.js';

const ROOT=path.dirname(fileURLToPath(import.meta.url));
const PUBLIC=path.join(ROOT,'public');
const PORT=Number(process.env.PORT||3000);
const market=new Market();
const telegram=new TelegramAlerts({
  token:process.env.TELEGRAM_BOT_TOKEN||'',
  pairCode:process.env.TELEGRAM_PAIR_CODE||'',
  website:process.env.PUBLIC_SITE_URL||'https://intraday-t1ln.onrender.com',
  store:new TelegramStore(()=>market.store.pool,()=>market.store.mode==='PERSISTENT')
});
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.ico':'image/x-icon','.png':'image/png','.webmanifest':'application/manifest+json' };

const server=http.createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const headers={'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Cache-Control':'no-store',
    'Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'"};
  if(pathname==='/health'){
    res.writeHead(200,{'Content-Type':'application/json',...headers});res.end(JSON.stringify({status:'ok',lastTicker:market.lastTicker,uptime:process.uptime()}));return;
  }
  if(pathname==='/api/dashboard'){
    res.writeHead(200,{'Content-Type':'application/json',...headers});res.end(JSON.stringify({...market.snapshot(),telegram:telegram.status()}));return;
  }
  if(!['GET','HEAD'].includes(req.method)){
    res.writeHead(405,headers);res.end('Method not allowed');return;
  }
  let file;
  if(pathname==='/')file=path.join(PUBLIC,'index.html');
  else if(/^\/[a-zA-Z0-9._/-]+$/.test(pathname))file=path.resolve(PUBLIC,'.'+pathname);
  else {res.writeHead(404,headers);res.end('Not found');return;}
  if(!file.startsWith(PUBLIC+path.sep)&&file!==path.join(PUBLIC,'index.html')){res.writeHead(403,headers);res.end('Forbidden');return;}
  try{
    const stat=await fs.stat(file);
    if(!stat.isFile())throw new Error('Not file');
    const body=await fs.readFile(file);
    res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream',...headers,
      'Cache-Control':pathname==='/'||/\.(?:js|css|html|webmanifest)$/.test(pathname)||pathname==='/sw.js'?'no-store':'public, max-age=900'});
    res.end(req.method==='HEAD'?undefined:body);
  }catch{res.writeHead(404,headers);res.end('Not found');}
});
server.listen(PORT,'0.0.0.0',()=>console.log(`Daily Radar ready :${PORT}`));

// Single server-level loops shared by ALL viewers; UI polling won't multiply KuCoin calls.
let tickerBusy=false;
async function refreshTickers(){if(tickerBusy)return;tickerBusy=true;try{
  await market.updateTickers();await telegram.check(market.snapshot());
}finally{tickerBusy=false;}}
async function refreshTechnicals(){try{await market.updateAnalysis();await telegram.check(market.snapshot());}catch(e){console.error('Analysis',e);}}
async function bootstrap(){
  await market.initStorage();
  try{await telegram.init();}catch(e){console.error('Telegram init:',e.message);}
  setInterval(()=>void telegram.poll(),12_000);
  void telegram.poll();
  await refreshTickers();
  await refreshTechnicals();
  setInterval(()=>void (async()=>{try{await market.reconnectStorage();if(!telegram.store.initialized)await telegram.init();}catch(e){console.error('DB/Telegram reconnection:',e.message);}})(),60_000);
  setInterval(refreshTickers,30_000);
  setInterval(refreshTechnicals,120_000);
}
void bootstrap().catch(e=>console.error('Bootstrap:',e));
process.on('SIGTERM',()=>server.close(async()=>{await market.shutdown();process.exit(0);}));
