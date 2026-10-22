// Optional durable PostgreSQL JSONB snapshot, external to Render's ephemeral disk.
// DATABASE_URL is read server-side ONLY. Never expose credentials through /api.
export class SignalStore {
  constructor(url=process.env.DATABASE_URL||'', driverFactory=null){
    this.url=url;this.driverFactory=driverFactory;this.pool=null;
    this.mode=url?'CONNECTING':'MEMORY ONLY';this.lastSave=null;this.lastError='';
  }
  async connect(){
    if(!this.url){this.mode='MEMORY ONLY';return null;}
    try{
      if(!this.pool){
        const Pool=this.driverFactory || (await import('pg')).default.Pool;
        this.pool=new Pool({connectionString:this.url,max:2,connectionTimeoutMillis:8000,idleTimeoutMillis:15000});
      }
      await this.pool.query(`CREATE TABLE IF NOT EXISTS radar_signal_state (
        state_key TEXT PRIMARY KEY,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      const res=await this.pool.query('SELECT payload,updated_at FROM radar_signal_state WHERE state_key=$1',['default']);
      const value=res.rows?.[0]?.payload;
      this.mode='PERSISTENT';this.lastError='';
      return Array.isArray(value)?value:null;
    }catch(e){
      this.mode='DISCONNECTED';this.lastError=String(e.message||e).slice(0,150);
      console.error('Signal DB unavailable:',this.lastError);
      return null;
    }
  }
  async save(records){
    if(!this.url)return false;
    if(!this.pool || this.mode!=='PERSISTENT')return false;
    try{
      await this.pool.query(`INSERT INTO radar_signal_state(state_key,payload,updated_at)
        VALUES ($1,$2::jsonb,NOW()) ON CONFLICT (state_key)
        DO UPDATE SET payload=EXCLUDED.payload,updated_at=EXCLUDED.updated_at`,['default',JSON.stringify(records)]);
      this.lastSave=Date.now();this.lastError='';this.mode='PERSISTENT';return true;
    }catch(e){this.mode='DISCONNECTED';this.lastError=String(e.message||e).slice(0,150);console.error('Signal DB save failed:',this.lastError);return false;}
  }
  status(){return {mode:this.mode,persistent:this.mode==='PERSISTENT',lastSave:this.lastSave,
    hint:!this.url?'Tambahkan DATABASE_URL di Environment Render untuk sejarah kekal.':
      this.mode==='DISCONNECTED'?'Sambungan DB gagal; rekod sementara sahaja. Semak Render Logs.':null};}
  async close(){await this.pool?.end();}
}
