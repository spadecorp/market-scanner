// Daily OHLC is dividend-adjusted. Volume and keys refer to exchange sessions.
const DAY = 86400000;
const cutoff = (day, n) => new Date(Date.parse(day) - n * DAY).toISOString().slice(0, 10);
const mean = values => values.reduce((a, b) => a + b, 0) / values.length;
const change = (value, base) => base > 0 ? (value / base - 1) * 100 : null;
const peak = bars => bars.reduce((best, b) => b.v > (best?.v || 0) ? b : best, null);
function weeklyScore(bars) {
  const last = bars.at(-1).day;
  const weeks = new Map();
  for (const b of bars) {
    if (b.day < cutoff(last, 365)) continue;
    const week = Math.floor((Date.parse(b.day) / DAY + 3) / 7);
    weeks.set(week, b.c);
  }
  const p = [...weeks.values()], n = p.length, q = Math.max(1, Math.floor(n / 4));
  if (n < 4) return null;
  return [p[n-q],p[n-2*q],p[n-3*q],p[0]].reduce((s,v,i)=>s+p[n-1]/v*(i===0?0.4:0.2),-1);
}
function isCandidate(bars) {
  const b = bars.at(-1);
  if (!b || b.c < 1 || b.v < 1000000) return false;
  const q = peak(bars.slice(0,-1).filter(x=>x.day >= cutoff(b.day,91)));
  return !!q && b.v >= q.v;
}
function scan(ticker, bars) {
  if (!isCandidate(bars)) return null;
  const b = bars.at(-1), prior = bars.slice(0,-1);
  const max = peak(prior), year = peak(prior.filter(x=>x.day>=cutoff(b.day,365)));
  const q = peak(prior.filter(x=>x.day>=cutoff(b.day,91)));
  const range = b.h-b.l;
  return {ticker,badge:b.v>=max.v?'History high':b.v>=year.v?'52-week':'Quarter',
    close:b.c,vol:b.v,year:year.v,record:max.v,recordDate:max.day,quarter:q.v,
    vsYear:b.v/year.v*100,vsRecord:b.v/max.v*100,buy:range>0?(b.c-b.l)/range*100:50,
    range:range/b.c*100,high:b.h,low:b.l};
}
function etfReturns(bars) {
  const b = bars.at(-1), priorYear = bars.findLast(x=>x.day.slice(0,4)<b.day.slice(0,4));
  return [1,5,21,63].map(n=>change(b.c,bars.at(-1-n)?.c)).concat(change(b.c,priorYear?.c));
}
function stageAt(bars, i) {
  if (i < 161) return null;
  const ma = end=>mean(bars.slice(end-149,end+1).map(b=>b.c));
  const avg = ma(i), slope = change(avg,ma(i-9)), price=bars[i].c;
  return {stage: price>avg ? (slope>0?2:3) : (slope>0?1:4), avg,slope,price};
}
const thresholds = [[1,4,'4'],[65,25,'25q'],[21,25,'25m'],[21,50,'50m'],[34,13,'13d']];
function breadth(bars, calendar) {
  const byDate = new Map(bars.map((b,i)=>[b.day,i]));
  const output = {};
  for (let pos=Math.max(0,calendar.length-40);pos<calendar.length;pos++) {
    const day=calendar[pos], i=byDate.get(day);
    if (i===undefined || i===0) continue;
    const b=bars[i], hit={};
    for (const [n,p,key] of thresholds) {
      const ref=bars[byDate.get(calendar[pos-n])];
      const pct=change(b.c,ref?.c);
      if (pct!==null && Math.abs(pct)+1e-9>=p) hit[(pct>0?'up':'down')+key]=pct;
    }
    const maWindow=bars.slice(Math.max(0,i-49),i+1);
    const validMA=maWindow.length===50 && maWindow[0].day===calendar[pos-49];
    const avg=validMA?mean(maWindow.map(x=>x.c)):null;
    if (avg && b.c>avg) hit.above50=change(b.c,avg);
    if (i>=15 && bars[i-14].day===calendar[pos-14]) {
      const tr=bars.slice(i-14,i).map((x,j)=>Math.max(x.h-x.l,Math.abs(x.h-bars[i-15+j].c),Math.abs(x.l-bars[i-15+j].c)));
      const atr=mean(tr);
      if (atr>0 && b.h-b.l>=10*atr) hit.atr=change(b.c,bars[i-1].c);
    }
    output[day]={price:b.c,hit,validMA,stage:stageAt(bars,i)?.stage};
  }
  return output;
}
function monitor(rows, spy) {
  const days=spy.slice(-40).map(b=>({day:b.day,spy:b.c,count:0,up4:0,down4:0,validMA:0,groups:{},stages:[0,0,0,0]}));
  for (const row of rows) for (const d of days) {
    const value=row.breadth?.[d.day];
    if (!value) continue;
    d.count++; if(value.validMA) d.validMA++;
    if(value.stage) d.stages[value.stage-1]++;
    for (const [metric,pct] of Object.entries(value.hit)) (d.groups[metric] ||= []).push([row.ticker,value.price,pct,row.sector,row.name]);
  }
  for (const [i,d] of days.entries()) {
    d.up4=d.groups.up4?.length||0;d.down4=d.groups.down4?.length||0;
    for(const n of [5,10]) {
      const window=days.slice(Math.max(0,i-n+1),i+1);
      const dn=window.reduce((s,x)=>s+x.down4,0);
      d['r'+n]=dn && window.length===n ? window.reduce((s,x)=>s+x.up4,0)/dn : null;
    }
    d.pct50=d.validMA?(d.groups.above50?.length||0)*100/d.validMA:null;
  }
  return days.slice(-30).reverse();
}
function rankings(rows) {
  const scored=rows.filter(r=>Number.isFinite(r.score)).sort((a,b)=>a.score-b.score);
  const ranks=new Map();
  let first=0;
  scored.forEach((r,i)=>{if(i && r.score!==scored[i-1].score) first=i;ranks.set(r.ticker,Math.min(99,1+Math.floor(first*99/scored.length)));});
  return ranks;
}
module.exports={cutoff,weeklyScore,isCandidate,scan,etfReturns,stageAt,breadth,monitor,rankings};
