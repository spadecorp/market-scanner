const seed = require('./data/universe.json');
const usDay = new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
const formatDay = ms => usDay.format(new Date(ms));
const symbolOK = t => /^[A-Z]{1,5}(?:-[A-Z])?$/.test(t);
function csv(text) {
  return text.trim().split(/\r?\n/).map(line=>(line.match(/("(?:[^"]|"")*"|[^,]*)(,|$)/g)||[])
    .map(x=>x.replace(/,$/,'').replace(/^"|"$/g,'').replace(/""/g,'"')));
}
function listing(text) {
  const rows=text.trim().split(/\r?\n/).map(l=>l.split('|')), header=rows.shift();
  if (!header.includes('ETF') || !header.includes('Test Issue')) throw Error('Invalid listing directory');
  const out={};
  for (const row of rows) {
    const ticker=row[0].trim().replace('.','-');
    if (symbolOK(ticker) && row[header.indexOf('Test Issue')]==='N') out[ticker]={name:row[1],type:row[header.indexOf('ETF')]==='Y'?'ETF':'Stock'};
  }
  if(Object.keys(out).length<500) throw Error('Incomplete listing directory');
  return out;
}
const sectorNames={'Technology':'Information Technology','Healthcare':'Health Care','Health Care':'Health Care','Finance':'Financials','Financial Services':'Financials','Basic Materials':'Materials','Industrials':'Industrials','Consumer Defensive':'Consumer Staples','Consumer Cyclical':'Consumer Discretionary','Telecommunications':'Communication Services'};
function constituents(text) {
  const rows=csv(text), h=rows.shift(), out={};
  for(const row of rows) {
    const ticker=row[h.indexOf('Symbol')]?.replace('.','-');
    if(symbolOK(ticker||'')) out[ticker]={sector:row[h.indexOf('GICS Sector')],name:row[h.indexOf('Security')]};
  }
  if(Object.keys(out).length<480) throw Error('Incomplete S&P list');
  return out;
}
function barsFromChart(data, now=Date.now()) {
  const r=data.chart?.result?.[0];
  if(!r?.timestamp?.length) throw Error('Missing Yahoo daily bars');
  const q=r.indicators.quote[0], adj=r.indicators.adjclose?.[0]?.adjclose;
  const today=formatDay(now), period=r.meta.currentTradingPeriod?.regular;
  const reportedDay=period?.end ? formatDay(period.end*1000) : '';
  const fallbackClose= +new Intl.DateTimeFormat('en-US',{hour:'2-digit',hourCycle:'h23',timeZone:'America/New_York'}).format(now)>=17;
  const complete=reportedDay===today ? now >= period.end*1000+15*60000 : fallbackClose;
  const bars=new Map();
  r.timestamp.forEach((ts,i)=>{
    const day=formatDay(ts*1000);
    if(day>today || (day===today && !complete)) return;
    const raw=q.close[i], high=q.high[i], low=q.low[i], v=q.volume[i];
    if(!(raw>0 && high>=low && low>0 && Number.isFinite(v) && v>=0)) return;
    const factor=adj?.[i]>0?adj[i]/raw:1;
    bars.set(day,{day,c:raw*factor,h:high*factor,l:low*factor,v});
  });
  return [...bars.values()].sort((a,b)=>a.day.localeCompare(b.day));
}
function provider(fetcher) {
  async function request(url,mode='json') {
    const response=await fetcher(url,{signal:AbortSignal.timeout(25000),headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36','Accept':'*/*'}});
    if(!response.ok) {const e=Error('HTTP '+response.status);e.status=response.status;throw e;}
    return response[mode]();
  }
  // Anonymous Yahoo session. Missing optional fields remain blank.
  let crumb, crumbTask, retryMetaAfter=0;
  async function anonymousCrumb(){
    await fetcher('https://fc.yahoo.com/',{signal:AbortSignal.timeout(6000)}).catch(()=>{});
    const token=(await request('https://query1.finance.yahoo.com/v1/test/getcrumb','text')).trim();
    if(!token || token.length>64 || /[<>\s]/.test(token)) throw Error('Optional metadata unavailable');
    return token;
  }
  return {
    async fundamentals(ticker){
      if(Date.now()<retryMetaAfter) return null;
      try{
        if(!crumb){crumbTask ||= anonymousCrumb();crumb=await crumbTask;}
        const data=await request('https://query1.finance.yahoo.com/v10/finance/quoteSummary/'+encodeURIComponent(ticker)+'?modules=defaultKeyStatistics&crumb='+encodeURIComponent(crumb));
        const pct=data.quoteSummary?.result?.[0]?.defaultKeyStatistics?.shortPercentOfFloat?.raw;
        return Number.isFinite(pct)?pct*100:null;
      }catch{crumb=null;crumbTask=null;retryMetaAfter=Date.now()+3600000;return null;}
    },
    async chart(ticker, day) {
      const end=day?Date.parse(day)/1000+86400:null;
      const params=day?'period1=1262304000&period2='+end:'range=2y';
      const url='https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(ticker)+'?interval=1d&'+params;
      const data=await request(url);
      const bars=barsFromChart(data);
      if(!bars.length) throw Error('No completed sessions');
      const meta=data.chart.result[0].meta;
      if(day && meta.firstTradeDate) {
        const since=Math.max(Date.UTC(2010,0,1),meta.firstTradeDate*1000);
        if(Date.parse(bars[0].day)>since+14*86400000) throw Error('Record history is incomplete');
      }
      return {bars,type:meta.instrumentType};
    },
    async directory(previous={}) {
      const tasks=[
        ['nasdaq','https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt',listing],
        ['other','https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt',listing],
        ['members','https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv',constituents],
        ['industry','https://api.nasdaq.com/api/screener/stocks?download=true',text=>{
          const out={};for(const r of JSON.parse(text).data.rows) if(symbolOK(r.symbol)&&r.sector) out[r.symbol]=sectorNames[r.sector]||r.sector;
          if(!Object.keys(out).length) throw Error('Missing sectors');return out;
        }]
      ];
      const result={...previous};
      await Promise.all(tasks.map(async ([key,url,parse])=>{
        try{result[key]=parse(await request(url,'text'));result[key+'Day']=formatDay(Date.now());}catch{}
      }));
      return result;
    }
  };
}
function universe(dir) {
  const members=dir.members||Object.fromEntries(Object.entries(seed.members).map(([t,sector])=>[t,{sector}]));
  const listed={...dir.nasdaq,...dir.other},etfs=new Set(seed.etfs);
  const fallback=(!dir.nasdaq||!dir.other)?seed.seed:[];
  const order=[...new Set(['SPY',...Object.keys(seed.funds),...Object.keys(members),...Object.keys(listed),...fallback])];
  const symbols=order.map(ticker=>({ticker,name:members[ticker]?.name||listed[ticker]?.name||ticker,
    type:listed[ticker]?.type||(etfs.has(ticker)||seed.funds[ticker]?'ETF':'Stock'),
    sector:members[ticker]?.sector||dir.industry?.[ticker]||((listed[ticker]?.type==='ETF'||etfs.has(ticker)||seed.funds[ticker])?'ETF':'Unclassified'),
    member:!!members[ticker],fund:seed.funds[ticker]||null}));
  return {symbols,memberCount:Object.keys(members).length};
}
module.exports={provider,barsFromChart,universe,csv,constituents,listing,formatDay};
