// Snapshot diagnostics only. No modification to BUY, READY, execution or alerts.
import {buildSignalCenter} from './signal-center-model.js';
export function diagnoseScan(snapshot, now=Date.now()) {
  const model=buildSignalCenter(snapshot,now);
  const list=(snapshot?.coins||[]).filter(c=>c?.confirmed===true&&!c?.stale&&c?.lastCandle>0&&now-(c.lastCandle+900000)<=30*60000);
  const failed=new Map();
  for (const c of list) for (const gate of c.readiness?.checks||[]) {
    if(gate.ok!==true) {
      const id=String(gate.id||gate.label||'unknown');
      const prior=failed.get(id)||{id,label:String(gate.label||id),failed:0};
      prior.failed++;failed.set(id,prior);
    }
  }
  const blockers=[...failed.values()].sort((a,b)=>b.failed-a.failed || a.label.localeCompare(b.label));
  const activeBuy=list.filter(c=>c.status==='BUY').length;
  const timingVeto=list.filter(c=>c.smartTiming?.stage==='FALSE BREAKOUT'||c.breakoutRadar?.risk?.blocked===true).length;
  const staleInSnapshot=(snapshot?.coins||[]).length-list.length;
  const summary=snapshot?.summary||{};
  const tickerAgeMinutes=summary.updated?Math.max(0,Math.round((now-summary.updated)/60000)):null;
  const scanAgeMinutes=summary.analyzedAt?Math.max(0,Math.round((now-summary.analyzedAt)/60000)):null;
  return {
    offline:model.offline,screenedInSnapshot:list.length,cachedCoins:(snapshot?.coins||[]).length,
    coveragePerScan:Number(summary.coverage)||0,totalPairs:Number(summary.totalPairs)||0,
    staleInSnapshot,activeBuy,finalReady:model.ready.length,waiting:model.waiting.length,
    timingVeto,blockers,tickerAgeMinutes,scanAgeMinutes,telegramActive:snapshot?.telegram?.enabled===true,
    note:'Snapshot semasa sahaja; bukan rekod semua scan 24 jam. Satu coin boleh gagal beberapa syarat serentak.'
  };
}
