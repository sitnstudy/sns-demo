import { element as el } from './answer-challenge.js';
import { areaModel } from './rectangle-area-teaching.js';
import { createAreaReadinessStrip } from './area-readiness-strip.js';
import { createCompletionPrompt } from './completion-prompt.js';
import { createPaintAudio } from './area-paint-audio.js';
import { dockGameAudio } from './game-audio-control.js';
import { mountMathInput } from './math-input.js';
import { createStepFeedback } from './step-feedback.js';

const stylesheet = new URL('./rectangle-area-paint.css', import.meta.url).href;
if (![...document.querySelectorAll('link[rel="stylesheet"]')].some(link => link.href === stylesheet)) {
  const link = el('link', ''); link.rel = 'stylesheet'; link.href = stylesheet; document.head.append(link);
}
const colours = ['#28b9ac', '#f4bb58'];
const fmt = n => n.toLocaleString('en-US');
const svgNS = 'http://www.w3.org/2000/svg';
function svgNode(tag, attrs = {}) {
  const node = document.createElementNS(svgNS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

export function mountAreaPaint(question, search = location.search) {
  const m = areaModel(question);
  if (!m || m.task !== 'area') throw new Error('Painting requires known side lengths');
  const stripMode=m.difficulty?.level==='high';
  const trial=stripMode || m.difficulty?.level==='challenge';
  const across = Math.max(m.length, m.width), down = Math.min(m.length, m.width);
  // A unit has equal horizontal and vertical scale. The handle stays large enough to grab.
  const cell = 480 / across, height = cell * down, left = 20, top = 65;
  const root = el('div', 'paper-teaching area-teaching area-paint');
  const events = new AbortController();
  const audio = createPaintAudio();
  const stepFeedback = createStepFeedback({className:'area-paint-feedback',anchorToFooter:'desktop'});
  const direction = () => rows % 2 === 0 ? 1 : -1;
  const listen = (node, type, fn) => node.addEventListener(type, fn, {signal: events.signal});
  const button = (label, fn, cls = 'paper-button') => {
    const b = el('button', cls, label); b.type = 'button'; listen(b, 'click', fn); return b;
  };
  let rows = 0, progress = 0, active = false, destroyed = false, view;
  let frame = 0, busy = false, releaseAudio;
  let tickLanded = false, successFeedbackPending = false;
  let editor, answerInput, trialButton, trialStatus, painted=0, estimate=0, result='', overflowLabel, trialControls, stripQuestion;
  let svg, paints, roller, rollerHead, instruction, equation, scene, readinessHost;
  let mobileBaseControlsHeight;
  const leave = () => {
    root.dispatchEvent(new CustomEvent('teaching-close', {bubbles: true}));
  };
  const ready = el('dialog', 'area-paint-ready');
  const readyText='Ready for the original question?';
  ready.setAttribute('aria-label', readyText);
  ready.append(el('p', '', readyText));
  const actions = el('div', 'conversion-ready-actions');
  actions.append(button('No, try again', reset, 'conversion-ready-retry'), button('Yes, I’m ready', leave, 'conversion-ready-continue'));
  ready.append(actions);
  const readinessStrip=createAreaReadinessStrip(ready,()=>readinessHost);
  const completion = createCompletionPrompt(ready, () => active && !destroyed && !document.hidden && tickLanded && (trial?result==='correct':rows===down) && view === 'stepwise', {
    delay: 0, modal: false,
    beforeShow:()=>{readinessStrip.beforeShow();if(stripQuestion)stripQuestion.inert=true;},
    afterShow:readinessStrip.afterShow
  });
  listen(ready, 'cancel', event => {event.preventDefault(); reset();});

  function diagram(filled = 0, interactive = false) {
    const drawing = svgNode('svg', {viewBox: `0 0 ${height<100?640:570} ${height + 85 + (trial?cell+40:0)}`, class: 'area-paint-canvas', role: interactive ? 'button' : 'img', 'aria-label': `${across} cm across and ${down} cm high. Each small square represents 1 cm².`});
    function dimension(x,y,length,text,vertical=false) {
      const group=svgNode('g',{class:'area-paint-dimension',transform:`translate(${x} ${y})${vertical?' rotate(90)':''}`});
      const tip=Math.min(6,length/3);
      group.append(svgNode('path',{d:`M0 0H${length}M${tip} ${-tip}L0 0l${tip} ${tip}M${length-tip} ${-tip}L${length} 0l${-tip} ${tip}`,fill:'none',stroke:'#183b56','stroke-width':4}));
      if(length>=100){
        const labelGap=text.length<=4?88:112;
        group.append(svgNode('rect',{x:(length-labelGap)/2,y:-19,width:labelGap,height:38,fill:'white'}));
        const label=svgNode('text',{x:length/2,y:0,'text-anchor':'middle','dominant-baseline':'central'});
        label.textContent=text;group.append(label);
      }else{
        // Very short sides still need a readable label beside their tiny arrow.
        const label=svgNode('text',{x:length/2,y:-20,transform:`rotate(-90 ${length/2} -20)`,'text-anchor':'start','dominant-baseline':'central'});
        label.textContent=text;group.append(label);
      }
      drawing.append(group);
    }
    drawing.append(svgNode('rect', {x:left, y:top, width:480, height, fill:'#fffdf7'}));
    const layers = svgNode('g', {'data-paint-layers': ''});
    for (let r = 0; r < down+(trial?1:0); r++) layers.append(svgNode('rect', {x:left, y:top+r*cell, width:r<filled?480:0, height:cell, fill:r>=down?'#ef8b84':colours[r%2]}));
    drawing.append(layers);
    let grid = '';
    for (let c = 1; c < across; c++) grid += `M${left+c*cell} ${top}v${height}`;
    for (let r = 1; r < down; r++) grid += `M${left} ${top+r*cell}h480`;
    drawing.append(svgNode('path', {d:grid, fill:'none', stroke:'#173e4a', 'stroke-opacity':'.2', 'stroke-width':'.65'}));
    drawing.append(svgNode('rect', {x:left, y:top, width:480, height, fill:'none', stroke:'#254a53', 'stroke-width':2}));
    dimension(left,top-30,480,`${across} cm`);
    dimension(left+480+30,top,height,`${down} cm`,true);
    if (interactive) {
      paints = layers;
      if(!trial)drawing.setAttribute('tabindex','0');
      if(trial)drawing.setAttribute('role','img');
      if(!trial){
        drawing.setAttribute('aria-label','Click here to paint');
        const instructionBox=svgNode('foreignObject',{x:left+8,y:top+height/2-40,width:464,height:80,class:'area-paint-instruction-box'});
        const instructionWrap=el('div','area-paint-instruction-wrap');
        instruction=el('span','area-paint-instruction','Click here to paint');
        instructionWrap.append(instruction);instructionBox.append(instructionWrap);drawing.append(instructionBox);
      }
      if(trial){overflowLabel=svgNode('text',{x:left+240,y:top+height+cell+32,'text-anchor':'middle',class:'area-paint-overflow'});drawing.append(overflowLabel);}
      roller = svgNode('g', {class:'area-paint-roller', 'aria-hidden':'true'});
      // Original simplified vector: a vertical paint head for horizontal strokes.
      roller.append(svgNode('path', {d:'M0 0H18V32H38', fill:'none', stroke:'#68808a', 'stroke-width':5, 'stroke-linejoin':'round'}));
      rollerHead = svgNode('rect', {x:-5, y:-cell/2, width:10, height:cell, rx:Math.min(3,cell/4), stroke:'#254a53', 'stroke-width':1});
      roller.append(rollerHead, svgNode('rect', {x:30, y:23, width:40, height:18, rx:7, fill:'#244858'}));
      roller.append(svgNode('rect', {x:-14, y:Math.min(-cell/2,-12), width:94, height:Math.max(cell,100), fill:'transparent', class:'area-paint-grab'}));
      drawing.append(roller);
    }
    return drawing;
  }
  function stop({keepMusic=false}={}) {cancelAnimationFrame(frame);frame=0;busy=false;progress=0;if(trial && !result)painted=0;audio.stop();if(!keepMusic)audio.pauseMusic();}
  function fit() {
    if(!scene?.isConnected || view!=='stepwise')return;
    const footer=document.querySelector('.paper-footer:not([hidden])');
    const mobile=innerWidth<=650;
    const bottom=mobile?innerHeight-90:Math.min(innerHeight-16,footer?.getBoundingClientRect().top||innerHeight);
    const panel=scene.parentElement;
    if(mobile && mobileBaseControlsHeight===undefined)mobileBaseControlsHeight=readinessHost?.getBoundingClientRect().height||70;
    const available=bottom-panel.getBoundingClientRect().top-(mobile?mobileBaseControlsHeight:16);
    // The SVG keeps square cells while shrinking to both available dimensions.
    // No minimum board height may force a short desktop viewport to scroll.
    const bounds=svg.viewBox.baseVal;
    const naturalHeight=scene.clientWidth*bounds.height/bounds.width;
    scene.style.height=`${Math.max(32,mobile?Math.min(available,naturalHeight):available)}px`;
  }
  function scheduleFit(){requestAnimationFrame(()=>{fit();Promise.all(root.getAnimations().map(a=>a.finished.catch(()=>{}))).then(()=>{if(!destroyed)fit();});});}
  listen(window,'resize',fit);
  function showSuccessFeedback() {
    if(tickLanded || successFeedbackPending || !active || destroyed || document.hidden)return;
    successFeedbackPending=true;
    stepFeedback.show(true,{onLanded:()=>{successFeedbackPending=false;tickLanded=true;completion.schedule();}});
  }
  function render() {
    if (!svg) return;
    if(trial){renderTrial();return;}
    root.dataset.rows = String(rows); root.dataset.progress = String(progress); root.dataset.phase = rows === down ? 'done' : 'painting';
    root.dataset.direction = direction() === 1 ? 'right' : 'left';
    root.dataset.busy=String(busy);
    [...paints.children].forEach((strip, r) => {
      const width = r<rows?480:r===rows?progress*480:0;
      strip.setAttribute('width',width);
      strip.setAttribute('x',left+(r%2===0?0:480-width));
    });
    roller.setAttribute('transform', `translate(${left+(direction()===1?progress:1-progress)*480} ${top+(Math.min(rows,down-1)+.5)*cell})`);
    rollerHead.setAttribute('fill', colours[rows%2]);
    roller.style.display = rows === down ? 'none' : '';
    svg.setAttribute('aria-disabled',String(!active || busy || rows===down));
    instruction.style.display=busy || rows===down?'none':'';
    instruction.textContent='Click here to paint';
    svg.setAttribute('aria-label',instruction.textContent);
    // Update only after a full strip, keeping the live region quiet during motion.
    if(equation.dataset.rows!==String(rows)){
      equation.dataset.rows=String(rows);equation.replaceChildren();
      if(rows)equation.append(el('span','area-paint-constant',String(across)),document.createTextNode(' × '),el('span','area-paint-count',String(rows)),document.createTextNode(' = '),el('span','area-paint-total',`${fmt(rows*across)} cm²`));
    }
    if (rows === down) {showSuccessFeedback();completion.schedule();}
  }
  function advance(value) {
    const next = Math.max(progress, Math.min(1, Math.max(0,value)));
    if(next>progress)audio.move(rows,next);
    progress=next;
    if (progress >= 1) {rows++; progress=0;if(rows===down){audio.stop();}}
    render();
  }
  function renderTrial() {
    if(stripQuestion && !ready.open)stripQuestion.inert=false;
    root.dataset.phase=busy?'painting':result||'estimate';root.dataset.busy=String(busy);
    root.dataset.painted=String(painted);root.dataset.estimate=String(estimate);
    [...paints.children].forEach((strip,r)=>{
      const units=Math.min(across,Math.max(0,painted-r*across));
      strip.setAttribute('width',units*cell);strip.setAttribute('x',left+(r%2===0?0:(across-units)*cell));
    });
    const row=Math.min(down,Math.floor(painted/across)),fraction=(painted-row*across)/across;
    roller.setAttribute('transform',`translate(${left+(row%2===0?Math.min(1,fraction):1-Math.min(1,fraction))*480} ${top+(row+.5)*cell})`);
    rollerHead.setAttribute('fill',row>=down?'#ef8b84':colours[row%2]);
    roller.style.display=busy && painted<(down+1)*across?'':'none';
    overflowLabel.textContent=painted>m.area+across?`+ ${fmt(Math.floor(painted-m.area-across))} cm² more outside`:'';
    svg.setAttribute('aria-label',`${across} cm by ${down} cm rectangle. ${Math.floor(painted)} square centimetres painted.`);
    editor?.setLocked(busy||result==='correct');
    if(trialButton)trialButton.disabled=!active||busy||result==='correct';
    if(trialStatus){
      trialStatus.dataset.result=result;
      trialStatus.textContent=busy?'':result==='short'?(stripMode?'Too few strips. Part of the rectangle is still uncovered.':'Not enough paint. Part of the rectangle is still uncovered.'):result==='over'?(stripMode?'Too many strips. They go outside the rectangle.':'Too much paint. It goes outside the rectangle.') : '';
    }
    if(stripMode){
      equation.replaceChildren();
      if(result)equation.append(el('span','area-paint-constant',String(across)),document.createTextNode(' × '),el('span','area-paint-count',String(estimate/across)),document.createTextNode(' = '),el('span','area-paint-total',`${fmt(estimate)} cm²`));
    }
    if(result==='correct'){showSuccessFeedback();completion.schedule();}
  }
  function paintAttempt() {
    if(!active||busy||result==='correct')return;
    const text=answerInput.value.trim();
    if(!/^\d{1,7}$/.test(text)||Number(text)<1||Number(text)>1000000){trialStatus.dataset.result='invalid';trialStatus.textContent='Please enter a number, eg 5';return;}
    tickLanded=false;successFeedbackPending=false;stepFeedback.cancel();completion.cancel();estimate=Number(text)*(stripMode?across:1);painted=0;result='';editor.close();audio.prime();busy=true;render();scheduleFit();
    let previous,elapsed=0;
    const duration=matchMedia('(prefers-reduced-motion: reduce)').matches?0:Math.min(4000,Math.max(900,estimate/across*170));
    function step(now){
      if(!active||destroyed||document.hidden){stop();render();return;}
      elapsed+=previous===undefined?0:Math.min(64,now-previous);previous=now;
      painted=duration?Math.min(estimate,estimate*elapsed/duration):estimate;
      audio.move(Math.floor(painted/across),(painted%across)/across);render();
      if(painted===estimate){
        busy=false;frame=0;audio.stop();result=estimate<m.area?'short':estimate>m.area?'over':'correct';render();
        if(result!=='correct')stepFeedback.show(false);
        return;
      }
      frame=requestAnimationFrame(step);
    }
    frame=requestAnimationFrame(step);
  }
  function animate() {
    if (!active || busy || rows === down) return;
    audio.prime();busy=true;render();
    let previous;
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    const before=rows, finishAll=rows>=4;
    function step(now) {
      if(!active || destroyed || document.hidden){stop();render();return;}
      const elapsed=previous===undefined?0:Math.min(now-previous,64);previous=now;
      advance(reduced?1:progress+elapsed/(finishAll?170:900));
      if(rows===down || (!finishAll && rows!==before)){audio.stop();busy=false;frame=0;render();return;}
      frame=requestAnimationFrame(step);
    }
    frame=requestAnimationFrame(step);
  }
  function reset() {readinessStrip.cancel();stop({keepMusic:true}); tickLanded=false;successFeedbackPending=false;stepFeedback.cancel();completion.cancel(); rows=0;progress=0;painted=0;estimate=0;result='';editor?.setValue('');render();scheduleFit();resumeMusic();}
  function build() {
    editor?.close();mobileBaseControlsHeight=undefined;
    const panel=el('section','area-paint-panel');
    if(trial)panel.classList.add('area-paint-trial');
    const close=button('',leave,'area-paint-close');
    close.setAttribute('aria-label','Close painting');
    close.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="#d32f2f" stroke-width="5" stroke-linecap="square" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
    const sound=button('',()=>{audio.toggle();soundLabel();},'conversion-audio-fab area-paint-sound');
    function soundLabel(){
      sound.setAttribute('aria-label',audio.muted?'Unmute painting sound':'Mute painting sound');
      sound.setAttribute('aria-pressed',String(audio.muted));
      sound.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4Z"/>${audio.muted?'<path stroke="#d32f2f" d="m16 9 5 6m0-6-5 6"/>':'<path d="M15 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14"/>'}</svg>`;
    }
    soundLabel();
    scene=el('div','area-paint-scene');svg=diagram(0,true);scene.append(svg);
    equation=el('p','area-paint-equation');equation.setAttribute('role','status');
    panel.append(scene);
    if(trial){
      trialControls=el('div','area-paint-trial-controls');
      const prompt=el('p','area-paint-trial-question',stripMode?'How many strips will cover the rectangle?':'What is the area?');
      answerInput=el('input','');answerInput.type='hidden';answerInput.dataset.expectedAnswer='0';
      editor=mountMathInput(answerInput,{ariaLabel:stripMode?'Number of strips':'Area to paint',onSubmit:paintAttempt});
      const entry=el('div','area-paint-entry');
      if(stripMode)entry.append(el('span','area-paint-factor',`${across} ×`));
      entry.append(answerInput,editor.element);
      if(!stripMode)entry.append(el('span','','cm²'));
      trialButton=button('Paint',paintAttempt);trialButton.setAttribute('aria-label','Paint my answer');entry.append(trialButton);
      trialStatus=el('p','area-paint-trial-status');trialStatus.setAttribute('role','status');
      if(stripMode){
        trialControls.classList.add('area-paint-strip-controls');
        stripQuestion=el('div','area-paint-strip-question');stripQuestion.append(prompt,entry,trialStatus);
        const completed=el('div','area-paint-strip-completed');completed.append(equation,ready);
        trialControls.append(stripQuestion,completed);
      }else trialControls.append(prompt,entry,trialStatus,ready);
      panel.append(trialControls);
    }else {
      const summary=el('div','area-paint-summary');summary.append(equation,ready);panel.append(summary);
    }
    readinessHost=trial?trialControls:panel.querySelector('.area-paint-summary');
    readinessHost.classList.add('area-readiness-strip');
    root.replaceChildren(close,panel,sound);
    releaseAudio=dockGameAudio(sound,root);
    if(!trial)listen(svg,'click',animate);
    listen(svg,'keydown',event=>{if(!trial && ['Enter',' '].includes(event.key)){event.preventDefault();if(!event.repeat)animate();}});
    render();scheduleFit();
  }
  function documentView(workbook) {
    const panel=el('section',`${workbook?'teach-workbook':'teach-solution'} area-paint-document`);
    const calculation=el('p','area-paint-document-equation');
    const answer=el('span',`area-paint-document-answer${workbook?' area-paint-document-blank':''}`,workbook?'':fmt(m.area));
    if(workbook){answer.setAttribute('role','img');answer.setAttribute('aria-label','Blank for the area in square centimeters');}
    const result=el('span','area-paint-document-result');
    result.append(document.createTextNode('= '),answer,document.createTextNode(' cm²'));
    calculation.append(el('span','area-paint-document-number',String(down)),document.createTextNode(' strips × '),el('span','area-paint-document-number',String(across)),document.createTextNode(' cm² '),result);
    const figure=diagram(0);
    // Equal space above and below the grid aligns the text with the painted area.
    figure.setAttribute('viewBox',`0 0 ${height<100?640:570} ${height+130}`);
    panel.append(calculation,figure);
    return panel;
  }
  function resumeMusic() {
    if(active && !destroyed && !document.hidden && view==='stepwise')audio.startMusic();
  }
  function pause() {readinessStrip.cancel();editor?.close();active=false;stop();successFeedbackPending=false;stepFeedback.cancel();completion.cancel();render();}
  listen(document,'visibilitychange',()=>{
    if(document.hidden){
      stop();readinessStrip.cancel();completion.cancel();
      if(!tickLanded){successFeedbackPending=false;stepFeedback.cancel();}
      render();
    }
    else {render();resumeMusic();}
  });
  return {element:root,
    setView(next) {
      if(destroyed)return;
      if(view===next){if(next==='stepwise' && root.dataset.guidedHelp==='true' && !root.closest('[hidden]')){active=true;render();scheduleFit();resumeMusic();}return;}
      pause();editor=undefined;releaseAudio?.();releaseAudio=undefined;view=next;root.dataset.view=next;svg=undefined;
      if(next==='stepwise'){active=true;build();}else root.replaceChildren(documentView(next==='workbook'));
    },
    startHelp(){if(destroyed)return;if(view!=='stepwise')this.setView('stepwise');root.dataset.guidedHelp='true';active=true;render();scheduleFit();resumeMusic();},
    pause,
    closeHelp(){pause();return Promise.resolve();},
    destroy(){if(destroyed)return;pause();destroyed=true;releaseAudio?.();audio.destroy();events.abort();root.replaceChildren();}
  };
}
