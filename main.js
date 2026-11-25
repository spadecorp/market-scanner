'use strict';
const {app,BrowserWindow,ipcMain,net,dialog}=require('electron');
const {Engine}=require('./engine');
const {provider}=require('./provider');
const path=require('node:path'),fs=require('node:fs/promises');
app.setName('Market Scanner');
// Keep the original profile so upgrades reuse cached sessions and saved columns.
if(!app.commandLine.hasSwitch('user-data-dir')){
  app.setPath('userData',path.join(app.getPath('appData'),'SPaDe Market Scanner'));
}
if(process.platform==='win32' && !app.requestSingleInstanceLock()) app.quit();
else {
  let win,engine;
  app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.focus();}});
  app.whenReady().then(async()=>{
    app.setAppUserModelId('com.spadecorp.marketscanner');
    const proxyConfigured=['HTTPS_PROXY','https_proxy','HTTP_PROXY','http_proxy'].some(k=>process.env[k]);
    if(proxyConfigured) require('node:http').setGlobalProxyFromEnv();
    const fetchData=proxyConfigured ? globalThis.fetch : (url,options)=>net.fetch(url,options);
    engine=new Engine(path.join(app.getPath('userData'),'market.sqlite'),provider(fetchData));
    win=new BrowserWindow({width:1420,height:920,minWidth:820,minHeight:600,backgroundColor:'#0e1013',title:'Market Scanner',icon:path.join(__dirname,'ui','icon.png'),autoHideMenuBar:true,
      webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
    win.removeMenu();win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    win.webContents.on('will-navigate',e=>e.preventDefault());
    win.webContents.session.setPermissionRequestHandler((_wc,_p,cb)=>cb(false));
    ipcMain.handle('state',(_event,version)=>({status:engine.status,view:version===engine.version?null:engine.snapshot()}));
    ipcMain.handle('refresh',()=>{void engine.refresh();});
    ipcMain.handle('csv',async(_e,name,rows)=>{
      if(!Array.isArray(rows)||rows.length>12000||!rows.every(r=>Array.isArray(r)&&r.length<60)) return;
      const {canceled,filePath}=await dialog.showSaveDialog(win,{defaultPath:'SPaDe-'+String(name).replace(/[^a-zA-Z0-9-]/g,'')+'.csv',filters:[{name:'CSV',extensions:['csv']}]});
      if(canceled)return false;
      const cell=v=>{
        let s=String(v??'');
        if(typeof v==='string' && /^[\s]*[=+@\-]/.test(s))s="'"+s;
        return '"'+s.replaceAll('"','""')+'"';
      };
      await fs.writeFile(filePath,'\ufeff'+rows.map(r=>r.map(cell).join(',')).join('\r\n'));return true;
    });
    await win.loadFile(path.join(__dirname,'ui','index.html'));
    void engine.refresh();
  }).catch(e=>{dialog.showErrorBox('Market Scanner','The application could not open. '+e.message);app.quit();});
  app.on('window-all-closed',()=>app.quit());
}
