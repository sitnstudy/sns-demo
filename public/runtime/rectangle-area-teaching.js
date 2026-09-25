import { element as el } from './answer-challenge.js';
import { createStepFeedback } from './step-feedback.js';
import { createAreaReadinessStrip } from './area-readiness-strip.js';
import { createCompletionPrompt } from './completion-prompt.js';
import { dockGameAudio } from './game-audio-control.js';
import { mountAreaTetrisDocument } from './area-tetris-documents.js';

const stylesheet = new URL('./rectangle-area-teaching.css', import.meta.url).href;
if (![...document.querySelectorAll('link[rel="stylesheet"]')].some(link => link.href === stylesheet)) {
  const link = el('link', ''); link.rel = 'stylesheet'; link.href = stylesheet; document.head.append(link);
}
const colours = ['#00bcd4','#7851e8','#f59b16','#3673ef','#ef4665','#30bd68','#edcb30'];
const fmt = n => n.toLocaleString('en-US');
export function areaModel(question) {
  const t = question.teaching;
  if (t?.kind !== 'rectangle-area' || !['rectangle','square'].includes(t.shape) || !['area','missing-side'].includes(t.task)) return null;
  if (![t.length,t.width].every(n => Number.isInteger(n) && n >= 1 && n <= 50)) return null;
  return {...t, area:t.length*t.width};
}

// The conversion game's visual components and controls are deliberately retained.
// Area changes the falling pieces: unit squares make a slab, then slabs make area.
export function mountAreaTeaching(question, search = location.search, {embedded = false} = {}) {
  const m = areaModel(question);
  if (!m) throw new Error('Invalid rectangle area teaching data');
  const root = el('div', 'paper-teaching area-teaching area-tetris');
  const events = new AbortController();
  const listen = (node, name, fn) => node.addEventListener(name, fn, {signal:events.signal});
  const words = (key, fallback, extra={}) => (m.language?.[key] || fallback).replace(/\{(\w+)\}/g, (_, key) => String(({length:m.length,width:m.width,area:fmt(m.area),...extra})[key] ?? ''));
  const button = (label, fn, cls='paper-button') => { const b=el('button',cls,label); b.type='button';listen(b,'click',fn);return b; };
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const squareUnknown = m.shape === 'square' && m.task === 'missing-side';
  let view, active=false, destroyed=false, started=false, busy=false, epoch=0;
  let phase='assembly', squares=0, rows=0, candidate=0, squareHistory=[], slabHistory=[];
  let checkpoint;
  let tickLanded=false, successFeedbackPending=false;
  let manualClicks=0, autoCompleting=false;
  let panel, controls, equation, instruction, status, stage, frame, pieces, marker, preview, target;
  let releaseAudio, audioButton, context, replayDialog, replay;
  const animations = new Set(), oscillators = new Set();
  const feedback = createStepFeedback();
  let muted=false; try { muted=localStorage.getItem('psat-audio-muted')==='true'; } catch {}
  const music=new Audio(new URL('./audio/korobeiniki.mp3',import.meta.url).href); music.loop=true;music.volume=.22;
  const playMusic=()=>{if(active&&started&&!muted&&!document.hidden&&phase!=='done')music.play().catch(()=>{});};
  const stopSound=()=>{music.pause();for(const tone of oscillators){try{tone.stop();}catch{}}oscillators.clear();};
  function tick(land=false) {
    if(muted||!active||document.hidden)return;
    try {
      const AudioContext=window.AudioContext||window.webkitAudioContext;if(!AudioContext)return;
      context ||= new AudioContext();context.resume().catch(()=>{});
      for(const [index,frequency] of (land?[392,490,588]:[784,392]).entries()) {
        const tone=context.createOscillator(),gain=context.createGain(),now=context.currentTime+index*.045;
        tone.type='triangle';tone.frequency.setValueAtTime(frequency,now);
        gain.gain.setValueAtTime(.0001,now);gain.gain.linearRampToValueAtTime(.025,now+.008);gain.gain.exponentialRampToValueAtTime(.0001,now+.18);
        tone.connect(gain);gain.connect(context.destination);oscillators.add(tone);
        tone.onended=()=>{oscillators.delete(tone);tone.disconnect();gain.disconnect();};tone.start(now);tone.stop(now+.2);
      }
    } catch { /* Muted or unavailable audio must never stop a drop. */ }
  }
  const leave=()=>root.dispatchEvent(new CustomEvent('teaching-close',{bubbles:true}));
  const ready=el('dialog','conversion-ready-dialog area-ready');ready.setAttribute('aria-label','Ready for the original question?');
  ready.append(el('p','','Ready for the original question?'));
  const readyActions=el('div','conversion-ready-actions');readyActions.append(button(words('retry','No, try again'),()=>reset(),'conversion-ready-retry'),button(words('continue','Yes, I’m ready'),leave,'conversion-ready-continue'));ready.append(readyActions);
  const readinessStrip=createAreaReadinessStrip(ready,()=>controls);
  const completion=createCompletionPrompt(ready,()=>active&&!destroyed&&!document.hidden&&phase==='done'&&tickLanded&&view==='stepwise',{delay:0,modal:false,beforeShow:readinessStrip.beforeShow,afterShow:readinessStrip.afterShow});
  listen(ready,'cancel',event=>{event.preventDefault();reset();});
  function saveProgress() {checkpoint={phase,squares,rows,candidate,squareHistory:[...squareHistory],slabHistory:[...slabHistory]};}
  function cancelMotion() {epoch++;autoCompleting=false;for(const animation of animations)animation.cancel();animations.clear();if(checkpoint){({squares,rows,candidate,squareHistory,slabHistory}=checkpoint);setPhase(checkpoint.phase);checkpoint=undefined;}busy=false;}
  function setPhase(next) {phase=next;root.dataset.phase=next;}
  function columnCount(){return m.length;}
  function geometry() {
    const columns=columnCount(),available=Math.max(90,pieces?.clientHeight||320);
    // Unknown sides do not determine the empty well's shape or number of slots.
    const visibleHeight=squareUnknown?Math.max(candidate,Math.ceil(Math.sqrt(m.area))):m.task==='area'?m.width:Math.max(rows,Math.ceil(Math.sqrt(m.area)));
    const cell=Math.min((pieces?.clientWidth||250)/columns,(available-80)/Math.max(visibleHeight,1),38);
    return {cell,left:((pieces?.clientWidth||250)-cell*columns)/2,columns};
  }
  function makePiece(kind,index,width,height) {
    const node=el('div',`conversion-slab area-tetris-piece ${kind}`);node.style.setProperty('--brick-colour',colours[index%colours.length]);
    node.style.width=`${width}px`;node.style.height=`${height}px`;node.dataset.piece=kind==='area-square'?'square':'slab';
    return node;
  }
  function squarePiece(index) {
    const {cell,left}=geometry();const tile=makePiece('area-square',index,cell,cell);tile.style.left=`${left+index*cell}px`;tile.style.bottom='0px';tile.setAttribute('aria-label','1 cm² square');return tile;
  }
  function slabPiece(bottom,count,index) {
    const {cell,left,columns}=geometry();const slab=makePiece('area-slab',index,cell*columns,cell*count);
    slab.style.left=`${left}px`;slab.style.bottom=`${cell*bottom}px`;slab.dataset.rows=String(count);
    slab.setAttribute('aria-label',`${count} ${count===1?'row':'rows'}, ${fmt(columns*count)} cm²`);
    const grid=el('div','area-slab-grid');grid.style.gridTemplateColumns=`repeat(${columns},1fr)`;grid.style.gridTemplateRows=`repeat(${count},1fr)`;
    for(let i=0;i<columns*count;i++){const unit=el('i','area-slab-unit');unit.style.setProperty('--brick-colour',colours[i%columns%colours.length]);grid.append(unit);}
    slab.append(grid);
    if(cell*count>=20){const label=el('span','area-slab-label',`${fmt(columns*count)} cm²`);slab.append(label);}
    return slab;
  }
  function redraw() {
    if(!pieces)return;pieces.replaceChildren();
    if(phase==='assembly'||phase==='bundled') {
      for(let i=0;i<squares;i++)pieces.append(squarePiece(i));
      if(phase==='bundled') {
        const {cell,left,columns}=geometry();
        const bundle=el('div','area-bundle');bundle.setAttribute('role','img');
        bundle.setAttribute('aria-label',words('bundleLabel','1 slab = {length} squares'));
        bundle.style.left=`${left}px`;bundle.style.width=`${cell*columns}px`;bundle.style.height=`${cell}px`;
        bundle.style.setProperty('--bundle-stroke',`${Math.min(3,cell/5)}px`);
        for(const [index,tile] of [...pieces.children].entries()){tile.style.left=`${index*cell}px`;bundle.append(tile);}
        pieces.append(bundle);
      }
    } else {let bottom=0;slabHistory.forEach((count,index)=>{pieces.append(slabPiece(bottom,count,index));bottom+=count;});}
    marker.textContent=`${m.width} cm`;
    const ruler=marker.parentElement;
    ruler.hidden=phase==='assembly'||phase==='bundled'||m.task==='missing-side';
    ruler.style.top='auto';ruler.style.height=`${geometry().cell*m.width}px`;
    preview.replaceChildren();
    if(phase!=='assembly'){
      const tray=el('div','area-slab-sample');tray.style.setProperty('--sample-columns',m.length);
      tray.style.width=`${Math.min(220,m.length*26)}px`;tray.style.height=`${Math.min(26,220/m.length)}px`;
      for(let i=0;i<m.length;i++){const unit=el('i','area-sample-square');unit.style.setProperty('--brick-colour',colours[i%colours.length]);tray.append(unit);}
      preview.append(tray,el('span','',words('bundleLabel','1 slab = {length} squares')));
    }
    frame.dataset.filled=phase==='done'?'true':'false';
  }
  async function fall(piece,token) {
    if(token!==epoch||!active)return false;
    pieces.append(piece);piece.dataset.falling='true';
    const distance=Math.max(30,pieces.clientHeight-parseFloat(piece.style.bottom)+parseFloat(piece.style.height));
    const animation=piece.animate([{transform:`translateY(-${distance}px)`},{transform:'translateY(0)',offset:.88},{transform:'translateY(-3px)',offset:.94},{transform:'translateY(0)'}],{duration:reduced()?0:autoCompleting?170:520,easing:'ease-in'});
    animations.add(animation);
    try{await animation.finished;}catch{return false;}finally{animations.delete(animation);}
    delete piece.dataset.falling;
    return token===epoch&&active;
  }
  function update() {
    if(!panel)return;
    root.dataset.squares=String(squares);root.dataset.rows=String(rows);root.dataset.candidate=String(candidate);root.dataset.busy=String(busy);
    panel.dataset.running=String(active);
    const building=phase==='assembly'||phase==='bundled';
    frame.setAttribute('aria-disabled',String(busy||phase==='done'));
    target.textContent=building
      ? squareUnknown?words('inverseStepOneTarget','Step 1 of 2: build the first side of the square'):words('stepOneTarget','Step 1 of 2: build a slab of {length} squares')
      : m.task==='missing-side'?words('inverseStepTwoTarget','Step 2 of 2: stack slabs to cover {area} cm²'):words('stepTwoTarget','Step 2 of 2: stack {width} slabs');
    instruction.textContent='Click here to stack a block';instruction.hidden=autoCompleting||phase==='done';
    equation.replaceChildren();
    const current=building?squares:rows;
    if(!current)equation.append(el('span','conversion-empty-message',building?words('assemblyEmpty','Add square pieces to build a slab.'):words('stackEmpty','Add slabs to the stack.')));
    else if(building)equation.append(el('span','conversion-count',fmt(squares)),document.createTextNode(` / ${squareUnknown&&phase==='assembly'?'?':m.length} squares`));
    else equation.append(document.createTextNode(`${m.length} × `),el('span','conversion-count',fmt(rows)),document.createTextNode(' = '),el('span','conversion-total',fmt(rows*m.length)),document.createTextNode(' cm²'));
    equation.classList.toggle('area-equation-empty',!current);
    if(phase==='done'){showSuccessFeedback();completion.schedule();}
    requestAnimationFrame(fit);
  }
  function showSuccessFeedback() {
    if(tickLanded||successFeedbackPending||!active||destroyed||document.hidden)return;
    successFeedbackPending=true;
    feedback.show(true,{onLanded:()=>{successFeedbackPending=false;tickLanded=true;completion.schedule();}});
  }
  function finish() {setPhase('done');busy=false;music.pause();tick(true);redraw();update();}
  async function assemble() {
    saveProgress();busy=true;update();const token=epoch;tick();
    if(!await fall(squarePiece(squares),token))return;
    squares++;candidate=squareUnknown?squares:0;squareHistory.push(1);busy=false;checkpoint=undefined;tick(true);
    if(squares===m.length){
      setPhase('bundled');status.textContent='';
    }
    redraw();update();
  }
  async function dropSlab() {
    saveProgress();
    if(phase==='bundled'){setPhase('stacking');rows=0;slabHistory=[];redraw();}
    busy=true;status.textContent='';update();tick();const token=epoch;
    if(!await fall(slabPiece(rows,1,slabHistory.length),token))return;
    rows++;slabHistory.push(1);busy=false;checkpoint=undefined;tick(true);
    if(rows===m.width)finish();else update();
  }
  async function add() {
    if(!active||busy||autoCompleting||phase==='done')return;
    started=true;playMusic();manualClicks++;
    const token=epoch;
    autoCompleting=manualClicks>=5;
    do {
      if(phase==='assembly')await assemble();else await dropSlab();
    } while(token===epoch && autoCompleting && active && phase!=='done' && !checkpoint);
  }
  function fit() {
    if(!stage?.isConnected||view!=='stepwise'||root.closest('[hidden]'))return;
    const footer=document.querySelector('.paper-footer:not([hidden])');
    if(innerWidth>650||embedded){const bottom=embedded?innerHeight:(footer?.getBoundingClientRect().top||innerHeight);stage.style.height=`${Math.max(180,Math.min(520,bottom-stage.getBoundingClientRect().top-target.getBoundingClientRect().height-64))}px`;}
    if(!ready.open)root.style.setProperty('--conversion-controls-height',`${controls.getBoundingClientRect().height}px`);
    if(!busy)redraw();
  }
  function reset() {tickLanded=false;successFeedbackPending=false;readinessStrip.cancel();cancelMotion();completion.cancel();feedback.cancel();stopSound();music.currentTime=0;manualClicks=0;autoCompleting=false;squares=rows=candidate=0;squareHistory=[];slabHistory=[];setPhase('assembly');if(status)status.textContent='';redraw();update();playMusic();}
  function build() {
    releaseAudio?.();root.replaceChildren();
    panel=el('section','conversion-simulation area-tetris-game');
    controls=el('div','conversion-controls');instruction=el('p','teach-intent area-tetris-instruction');
    equation=el('div','conversion-equation area-tetris-equation');equation.setAttribute('aria-live','polite');equation.setAttribute('aria-atomic','true');
    preview=el('div','area-slab-preview');status=el('p','area-status');status.setAttribute('role','status');
    controls.classList.add('area-readiness-strip');controls.append(equation,status,ready);
    const stackArea=el('div','conversion-stack-area');target=el('p','conversion-target');
    stage=el('div','conversion-stage area-tetris-stage');frame=el('div','conversion-target-frame area-tetris-well');frame.setAttribute('aria-label','Click here to stack a block');frame.setAttribute('role','button');frame.tabIndex=0;
    listen(frame,'click',add);listen(frame,'keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();if(!event.repeat)add();}});
    const wordmark=el('div','conversion-tetris-wordmark');wordmark.setAttribute('aria-hidden','true');for(const letter of 'TETRIS')wordmark.append(el('span','',letter));
    pieces=el('div','area-tetris-pieces');const heightMarker=el('div','conversion-height-marker');marker=el('span','conversion-height-label');heightMarker.append(marker);
    frame.append(wordmark,pieces,heightMarker,preview,instruction);stage.append(frame);stackArea.append(stage,target);panel.append(controls,stackArea);
    const close=button('',leave,'conversion-stop-button area-close');close.setAttribute('aria-label','Close simulation');close.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="#d32f2f" stroke-width="5" stroke-linecap="square" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
    audioButton=button('',()=>{muted=!muted;try{localStorage.setItem('psat-audio-muted',String(muted));}catch{}if(muted)stopSound();else playMusic();audioIcon();},'conversion-audio-fab');
    function audioIcon(){audioButton.setAttribute('aria-label',muted?'Unmute audio':'Mute audio');audioButton.setAttribute('aria-pressed',String(muted));audioButton.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4Z"/>${muted?'<path stroke="#d32f2f" d="m16 9 5 6m0-6-5 6"/>':'<path d="M15 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14"/>'}</svg>`;}audioIcon();
    root.append(audioButton,close,panel);if(!embedded)releaseAudio=dockGameAudio(audioButton,root);reset();
  }
  function pause() {readinessStrip.cancel();active=false;cancelMotion();completion.cancel();successFeedbackPending=false;feedback.cancel();stopSound();}
  function resume() {active=true;redraw();update();playMusic();}
  function playDocument() {
    if(replayDialog)return;
    replayDialog=el('dialog','area-tetris-replay');replayDialog.setAttribute('aria-label',words('playTetris','Play Tetris'));
    replay=mountAreaTeaching(question,search,{embedded:true});replayDialog.append(replay.element);root.append(replayDialog);replayDialog.showModal();replay.setView('stepwise');replay.startHelp();
    const closeReplay=()=>{replay?.destroy();replay=undefined;replayDialog?.close();replayDialog?.remove();replayDialog=undefined;};
    replay.element.addEventListener('teaching-close',event=>{event.stopPropagation();closeReplay();});
    replayDialog.addEventListener('cancel',event=>{event.preventDefault();closeReplay();});
  }
  listen(window,'resize',()=>{fit();});
  listen(document,'visibilitychange',()=>{
    if(document.hidden){stopSound();readinessStrip.cancel();completion.cancel();if(!tickLanded){successFeedbackPending=false;feedback.cancel();}}
    else {update();playMusic();}
  });
  return {element:root,
    setView(next){if(destroyed)return;if(view===next){if(next==='stepwise'&&root.dataset.guidedHelp==='true'&&!root.closest('[hidden]'))resume();return;}pause();view=next;root.dataset.view=next;if(next==='stepwise')build();else{releaseAudio?.();releaseAudio=undefined;panel=undefined;root.replaceChildren(mountAreaTetrisDocument(question,next==='workbook',search,{onReplay:playDocument}));}},
    startHelp(){if(destroyed)return;if(view!=='stepwise')this.setView('stepwise');root.dataset.guidedHelp='true';if(embedded)root.dataset.embedded='true';resume();requestAnimationFrame(fit);},
    pause,closeHelp(){pause();return Promise.resolve();},
    destroy(){if(destroyed)return;destroyed=true;pause();events.abort();releaseAudio?.();feedback.destroy();replay?.destroy();replayDialog?.remove();context?.close().catch(()=>{});music.removeAttribute('src');music.load();root.replaceChildren();}
  };
}
