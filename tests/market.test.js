const test=require('node:test'),assert=require('node:assert/strict'),M=require('../metrics'),P=require('../provider'),{Engine}=require('../engine');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
function fixture(n=280){
  const bars=[];let date=new Date('2025-01-01T12:00Z');
  while(bars.length<n){
    if(![0,6].includes(date.getUTCDay())) bars.push({day:date.toISOString().slice(0,10),c:10,h:11,l:9,v:1000000});
    date.setUTCDate(date.getUTCDate()+1);
  }return bars;
}
test('record hierarchy, inclusive minimums, prior-only history, range and price',()=>{
  const b=fixture();b[0].v=9000000;b[100].v=5000000;b.at(-1).v=4000000;
  assert.equal(M.scan('A',b).badge,'Quarter');assert.equal(M.scan('A',b).buy,50);
  b.at(-1).v=5000000;assert.equal(M.scan('A',b).badge,'52-week');
  b.at(-1).v=9000000;assert.equal(M.scan('A',b).badge,'History high');assert.equal(M.scan('A',b).recordDate,b[0].day);
  b.at(-1).c=.99;assert.equal(M.scan('A',b),null);b.at(-1).c=1;b.at(-1).v=999999;assert.equal(M.scan('A',b),null);
  assert.equal(M.scan('IPO',[b[0]]),null);
});
test('breadth uses aligned sessions, full MA50, prior ATR and rolling ratios',()=>{
  const b=fixture();const cal=b.map(x=>x.day);const down=structuredClone(b);
  Object.assign(b.at(-1),{c:16,h:30,l:10});down.at(-1).c=6;
  const a=M.breadth(b,cal),z=M.breadth(down,cal);
  const latest=M.monitor([{ticker:'A',breadth:a},{ticker:'Z',breadth:z}],b)[0];
  assert.equal(latest.count,2);assert.equal(latest.up4,1);assert.equal(latest.down4,1);assert.equal(latest.r5,1);
  for(const k of ['up4','up25q','up25m','up50m','up13d','atr','above50'])assert.equal(latest.groups[k][0][0],'A');
  assert.equal(latest.pct50,50);assert.equal(M.monitor([{ticker:'A',breadth:a}],b)[0].r10,null);
  const gap=b.filter((_,i)=>i!==b.length-2);assert.equal(M.breadth(gap,cal)[cal.at(-1)].hit.up4,undefined);
});
test('fund return baselines, stage, close cutoff and split-adjusted range',()=>{
  const b=fixture();b.at(-1).c=11;assert.ok(M.etfReturns(b).every(v=>Math.abs(v-10)<1e-8));assert.equal(M.stageAt(b,b.length-1).stage,2);
  const t=Date.parse('2026-11-24T14:30Z')/1000;
  const r={chart:{result:[{timestamp:[t-86400,t],meta:{currentTradingPeriod:{regular:{end:t+6.5*3600}}},indicators:{quote:[{close:[10,20],high:[12,22],low:[8,18],volume:[12,30]}],adjclose:[{adjclose:[5,20]}]}}]}};
  assert.deepEqual(P.barsFromChart(r,(t+3600)*1000),[{day:'2026-11-23',c:5,h:6,l:4,v:12}]);assert.equal(P.barsFromChart(r,(t+7*3600)*1000).length,2);
});
test('offline restart and throttled resume preserve usable, session-aligned results',async()=>{
 const f=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'spade-')),'test.db'),b=fixture();b.at(-1).v=2000000;
 const today=P.formatDay(Date.now()),directory={nasdaq:{},other:{},members:{A:{sector:'Energy'}},industry:{}};
 for(const k of ['nasdaq','other','members','industry'])directory[k+'Day']=today;
 let throttle=false;
 const feed={directory:async()=>directory,chart:async t=>{if(throttle&&t==='SPY')throw Object.assign(Error('busy'),{status:429});return {bars:b,type:t==='A'?'EQUITY':'ETF'};}};
 let engine=new Engine(f,feed);await engine.refresh();let view=engine.snapshot();
 assert.equal(view.funds.length,30);assert.equal(view.memberCount,1);assert.equal(view.count,32);assert.equal(view.breadth.length,30);assert.equal(view.scan.length,32);assert.equal(view.stages.length,1);
 engine.db.close();engine=new Engine(f,feed);throttle=true;await engine.refresh();assert.equal(engine.snapshot().count,32);assert.match(engine.status.message,/rate limit/);
 throttle=false;let calls=0;feed.chart=async()=>{calls++;return {bars:b,type:'ETF'};};await engine.refresh();assert.equal(calls,1);engine.db.close();fs.rmSync(path.dirname(f),{recursive:true,force:true});
});

test('download progress counts persisted symbols and retries only missing data',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'market-progress-'));
  const db=path.join(dir,'cache.sqlite');
  const bars=fixture();
  let fail=true;
  const requested=[];
  const directory={nasdaq:{},other:{},members:{A:{sector:'Energy'}},industry:{}};
  for(const key of Object.keys(directory))directory[key+'Day']=P.formatDay(Date.now());
  const feed={directory:async()=>directory,chart:async ticker=>{
    requested.push(ticker);
    if(fail && ticker==='A')throw Object.assign(Error('Unavailable'),{status:404});
    return {bars,type:'ETF'};
  }};
  let engine=new Engine(db,feed);
  t.after(()=>{engine.db.close();fs.rmSync(dir,{recursive:true,force:true});});
  await engine.refresh();
  assert.equal(engine.status.loaded,engine.status.total-1);
  assert.equal(engine.snapshot().savedReady,engine.status.loaded);
  assert.match(engine.status.message,/Refresh to retry/);
  engine.db.close();
  engine=new Engine(db,feed);
  assert.equal(engine.snapshot().savedReady,engine.snapshot().total-1);
  requested.length=0;
  fail=false;
  await engine.refresh();
  assert.deepEqual([...new Set(requested)].sort(),['A','SPY']);
  assert.equal(engine.status.loaded,engine.status.total);
  assert.equal(engine.snapshot().savedReady,engine.status.total);
  assert.equal(engine.status.message,'Refresh complete');
});
