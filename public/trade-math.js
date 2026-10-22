/** Fee-aware illustrations only. All percentages are per position; not guaranteed outcomes. */
export function tradePlan(entry, feePercent=0.1) {
  const e=Number(entry), pct=Number(feePercent);
  if(!Number.isFinite(e)||e<=0||!Number.isFinite(pct)||pct<0||pct>5)return null;
  const f=pct/100;
  const netExit=(netTargetPct)=>e*(1+f)*(1+netTargetPct/100)/(1-f);
  const netRoi=(exit)=>((exit/e)*(1-f)/(1+f)-1)*100;
  const slGross=e*.98;
  return { entry:e, feePercent:pct, breakeven:netExit(0), tp1Net:netExit(4),
    tp2Net:netExit(6), tp1Gross:e*1.04, tp2Gross:e*1.06,
    slGross, slNetPct:netRoi(slGross), tp1GrossNetPct:netRoi(e*1.04),
    tp2GrossNetPct:netRoi(e*1.06), rewardRisk4:4/Math.abs(netRoi(slGross)),
  };
}
