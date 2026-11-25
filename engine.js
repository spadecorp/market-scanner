const {DatabaseSync}=require('node:sqlite');
const {universe,formatDay}=require('./provider');
const M=require('./metrics');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
class Engine {
  constructor(file, feed) {
    this.feed=feed;
    this.db=new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;
      CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY,v TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS results(session TEXT,ticker TEXT,value TEXT NOT NULL,PRIMARY KEY(session,ticker));`);
    this.saveMeta=this.db.prepare('INSERT OR REPLACE INTO meta VALUES(?,?)');
    this.write=this.db.prepare('INSERT OR REPLACE INTO results VALUES(?,?,?)');
    this.day=this.get('active',''); this.spy=this.get('spy.'+this.day,[]);
    this.list=universe(this.get('directory',{}));
    this.loadDay();
    this.status={running:false,message:this.day?'Saved session ready':'Waiting for the first refresh',done:0,total:0,failed:0};
    this.version=0;this.cached=null;this.retryTimer=null;this.retryStep=0;
  }
  get(k,otherwise) {
    const row=this.db.prepare('SELECT v FROM meta WHERE k=?').get(k);
    return row?JSON.parse(row.v):otherwise;
  }
  put(k,v){this.saveMeta.run(k,JSON.stringify(v));}
  loadDay(){
    this.rows=new Map();
    for(const {ticker,value} of this.db.prepare('SELECT ticker,value FROM results WHERE session=?').iterate(this.day)) this.rows.set(ticker,JSON.parse(value));
  }
  activate(day,spy){
    if(this.day!==day) {this.day=day;this.loadDay();}
    this.spy=spy;this.put('spy.'+day,spy);this.put('active',day);
    this.db.prepare('DELETE FROM results WHERE session < ?').run(M.cutoff(day,8));
    this.db.prepare("DELETE FROM meta WHERE k LIKE 'spy.%' AND k < ?").run('spy.'+M.cutoff(day,8));
    this.version++;
  }
  snapshot(){
    if(this.cached?.version===this.version) return this.cached;
    const all=this.list.symbols.map(s=>{const row=this.rows.get(s.ticker);return row?{...s,...row}:null;}).filter(Boolean);
    const ranks=M.rankings(all), scan=all.filter(r=>r.scan).map(r=>({...r.scan,name:r.name,sector:r.sector,type:r.type,rs:ranks.get(r.ticker),short:r.short??null}))
      .sort((a,b)=>b.vsRecord-a.vsRecord||a.ticker.localeCompare(b.ticker)).slice(0,300);
    const funds=all.filter(r=>r.fund&&r.perf).map(r=>({name:r.fund,ticker:r.ticker,perf:r.perf}));
    const members=all.filter(r=>r.member&&r.breadth);
    const stages=members.filter(r=>r.stage).map(r=>({ticker:r.ticker,sector:r.sector,name:r.name,...r.stage}));
    const dir=this.get('directory',{}), seeds=!dir.nasdaq||!dir.other;
    this.cached={version:this.version,day:this.day,scan,funds,breadth:members.length?M.monitor(members,this.spy):[],stages,
      count:all.length,total:this.list.symbols.length,memberCount:members.length,targetMembers:this.list.memberCount,
      directory:seeds?'Limited listings · fallback in use':'Nasdaq Trader listings',memberSource:dir.members?'Constituent list '+dir.membersDay:'Bundled constituent fallback'};
    return this.cached;
  }
  retryThrottled(){
    const minutes=[5,15,30][Math.min(this.retryStep++,2)];
    this.status.message='Yahoo rate limit reached. Progress saved. Retrying in '+minutes+' minutes.';
    this.retryTimer=setTimeout(()=>{void this.refresh();},minutes*60000);
    this.retryTimer.unref();
  }
  async refresh(){
    if(this.status.running) return;
    clearTimeout(this.retryTimer);
    this.status={running:true,done:0,total:0,failed:0,message:'Checking Yahoo for the latest completed session…'};
    let stopped=false,limited=false,failureStreak=0;
    try{
      const {bars:spy}=await this.feed.chart('SPY'), target=spy.at(-1).day;
      if(this.day && target<this.day) throw Error('Yahoo returned an older session. Your saved session is available.');
      let dir=this.get('directory',{});
      if(['nasdaq','other','members','industry'].some(k=>!dir[k+'Day']||dir[k+'Day']<M.cutoff(formatDay(Date.now()),6))) {
        this.status.message='Loading US listings and S&P 500 constituents…';
        dir=await this.feed.directory(dir);this.put('directory',dir);
      }
      this.list=universe(dir);
      const {symbols}=this.list, calendar=spy.map(b=>b.day);
      const pending=[];
      for(const s of symbols) {
        const cached=this.day===target && this.rows.get(s.ticker);
        if(!cached || (s.member && !cached.breadth) || (s.fund && !cached.perf)) pending.push(s);
      }
      Object.assign(this.status,{done:symbols.length-pending.length,total:symbols.length,message:'Loading daily volume and sector data…'});
      let pos=0,activated=false;
      const run=async()=>{
        while(pos<pending.length && !stopped){
          const s=pending[pos++];
          try{
            const {bars:history,type}=s.ticker==='SPY'?{bars:spy,type:'ETF'}:await this.feed.chart(s.ticker);
            const bars=history.filter(b=>b.day<=target);
            if(bars.at(-1)?.day!==target) throw Error('Missing target session');
            let scan=null;
            if(M.isCandidate(bars)){
              const full=(await this.feed.chart(s.ticker,target)).bars.filter(b=>b.day<=target&&b.day>='2010-01-01');
              if(full.at(-1)?.day!==target||full.length<2||full[0].day>bars[0].day) throw Error('Incomplete record history');
              scan=M.scan(s.ticker,full);
            }
            const row={ticker:s.ticker,type:type==='ETF'||type==='MUTUALFUND'?'ETF':s.type,score:M.weeklyScore(bars),scan,
              perf:s.fund?M.etfReturns(bars):null,stage:s.member?M.stageAt(bars,bars.length-1):null,breadth:s.member?M.breadth(bars,calendar):null};
            if(scan && this.feed.fundamentals) row.short=await this.feed.fundamentals(s.ticker);
            this.write.run(target,s.ticker,JSON.stringify(row));
            if(!activated){this.activate(target,spy);activated=true;}
            this.rows.set(s.ticker,row);this.version++; failureStreak=0;
          }catch(e){
            this.status.failed++;
            if(e.status===429){limited=true;stopped=true;}
            else if(e.status!==404 && !/Missing target session|No completed sessions|Missing Yahoo daily bars/.test(e.message) && ++failureStreak>=16) stopped=true;
          }
          this.status.done++;
          await delay(180);
        }
      };
      await Promise.all(Array.from({length:3},run));
      if(!pending.length) {this.activate(target,spy);}
      const missing=symbols.length-(this.day===target?symbols.filter(s=>this.rows.has(s.ticker)).length:0);
      this.status.message=limited?'Yahoo rate limit reached. Saved progress is available. Retry later.':
        stopped?'Data service unavailable. Saved progress is available. Retry to resume.':
        missing?missing.toLocaleString()+' symbols unavailable for this session. Retry to fill gaps.':'Refresh complete';
      if(limited) this.retryThrottled(); else this.retryStep=0;
    }catch(e){
      this.status.message=e.status===429?'Yahoo rate limit reached. Retry later.':('Refresh unavailable. '+(this.day?'Showing saved data. ':'')+(e.message||'Check your connection.'));
      if(e.status===429) this.retryThrottled();
    }finally{this.status.running=false;this.version++;}
  }
}
module.exports={Engine};
