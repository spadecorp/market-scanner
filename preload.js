const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('market',{
  state:version=>ipcRenderer.invoke('state',version),
  refresh:()=>ipcRenderer.invoke('refresh'),
  exportCSV:(name,rows)=>ipcRenderer.invoke('csv',name,rows)
});
