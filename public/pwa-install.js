// Browser installation is optional; no background signal or market caching.
let pendingInstall=null;
const installButton=document.getElementById('installAppBtn');
window.addEventListener('beforeinstallprompt',event=>{
  event.preventDefault();pendingInstall=event;
  if(installButton)installButton.hidden=false;
});
window.addEventListener('appinstalled',()=>{
  pendingInstall=null;
  if(installButton)installButton.hidden=true;
});
installButton?.addEventListener('click',async()=>{
  if(!pendingInstall)return;
  const prompt=pendingInstall;
  pendingInstall=null;
  installButton.hidden=true;
  try{await prompt.prompt();await prompt.userChoice;}catch(e){console.warn('PWA install prompt:',e?.message||e);}
});
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(err=>console.warn('Service worker registration:',err.message));
  });
}
