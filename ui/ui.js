'use strict';
const $=id=>document.getElementById(id);
const el=(tag,txt,cls)=>{const n=document.createElement(tag);if(txt!=null)n.textContent=txt;if(cls)n.className=cls;return n;};
function button(text,action,cls){const b=el('button',text,cls);b.onclick=action;return b;}
function select(label,values,value,apply){const s=el('select');s.setAttribute('aria-label',label);for(const [key,text] of values){const o=el('option',text);o.value=key;s.append(o);}s.value=value;s.onchange=()=>apply(s.value);return s;}
const num=(v,n=0)=>v==null||!Number.isFinite(v)?'—':v.toLocaleString('en-US',{minimumFractionDigits:n,maximumFractionDigits:n});
const pct=(v,n=1)=>v==null?'—':num(v,n)+'%';
const descriptions={scan:'Unusual daily volume across US listings. Minimum close $1 · Minimum volume 1M shares.',perf:'Compare sector and thematic ETFs, then inspect the stages of S&P 500 stocks.',monitor:'S&P 500 market breadth across the last 30 trading sessions. Select a count to see the stocks behind it.'};
const names={scan:'Volume Scanner',perf:'Sector Performance',monitor:'Market Monitor'};
const horizons=['1D','1W','1M','3M','YTD'];
const funds={'XLK':'Information Technology','XLF':'Financials','XLV':'Health Care','XLI':'Industrials','XLY':'Consumer Discretionary','XLP':'Consumer Staples','XLE':'Energy','XLU':'Utilities','XLB':'Materials','XLRE':'Real Estate','XLC':'Communication Services'};
const columns=[
 ['ticker','Ticker'],['badge','Record'],['type','Type'],['sector','Sector'],['close','Close',v=>num(v,2)],['vol','Volume',num],['year','52-week max',num],['record','History max',num],['recordDate','Record date'],['quarter','Quarter max',num],['vsYear','Vs 52-week',pct],['vsRecord','Vs history',pct],['rs','RS',num],['buy','Buy %',pct],['range','Day range %',pct],['short','Short float %',pct]
];
const defaultCols=['ticker','badge','sector','close','vol','rs','buy','vsRecord'];
let visibles;try{visibles=new Set(JSON.parse(localStorage.getItem('columns'))||defaultCols);}catch{visibles=new Set(defaultCols);}
visibles.add('ticker');
const metrics=[['up4','Up 4% · 1D'],['down4','Down 4% · 1D'],['r5','5D ratio'],['r10','10D ratio'],['up25q','Up 25% · Q'],['down25q','Down 25% · Q'],['up25m','Up 25% · M'],['down25m','Down 25% · M'],['up50m','Up 50% · M'],['down50m','Down 50% · M'],['up13d','Up 13% · 34D'],['down13d','Down 13% · 34D'],['atr','10× ATR'],['above50','Above 50D'],['count','Stocks'],['spy','SPY close']];
let data={version:-1,day:'',scan:[],funds:[],breadth:[],stages:[],count:0,total:0},status={},view='scan',period=0,sector='',badge='',type='',query='',sort='vsRecord',desc=true;
let rangeKey='vol',min='',max='';
function nav(key){view=key;for(const b of document.querySelectorAll('nav button')){if(b.dataset.view===key)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');}$('title').textContent=names[key];$('description').textContent=descriptions[key];document.querySelector('.content').scrollTop=0;render();}
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>nav(b.dataset.view));
let scanMode='list';
function setScanMode(mode){
  scanMode=mode;
  for(const b of $('scanViews').querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.mode===mode));
}
for(const b of $('scanViews').querySelectorAll('button'))b.onclick=()=>{setScanMode(b.dataset.mode);render();};
function scanSector(s){setScanMode('list');sector=s;badge='';type='';query='';min='';max='';nav('scan');}
function stat(label,value,action){const card=action?button('',action,'stat'):el('div',null,'stat');card.append(el('small',label),el('strong',value));return card;}
function empty(heading,hint){const box=el('div',null,'empty');box.append(el('b',heading),el('span',hint));return box;}
function table(headers){const t=el('table'),head=el('thead'),tr=el('tr'),body=el('tbody');headers.forEach(h=>{const th=el('th');th.append(h);tr.append(th);});head.append(tr);t.append(head,body);const wrap=el('div',null,'gridwrap');wrap.append(t);return {wrap,body};}
function row(body,cells){const tr=el('tr');for(const c of cells){const td=el('td');td.append(c??'—');tr.append(td);}body.append(tr);return tr;}
function filtered(){return data.scan.filter(r=>(!sector||r.sector===sector)&&(!badge||r.badge===badge)&&(!type||r.type===type)&&(!query||(r.ticker+' '+r.name).toUpperCase().includes(query.toUpperCase()))&&(min===''||r[rangeKey]!=null&&r[rangeKey]>=Number(min))&&(max===''||r[rangeKey]!=null&&r[rangeKey]<=Number(max))).sort((a,b)=>{const x=a[sort],y=b[sort];if(x==null||y==null)return x==null?(y==null?0:1):-1;return (typeof x==='number'?x-y:String(x).localeCompare(String(y)))*(desc?-1:1);});}
async function exportRows(name,rows){try{await window.market.exportCSV(name+'-'+(data.day||'scan'),rows);}catch{$('syncText').textContent='CSV could not be saved. Choose another location and retry.';}}
function searchBox(value,placeholder,action){const f=el('input');f.value=value;f.type='search';f.placeholder=placeholder;f.setAttribute('aria-label',placeholder);f.oninput=()=>action(f.value);return f;}
function reset(){sector=badge=type=query=min=max='';render();}
function scanTools(){
  const pool=[...new Set([...data.scan.map(r=>r.sector),...(sector?[sector]:[])])].sort();
  const bar=$('tools');
  bar.append(searchBox(query,'Find ticker or name',v=>{query=v;scanBody();}),
    select('Record type',[['','All records'],...['History high','52-week','Quarter'].map(x=>[x,x])],badge,v=>{badge=v;render();}),
    select('Sector',[['','All sectors'],...pool.map(x=>[x,x])],sector,v=>{sector=v;render();}),
    select('Security type',[['','All types'],['Stock','Stocks'],['ETF','ETFs']],type,v=>{type=v;render();}),
    button('Reset',reset),button('Export CSV',()=>exportRows('Volume',[columns.map(c=>c[1]),...filtered().map(r=>columns.map(c=>r[c[0]]))])));
  const more=el('details');more.append(el('summary',scanMode==='list'?'Columns & numeric filter':'Numeric filter'));
  const cols=el('div',null,'columns');
  for(const [k,label] of columns){const l=el('label'),cb=el('input');cb.type='checkbox';cb.checked=visibles.has(k);cb.disabled=k==='ticker';cb.onchange=()=>{cb.checked?visibles.add(k):visibles.delete(k);localStorage.setItem('columns',JSON.stringify([...visibles]));scanBody();};l.append(cb,label);cols.append(l);}
  const ranges=el('div',null,'chips');
  const makeLimit=(name,v,fn)=>{const input=el('input');input.type='number';input.placeholder=name;input.setAttribute('aria-label',name);input.value=v;input.oninput=()=>{fn(input.value);scanBody();};return input;};
  ranges.append(select('Numeric column',columns.filter(c=>c[2]).map(c=>[c[0],c[1]]),rangeKey,v=>{rangeKey=v;scanBody();}),makeLimit('Minimum',min,v=>min=v),makeLimit('Maximum',max,v=>max=v));
  if(scanMode==='list')more.append(cols);more.append(ranges);bar.append(more);
}
function scanBody(){
  const box=$('body'),rows=filtered(),cols=columns.filter(c=>visibles.has(c[0]));box.replaceChildren();
  if(scanMode==='heat'){heat(rows);return;}
  if(!rows.length){box.append(empty(data.count?'No matching volume records':'Waiting for daily bars',data.scan.length?'Change the filters to see more symbols.':data.count?'No qualifying records among the symbols processed for this session.':'Results appear as symbols finish loading.'));return;}
  const {wrap,body}=table(cols.map(([key,title])=>button(title+(key===sort?(desc?' ↓':' ↑'):''),()=>{desc=sort===key?!desc:typeof rows[0][key]==='number';sort=key;scanBody();})));
  for(const r of rows)row(body,cols.map(([k,,format])=>k==='ticker'?button(r.ticker,()=>stockDetail(r),'link'):format?format(r[k]):r[k]));
  box.append(el('p',rows.length+' matching · ranked from up to 300 results','note'),wrap);
}
function stockDetail(r){
  const {wrap,body}=table(['Measure','Value']);for(const [k,title,format] of columns)row(body,[title,format?format(r[k]):r[k]]);
  modal(r.ticker+' · '+r.name,wrap);
}
function modal(title,content,tools=[]){$('detailTitle').textContent=title;$('detailTools').replaceChildren(...tools);$('detailBody').replaceChildren(content);if(!$('detail').open)$('detail').showModal();}
$('dismiss').onclick=()=>$('detail').close();
$('detail').addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();$('detail').close();}
},true);
function stockList(title,stocks,lastLabel){
  let q='',group=false;
  const list=()=>stocks.filter(r=>(r[0]+' '+r[4]+' '+r[3]).toUpperCase().includes(q.toUpperCase())).sort((a,b)=>group?String(a[3]).localeCompare(String(b[3]))||Math.abs(b[2])-Math.abs(a[2]):Math.abs(b[2])-Math.abs(a[2]));
  const make=()=>{const {wrap,body}=table(['Ticker','Name','Sector','Close',lastLabel]);list().forEach(r=>row(body,[r[0],r[4],r[3],num(r[1],2),pct(r[2],2)]));return wrap;};
  const groupBtn=button('Group by sector',()=>{group=!group;groupBtn.setAttribute('aria-pressed',String(group));$('detailBody').replaceChildren(make());});
  modal(title,make(),[searchBox('','Search stocks',v=>{q=v;$('detailBody').replaceChildren(make());}),groupBtn,button('Export CSV',()=>exportRows('Stocks',[['Ticker','Name','Sector','Close',lastLabel],...list().map(r=>[r[0],r[4],r[3],r[1],r[2]])]))]);
}
function heat(rows){
  const groups=Map.groupBy(rows,r=>r.sector),sorted=[...groups].sort((a,b)=>b[1].length-a[1].length||a[0].localeCompare(b[0]));
  if(!rows.length){$('body').append(empty(data.scan.length?'No matching volume records':'Waiting for volume records',data.scan.length?'Change the filters to see more sectors.':'Sector tiles appear when stocks qualify for the scanner.'));return;}
  $('body').append(el('p',num(rows.length)+' matching · '+num(groups.size)+' sectors · Select a sector to see its stocks.','note'));
  const tiles=el('div',null,'tiles');for(const [s,stocks] of sorted){
    const b=button('',()=>{sector=s;setScanMode('list');render();},'tile');b.style.background='rgba(255,201,14,'+(.035+.16*stocks.length/sorted[0][1].length)+')';
    const top=[...stocks].sort((a,b)=>b.vol-a.vol).slice(0,3).map(r=>r.ticker).join(' · ');
    b.append(el('b',s),el('strong',num(stocks.length)),el('span',top),el('span','Avg buy '+pct(stocks.reduce((v,r)=>v+r.buy,0)/stocks.length)));tiles.append(b);
  }$('body').append(tiles);
}
function stages(){
  if(!data.stages.length)return;
  const box=$('body');box.append(el('h3','S&P 500 stage analysis'),el('p','Price versus the 150-session average and its slope. Select a stage count for the underlying stocks.','note'));
  const hist=[...data.breadth].reverse(),colors=['#88a1be','#72d5ab','#ffc90e','#e28989'];
  const chart=el('div',null,'stagechart');
  for(const d of hist){const bar=el('div');const total=d.stages.reduce((a,b)=>a+b,0);bar.title=d.day+' · '+d.stages.join(' / ');d.stages.forEach((n,i)=>{const strip=el('i');strip.style.height=(total?100*n/total:0)+'%';strip.style.background=colors[i];bar.append(strip);});chart.append(bar);}
  const key=el('div',null,'stagekey');['S1 Basing','S2 Advancing','S3 Topping','S4 Declining'].forEach((s,i)=>{const l=el('span',s);l.style.color=colors[i];key.append(l);});
  box.append(chart,key);
  const {wrap,body}=table(['Sector','S1','S2','S3','S4','Stocks']);
  const groups=Map.groupBy(data.stages,r=>r.sector);
  for(const [s,stocks] of [['All sectors',data.stages],...[...groups].sort((a,b)=>a[0].localeCompare(b[0]))]){
    row(body,[s,...[1,2,3,4].map(n=>{const set=stocks.filter(r=>r.stage===n);return set.length?button(num(set.length),()=>stockList(s+' · Stage '+n,set.map(r=>[r.ticker,r.price,r.slope,r.sector,r.name]),'MA150 slope %'),'link'):'0';}),num(stocks.length)]);
  }box.append(wrap);
}
function perf(){
  const segment=el('div',null,'segments');horizons.forEach((s,i)=>{const b=button(s,()=>{period=i;render();});b.setAttribute('aria-pressed',String(i===period));segment.append(b);});
  $('tools').append(segment,el('span',num(data.funds.length)+' / 30 ETFs loaded','subtle'));
  const list=data.funds.filter(r=>r.perf[period]!=null).sort((a,b)=>b.perf[period]-a.perf[period]);
  $('stats').append(stat('Leading ETF',list[0]?.ticker||'—'),stat('Leading return',pct(list[0]?.perf[period],2)),stat('Positive ETFs',list.length?num(list.filter(r=>r.perf[period]>0).length)+' / '+list.length:'—'));
  if(!list.length){$('body').append(empty('Waiting for ETF history','Returns appear when two comparable closes are available.'));stages();return;}
  const bars=el('div',null,'bars'),scale=Math.max(...list.map(x=>Math.abs(x.perf[period])),.01);
  for(const r of list){const v=r.perf[period],line=el('div',null,'fund'),track=el('div',null,'track'),bar=el('i');bar.style[v>=0?'left':'right']='50%';bar.style.width=50*Math.abs(v)/scale+'%';bar.style.background=v>=0?'var(--up)':'var(--down)';track.append(bar);line.append(funds[r.ticker]?button(r.name,()=>scanSector(funds[r.ticker])):el('span',r.name),el('code',r.ticker,'subtle'),track,el('b',(v>0?'+':'')+pct(v,2),v>=0?'pos':'neg'));bars.append(line);}
  $('body').append(bars,el('p','Adjusted close returns · 1, 5, 21 and 63 sessions · YTD from the prior year-end close.','note'));stages();
}
// These count bands follow the original S&P 500 Market Monitor.
const breadthBands={
  dailyUp:[[40,'green3'],[20,'green2'],[8,'green1']],
  dailyDown:[[40,'red3'],[20,'red2'],[8,'red1']],
  periodUp:[[50,'green3'],[35,'green2'],[25,'green1'],[10,'muted'],[0,'red1']],
  periodDown:[[50,'red3'],[35,'red2'],[25,'red1'],[10,'muted'],[0,'green2']],
  up34:[[35,'green3'],[20,'green2'],[10,'green1']],
  down34:[[80,'red3'],[50,'red2'],[25,'red1'],[10,'muted'],[0,'green2']],
  atr:[[10,'purple3'],[5,'purple2'],[2,'purple1']],
  above50:[[70,'green2'],[50,'positive'],[30,'amber'],[0,'negative']]
};
const breadthModes={up4:'dailyUp',down4:'dailyDown',up25q:'periodUp',down25q:'periodDown',
  up25m:'periodUp',down25m:'periodDown',up50m:'periodUp',down50m:'periodDown',
  up13d:'up34',down13d:'down34',atr:'atr',above50:'above50'};
function breadthTone(key,value){
  if(!Number.isFinite(value)||key==='count')return 'muted';
  const bands=breadthBands[breadthModes[key]];
  return bands?(bands.find(([minimum])=>value>=minimum)?.[1]||'muted'):'plain';
}
function monitorTable(){
  const {wrap,body}=table([]);
  wrap.classList.add('breadth-grid');
  const head=wrap.querySelector('thead'),groups=head.rows[0],labels=head.insertRow();
  function header(parent,text,cols=1,rows=1,cls=''){
    const th=el('th',text,cls);
    th.scope=cols>1?'colgroup':'col';th.colSpan=cols;th.rowSpan=rows;parent.append(th);
  }
  header(groups,'Date',1,2);
  header(groups,'Primary breadth indicators',4,1,'primary');
  header(groups,'Secondary breadth indicators',8,1,'secondary');
  for(const [,label] of metrics.slice(12))header(groups,label,1,2);
  for(const [,label] of metrics.slice(0,12))header(labels,label);
  return {wrap,body};
}
function monitor(){
  const days=data.breadth,latest=days[0];
  $('stats').append(stat('Up 4% or more',num(latest?.up4)),stat('Down 4% or more',num(latest?.down4)),stat('Above 50-day MA',pct(latest?.pct50)));
  $('tools').append(el('span',(data.memberSource||'')+' · '+num(data.memberCount)+' / '+num(data.targetMembers)+' constituents loaded','subtle'));
  if(!days.length){$('body').append(empty('Waiting for constituent history','Breadth counts appear as S&P 500 stocks finish loading.'));return;}
  const legend=el('div',null,'breadth-legend');
  for(const [label,cls] of [['Bullish','bull'],['Bearish','bear'],['ATR extension','atr']])legend.append(el('span',label,cls));
  $('tools').append(legend);
  const {wrap,body}=monitorTable();
  for(const d of days){
    const tr=body.insertRow();
    tr.insertCell().textContent=d.day;
    for(const [key,label] of metrics){
      const stocks=d.groups[key]||[];
      const value=key==='above50'?d.pct50:breadthModes[key]?stocks.length:d[key];
      const display=key==='above50'?pct(value):num(value,['spy','r5','r10'].includes(key)?2:0);
      const cell=tr.insertCell();
      cell.className=breadthTone(key,value);
      if(stocks.length){
        const changeLabel=key==='above50'?'Above MA %':key==='atr'?'Daily change %':'Change %';
        const detail=button(display,()=>stockList(label+' · '+d.day,stocks,changeLabel));
        detail.setAttribute('aria-label',label+' · '+d.day+' · '+display+' · View stocks');
        cell.append(detail);
      }else cell.textContent=display;
    }
  }
  $('body').append(wrap,el('p','M = 21 sessions · Q = 65 sessions · Ratios divide the sum of up-4% counts by the sum of down-4% counts. A dash indicates an unavailable value.','note'));
}
function render(){for(const id of ['stats','tools','body'])$(id).replaceChildren();
  $('scanViews').hidden=view!=='scan';
  if(view==='scan'){
    for(const k of ['History high','52-week','Quarter'])$('stats').append(stat(k==='History high'?'Volume high since 2010':k+' volume high',data.count?num(data.scan.filter(r=>r.badge===k).length):'—',()=>{badge=badge===k?'':k;render();}));
    scanTools();scanBody();
  }else if(view==='perf')perf();else monitor();
}
let latestVersion=-1,dirty=false;
async function poll(){
  try{
    const result=await window.market.state(latestVersion);status=result.status;
    if(result.view){data=result.view;latestVersion=data.version;dirty=true;}
    $('syncText').textContent=status.message;$('progressCount').textContent=status.running&&status.total?num(status.done)+' / '+num(status.total)+' checked':'';
    const p=$('progress');p.hidden=!status.running;if(status.total){p.max=status.total;p.value=status.done;}else p.removeAttribute('value');
    $('refresh').disabled=status.running;$('dateTag').textContent=data.day?'Session '+data.day:'Awaiting market session';
    $('coverage').textContent=(data.directory||'')+' · '+num(data.count)+' / '+num(data.total)+' symbols';
    if(dirty&&!$('detail').open&&!$('tools').contains(document.activeElement)&&!$('tools').querySelector('details[open]')){render();dirty=false;}
  }catch{$('syncText').textContent='The local data service is unavailable. Reopen the application to reconnect.';}
  finally{setTimeout(poll,1800);}
}
$('refresh').onclick=async()=>{$('refresh').disabled=true;await window.market.refresh();};
nav('scan');poll();
