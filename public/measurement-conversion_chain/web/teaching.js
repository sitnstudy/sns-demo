import { dockGameAudio } from '../../runtime/game-audio-control.js';
import { createCannonAudio } from '../../runtime/cannon-effects.js';
import { createStepFeedback } from '../../runtime/step-feedback.js';
import { createFlowerCelebration } from '../../runtime/flower-celebration.js';
import { mountMathInput } from '../../runtime/math-input.js';
const styleURL = new URL('./bricks.css', import.meta.url).href;
if (![...document.querySelectorAll('link')].some(link => link.href === styleURL)) {
  const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = styleURL;
  await new Promise((resolve,reject) => { link.onload=resolve; link.onerror=reject; document.head.append(link); });
}
const singular=u=>({crates:'crate',boxes:'box',packs:'pack',bags:'bag',items:'item',furlongs:'furlong',strips:'strip',rolls:'roll'}[u]||u);
const el=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=text;return n;};
export function mountTeaching(question,root) {
  const d=question.teaching,c=d.copy,challenge=d.difficulty.level==='challenge';
  const hasBrickGame=Boolean(d.showBricks);
  const sound=hasBrickGame?createCannonAudio():{muted:true,start(){},stop(){},play(){},destroy(){}};
  const flowers=createFlowerCelebration({isMuted:()=>sound.muted});
  const stepFeedback=createStepFeedback({className:'chain-step-feedback'});
  const prompt=root.closest('.paper-question')?.querySelector('.paper-prompt .paper-math');
  let savedPrompt;
  function styled(tag,cls,text){
    const node=el(tag,cls);
    const units=[...new Set([...d.units,...d.units.map(singular)])].sort((a,b)=>b.length-a.length);
    const pattern=new RegExp(`(\\b(?:${units.join('|')})\\b|\\d[\\d,]*)`,'g');
    for(const part of text.split(pattern)){
      node.append(/^\d/.test(part)?el('strong','chain-number',part):units.includes(part)?el('strong','chain-quantity',part):document.createTextNode(part));
    }
    return node;
  }
  function restorePrompt(){if(prompt&&savedPrompt){prompt.replaceChildren(...savedPrompt);prompt.classList.remove('chain-muted-prompt');savedPrompt=undefined;}}
  let stage=0, revealed=!challenge, editor, solved=false, panel, work, main;
  let transition=0, busy=false, completion, releaseAudio, ready, keypadAlignment;
  const animations=new Set();
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  async function animate(node,frames,options){
    if(reduced.matches)return;
    const animation=node.animate(frames,{fill:'both',...options});animations.add(animation);
    await animation.finished.catch(()=>{});animations.delete(animation);
  }
  function cancelTransitions(){completion?.cancel();releaseAudio?.();releaseAudio=undefined;sound.stop();flowers.cancel();stepFeedback.cancel();transition++;busy=false;for(const animation of animations)animation.cancel();animations.clear();}
  const dispose=()=>{keypadAlignment?.disconnect();keypadAlignment=undefined;editor?.close();editor=undefined;};
  const button=(text,action)=>{const n=el('button','paper-button',text);n.type='button';n.onclick=action;return n;};
  const close=()=>root.dispatchEvent(new CustomEvent('teaching-close',{bubbles:true,detail:{focusAnswer:false}}));
  const hint=i=>`1 ${singular(d.units[i])} = ${d.factors[i]} ${d.units[i+1]}, so ${d.totals[i].toLocaleString()} ${d.units[i]} are how many ${d.units[i+1]}?`;
  function wall(target,count) {
    const figure=el('figure','chain-wall');figure.setAttribute('aria-label','One brick per unit in each layer');
    for(let i=d.factors.length;i>=0;i--) {
      const row=el('div','chain-layer');row.dataset.layer=i;
      if(i>count){row.style.visibility='hidden';row.setAttribute('aria-hidden','true');}
      const strip=el('div','chain-strip');strip.style.gridTemplateColumns=`repeat(${d.totals[i]},minmax(0,1fr))`;
      for(let j=0;j<d.totals[i];j++){
        const brick=el('span','chain-brick');brick.title=`1 ${singular(d.units[i])}`;strip.append(brick);
      }
      row.append(strip,el('div','chain-label',`${d.totals[i].toLocaleString()} ${d.units[i]}`));figure.append(row);
    }
    target.append(figure);
  }
  function setup() {
    cancelTransitions();dispose();root.replaceChildren();
    if(prompt&&!savedPrompt){savedPrompt=[...prompt.childNodes].map(n=>n.cloneNode(true));prompt.replaceChildren(...styled('span','',question.question).childNodes);prompt.classList.add('chain-muted-prompt');}
    panel=el('section','chain-help');root.append(panel);
    const x=button('',close);x.className='chain-close';x.setAttribute('aria-label','Close help');
    x.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="square" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
    work=el('div','chain-work');work.dataset.keypadScrollContainer='';main=el('div','chain-main');panel.append(x,work,main);
    if(hasBrickGame){
    const audio=button('',()=>{sound.toggle();if(sound.muted)flowers.silence();if(solved)sound.stop();updateAudio();});audio.className='conversion-audio-fab chain-audio';
    function updateAudio(){audio.setAttribute('aria-label',sound.muted?'Unmute audio':'Mute audio');audio.setAttribute('aria-pressed',String(sound.muted));audio.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4Z"/>${sound.muted?'<path stroke="#d32f2f" d="m16 9 5 6m0-6-5 6"/>':'<path d="M15 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14"/>'}</svg>`;}
    updateAudio();panel.append(audio);releaseAudio=dockGameAudio(audio,root);
    }
    ready=el('dialog','conversion-ready-dialog chain-ready');ready.setAttribute('aria-label','Ready for the original question?');
    ready.append(el('p','','Ready for the original question?'));
    const actions=el('div','conversion-ready-actions');
    const retry=button('No, try again',()=>{stage=0;solved=false;revealed=!challenge;setup();render();});retry.classList.add('conversion-ready-retry');
    const proceed=button('Yes, I’m ready',close);proceed.classList.add('conversion-ready-continue');
    actions.append(retry,proceed);ready.append(actions);
    ready.classList.add('quode-completion-dialog');
    completion={
      // Reveal in place without dialog.show() moving focus and scrolling.
      schedule(){if(solved&&panel?.isConnected)ready.setAttribute('open','');},
      cancel(){ready.removeAttribute('open');}
    };
    ready.addEventListener('cancel',event=>{event.preventDefault();close();});
    panel.addEventListener('pointerdown',()=>{if(!solved)sound.start();});sound.start();
    if(d.showBricks&&revealed)wall(main,stage);else panel.classList.add('chain-no-figure');
  }
  function revealWall(){
    for(const row of main.querySelectorAll('.chain-layer')){
      const index=Number(row.dataset.layer), preview=!solved&&index===stage+1;
      const visible=index<=stage||preview;
      row.style.visibility=visible?'visible':'hidden';row.setAttribute('aria-hidden',String(!visible));
      row.dataset.preview=String(preview);
      const count=preview?d.factors[stage]:d.totals[index];
      row.querySelector('.chain-label').textContent=`${count} ${d.units[index]}`;
      for(const [i,brick] of [...row.querySelectorAll('.chain-brick')].entries())brick.style.visibility=visible&&i<count?'visible':'hidden';
    }
  }
  async function completeStep(active,entry,finalOnly){
    const run=++transition;busy=true;dispose();
    const hintNode=active.querySelector('.chain-rule,.chain-challenge');
    entry.replaceChildren(...styled('span','',finalOnly?`${question.answer} ${d.units.at(-1)}`:`${d.totals[stage]} × ${d.factors[stage]} = ${d.totals[stage+1]} ${d.units[stage+1]}`).childNodes);
    active.querySelector('.chain-feedback')?.remove();active.querySelector('.chain-step-hint')?.remove();active.querySelector('.chain-keypad-slot')?.remove();
    const row=main.querySelector(`[data-layer="${stage+1}"]`);
    const drops=[];
    if(row){
      sound.play('whoosh');
      const bricks=[...row.querySelectorAll('.chain-brick')];
      for(let i=d.factors[stage];i<bricks.length;i++){
        const brick=bricks[i];brick.style.visibility='visible';
        drops.push(animate(brick,[{transform:'translateY(-220px)',opacity:0},{transform:'translateY(0)',opacity:1}],{duration:480,delay:(i-d.factors[stage])*75,easing:'cubic-bezier(.45,0,.85,.65)'}).then(()=>{if(run===transition){sound.play('impact',bricks.length);root.dispatchEvent(new CustomEvent('chain-brick-landed',{detail:{layer:stage+1,index:i}}));}}));
      }
    }
    await animate(hintNode,[{opacity:1},{opacity:0}],{duration:300});
    if(run!==transition)return;
    await animate(hintNode,[{height:`${hintNode.getBoundingClientRect().height}px`,marginBottom:'10px',opacity:0},{height:'0px',marginBottom:'0px',opacity:0}],{duration:300,easing:'ease-in-out'});
    await Promise.all(drops);
    if(row&&!reduced.matches)await new Promise(resolve=>setTimeout(resolve,200));
    if(run!==transition)return;
    if(finalOnly||stage===d.factors.length-1){
      stage=d.factors.length;solved=true;sound.stop();
      void stepFeedback.show(true,{holdMs:2000,onLanded:async()=>{if(solved&&panel?.isConnected){const finished=await flowers.play();if(finished&&run===transition)completion.schedule();}}});
      if(challenge)root.dispatchEvent(new CustomEvent('teaching-answer',{bubbles:true,detail:{answer:question.answer,correct:true}}));
    }else stage++;
    busy=false;render();
    const next=work.querySelector('.chain-active');
    if(next)await animate(next,[{opacity:0},{opacity:1}],{duration:250});
  }
  function render() {
    dispose();work.replaceChildren();panel.dataset.stage=stage;revealWall();
    // Completed steps retain only their equations; hints retire in sequence.
    if(revealed)for(let i=0;i<stage;i++){
      const step=el('div','chain-step chain-completed');
      step.append(styled('div','chain-equation',`${d.totals[i]} × ${d.factors[i]} = ${d.totals[i+1]} ${d.units[i+1]}`));work.append(step);
    }
    if(solved){
      if(challenge)work.append(el('p','chain-complete',`${c.correct} ${question.answer} ${d.units.at(-1)}`));
      else work.lastElementChild?.classList.add('chain-complete');
      work.append(ready);
      return;
    }
    const finalOnly=challenge&&!revealed,expected=finalOnly?d.totals.at(-1):d.totals[stage+1];
    const active=el('div','chain-step chain-active');work.append(active);
    active.append(styled('p',finalOnly?'chain-challenge':'chain-rule',finalOnly?c.challenge:hint(stage)));
    const entry=el('div','chain-entry chain-equation'),input=el('input','');input.type='hidden';input.dataset.expectedAnswer=String(expected);
    const feedback=el('p','chain-feedback');feedback.setAttribute('role','status');
    const keypad=el('div','chain-keypad-slot');
    const check=button(c.check,()=>{
      if(busy)return;
      const value=input.value.trim().replace(/,/g,'');
      const correct=/^\d+$/.test(value)&&Number(value)===expected;
      sound.start();
      if(correct)flowers.success();else{flowers.error();void stepFeedback.show(false,{persist:true});}
      if(correct&&!finalOnly&&stage<d.factors.length-1)void stepFeedback.show(true,{holdMs:2000});
      feedback.textContent=correct?c.correct:c.wrong;feedback.dataset.correct=String(correct);
      if(!correct){
        if(finalOnly){revealed=true;render();}
        else feedback.textContent=hasBrickGame?`${c.wrong} ${question.steps[stage].hint}`:c.wrong;
        return;
      }
      check.disabled=true;
      void completeStep(active,entry,finalOnly);
    });
    editor=mountMathInput(input,{ariaLabel:finalOnly?'Final total':`Total ${d.units[stage+1]}`,onSubmit:()=>check.click(),inlineKeypadContainer:keypad,revealOnEdit:false});
    check.disabled=true;input.addEventListener('input',()=>{check.disabled=!input.value.trim();feedback.textContent='';});
    if(!finalOnly)entry.append(styled('span','chain-expression',`${d.totals[stage]} × ${d.factors[stage]} =`));
    entry.append(input,editor.element,el('span','chain-unit',finalOnly?d.units.at(-1):d.units[stage+1]),check);
    active.append(entry);
    if(!hasBrickGame&&revealed)active.append(el('p','chain-step-hint',question.steps[stage].hint));
    active.append(keypad,feedback);
    const alignKeypad=()=>{
      const offset=editor.element.getBoundingClientRect().left-keypad.getBoundingClientRect().left;
      keypad.style.setProperty('--chain-answer-offset',`${Math.max(0,offset)}px`);
    };
    alignKeypad();
    keypadAlignment=new ResizeObserver(alignKeypad);
    keypadAlignment.observe(entry);
    keypadAlignment.observe(editor.element);
    if(stage>0){
      const area=work.getBoundingClientRect(),box=entry.getBoundingClientRect();
      const top=Math.max(0,area.top),bottom=Math.min(innerHeight,area.bottom);
      if(box.bottom>bottom)work.scrollTop+=box.bottom-bottom;
      else if(box.top<top)work.scrollTop+=box.top-top;
    }
  }
  function documentView(view){cancelTransitions();restorePrompt();dispose();panel=null;root.replaceChildren();const target=el('section','chain-document');if(d.showBricks)wall(target,d.factors.length);for(let i=0;i<d.factors.length;i++)target.append(el('p','',`${d.totals[i]} × ${d.factors[i]} = ${view==='workbook'?'______':d.totals[i+1]} ${d.units[i+1]}`));root.append(target);}
  return {setView(view){if(view!=='stepwise')documentView(view);},startHelp(){setup();render();},closeHelp(){cancelTransitions();restorePrompt();dispose();root.replaceChildren();panel=null;},pause(){cancelTransitions();restorePrompt();dispose();},destroy(){cancelTransitions();sound.destroy();flowers.destroy();stepFeedback.destroy();restorePrompt();dispose();root.replaceChildren();panel=null;}};
}
