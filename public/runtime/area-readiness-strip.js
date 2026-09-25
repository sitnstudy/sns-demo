// Grow the mobile dock before revealing its completion card. The figure is not
// part of this layout, so an expanded dock may overlay it without moving it.
export function createAreaReadinessStrip(dialog, getHost, {isMobile = () => innerWidth <= 650} = {}) {
  let epoch=0, animation, initialHeight;
  function cancel() {
    epoch++;animation?.cancel();animation=undefined;
    const host=getHost();
    if(host){host.style.removeProperty('height');delete host.dataset.revealing;}
    dialog.style.removeProperty('opacity');dialog.style.removeProperty('animation');
  }
  function beforeShow() {
    if(!isMobile())return;
    const host=getHost();if(!host)return;
    initialHeight=host.getBoundingClientRect().height;
    dialog.style.animation='none';dialog.style.opacity='0';
  }
  async function afterShow() {
    if(!isMobile())return;
    const host=getHost();if(!host)return;
    const token=++epoch;
    const finalHeight=host.getBoundingClientRect().height;
    host.style.height=`${finalHeight}px`;host.dataset.revealing='true';
    const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
    animation=host.animate([{height:`${initialHeight}px`},{height:`${finalHeight}px`}],{duration:reduced?0:350,easing:'ease-out'});
    try{await animation.finished;}catch{return;}
    if(token!==epoch)return;
    animation=dialog.animate([{opacity:0},{opacity:1}],{duration:reduced?0:250,fill:'forwards'});
    try{await animation.finished;}catch{return;}
    if(token!==epoch)return;
    dialog.style.opacity='1';animation.cancel();animation=undefined;
  }
  return {beforeShow,afterShow,cancel};
}
