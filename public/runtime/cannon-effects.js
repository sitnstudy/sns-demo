// Local Web Audio: no network assets, and gameplay also works without audio.
export function createCannonAudio() {
  let context, master, compressor, background, musicBuffer, resumePromise;
  let enabled = true, disposed = false, backgroundRequested = false, generation = 0;
  const voices = new Set();
  try { enabled = localStorage.getItem('psat-audio-muted') !== 'true'; } catch {}
  function prime() {
    if (!enabled || disposed) return Promise.resolve(null);
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return Promise.resolve(null);
      if (!context) {
        context = new Audio(); master = context.createGain(); master.gain.value = .18;
        compressor = context.createDynamicsCompressor();
        compressor.threshold.value = -24; compressor.ratio.value = 8;
        master.connect(compressor); compressor.connect(context.destination);
      }
      if (context.state === 'running') return Promise.resolve(context);
      if (!resumePromise) {
        // iOS keeps a new context suspended and resolves resume() later. Do
        // not inspect state until that promise settles or music is lost.
        resumePromise = Promise.resolve(context.resume?.())
          .then(() => context?.state === 'running' ? context : null)
          .catch(() => null)
          .finally(() => { resumePromise = undefined; });
      }
      return resumePromise;
    } catch {
      context = undefined;
      return Promise.resolve(null);
    }
  }
  function playNow(kind, count = 1) {
    if (!enabled || disposed || !context || context.state !== 'running') return;
    try {
      const now = context.currentTime, gain = context.createGain();
      const duration = kind === 'whoosh' ? .13 : .18;
      const volume = (kind === 'whoosh' ? .22 : .32) / Math.sqrt(Math.max(1,count/12));
      let source, filter;
      const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let i=0;i<samples.length;i++) samples[i]=(Math.random()*2-1)*(kind==='impact' ? Math.exp(-6*i/samples.length) : 1);
      source=context.createBufferSource(); source.buffer=buffer;
      filter=context.createBiquadFilter(); filter.type=kind==='impact'?'highpass':'bandpass';
      filter.frequency.setValueAtTime(kind==='impact'?900:1600,now);
      if(kind==='whoosh') filter.frequency.exponentialRampToValueAtTime(180,now+duration);
      source.connect(filter); filter.connect(gain);
      gain.gain.setValueAtTime(.0001,now);
      gain.gain.exponentialRampToValueAtTime(volume,now+.012);
      gain.gain.exponentialRampToValueAtTime(.0001,now+duration);
      gain.connect(master); voices.add(source);
      source.onended=()=>{voices.delete(source);source.disconnect();filter?.disconnect();gain.disconnect();};
      source.start(now); source.stop(now+duration+.01);
    } catch { /* Audio failure must not interrupt a volley. */ }
  }
  function play(kind, count = 1) {
    if (!enabled || disposed) return;
    const requestedGeneration = generation;
    if (context?.state === 'running') playNow(kind, count);
    else prime().then(active => {
      if (active && enabled && !disposed && requestedGeneration === generation)
        playNow(kind, count);
    });
  }
  function stop() {
    generation++;
    backgroundRequested=false;
    if (background) { try { background.stop(); } catch {} background=undefined; }
    for (const source of voices) { try { source.stop(); } catch {} }
    voices.clear();
  }
  function startBackground() {
    if (!enabled || background || disposed || !context || context.state !== 'running') return;
    try {
      if (!musicBuffer) {
        // Use Question 3's Space Invaders march: four chromatic bass pulses.
        const notes=[65.406,61.735,58.270,55],step=.48,duration=.16,rate=context.sampleRate;
        musicBuffer=context.createBuffer(1,Math.round(rate*step*notes.length),rate);
        const samples=musicBuffer.getChannelData(0);
        notes.forEach((frequency,beat)=>{
          const offset=Math.round(beat*step*rate);
          for(let i=0;i<Math.floor(duration*rate);i++){
            const t=i/rate,phase=2*Math.PI*frequency*t;
            const envelope=Math.min(1,t/.004)*Math.min(1,(duration-t)/.018);
            const pulse=Math.sin(phase)+.55*Math.sin(2*phase)+.2*Math.sin(3*phase)+.4*Math.sin(4*phase);
            samples[offset+i]=pulse/2.15*envelope;
          }
        });
      }
      const source=context.createBufferSource(),gain=context.createGain();
      source.buffer=musicBuffer;source.loop=true;gain.gain.value=.24;
      source.connect(gain);gain.connect(compressor);background=source;
      source.onended=()=>{source.disconnect();gain.disconnect();if(background===source)background=undefined;};
      source.start();
    } catch { background=undefined; }
  }
  function start() {
    if (!enabled || disposed) return;
    backgroundRequested=true;
    prime().then(active => {
      if (active && backgroundRequested && enabled && !disposed) startBackground();
    });
  }
  return {
    start, stop, play,
    get muted() { return !enabled; },
    toggle() { enabled=!enabled; try { localStorage.setItem('psat-audio-muted',String(!enabled)); } catch {} stop();if(enabled)start(); },
    destroy() { stop();disposed=true;Promise.resolve(context?.close?.()).catch(()=>{}); },
  };
}

export function createCannonVolley(root, audio) {
  let frame, settle;
  const animations = new Set();
  function cancel() {
    cancelAnimationFrame(frame);
    animations.forEach(a=>a.cancel()); animations.clear();
    root.querySelectorAll('.pc-projectile,.pc-fragment').forEach(n=>n.remove());
    root.querySelector('.pc-cannon')?.style.removeProperty('--pc-cannon-lift');
    settle?.(false);settle=undefined;
  }
  function shoot(stage, bricks, quantity) {
    cancel();
    const targets=bricks.slice(0,Math.min(bricks.length,Math.ceil(Number(quantity))));
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    const area=stage.getBoundingClientRect(), muzzle=stage.querySelector('.pc-muzzle').getBoundingClientRect();
    const cannon=stage.querySelector('.pc-cannon'), wall=stage.querySelector('.pc-wall').getBoundingClientRect();
    const start={x:muzzle.x+muzzle.width/2-area.x,y:muzzle.y+muzzle.height/2-area.y};
    const spacing=targets.length>1?Math.min(45,900/(targets.length-1)):0;
    const duration=reduced?0:320, startTime=performance.now();
    const shots=targets.map((brick,index)=>{
      const r=brick.getBoundingClientRect(), fraction=Math.min(1,Number(quantity)-index);
      const end={x:r.x-area.x+r.width*fraction/2,y:r.y-area.y+r.height/2};
      const lift=Math.min(82,Math.max(0,(wall.bottom-(r.y+r.height/2))*.28));
      return {brick,index,fraction,start:{x:start.x,y:start.y-lift},end,lift,launch:reduced?0:index*spacing,ball:null,hit:false,width:r.width*fraction,height:r.height};
    });
    function emit(type,shot) { root.dispatchEvent(new CustomEvent(type,{detail:{index:shot.index,start:{...shot.start},end:{...shot.end},fraction:shot.fraction,time:performance.now()}})); }
    function impact(shot) {
      shot.hit=true;shot.ball?.remove();shot.brick.classList.add('pc-broken');
      audio.play('impact',shots.length);emit('pc-brick-impact',shot);
      if(reduced)return;
      const shake=shot.brick.animate([{transform:'translate(0,0)'},{transform:'translate(-2px,1px) rotate(-5deg)'},{transform:'translate(2px,-1px) rotate(4deg)'},{transform:'translate(0,0)'}],{duration:120});
      animations.add(shake);shake.finished.then(()=>animations.delete(shake)).catch(()=>{});
      const pieces=[
        [-.34,-.28,-54,-42,-210],[-.08,-.32,-18,-58,-95],[.22,-.24,34,-48,135],
        [-.28,.14,-62,28,170],[.04,.1,8,46,-130],[.3,.18,66,24,240],
      ];
      for(const [j,piece] of pieces.entries()) {
        const [xPart,yPart,dx,dy,spin]=piece;
        const chunk=document.createElement('span');chunk.className='pc-fragment';
        chunk.dataset.brick=String(shot.index);
        const width=Math.max(4,Math.min(12,shot.width*.36));
        const height=Math.max(4,Math.min(12,shot.height*.42));
        chunk.style.cssText=`left:${shot.end.x+xPart*shot.width}px;top:${shot.end.y+yPart*shot.height}px;width:${width}px;height:${height}px;--dx:${dx+(shot.index+j)%9-4}px;--dy:${dy+((shot.index*3+j)%7-3)}px;--spin:${spin}deg`;
        stage.append(chunk);chunk.addEventListener('animationend',()=>chunk.remove(),{once:true});
      }
    }
    return new Promise(resolve=>{
      settle=resolve;
      function tick(now) {
        const elapsed=now-startTime;
        for(const shot of shots) {
          if(shot.hit || elapsed<shot.launch)continue;
          if(!shot.ball) {
            cannon.style.setProperty('--pc-cannon-lift',`${shot.lift}px`);
            shot.ball=document.createElement('span');shot.ball.className='pc-projectile';shot.ball.dataset.brick=String(shot.index);shot.ball.setAttribute('aria-hidden','true');
            stage.append(shot.ball);audio.play('whoosh',shots.length);emit('pc-projectile-launch',shot);
          }
          const progress=reduced?1:Math.min(1,(elapsed-shot.launch)/duration);
          const x=shot.start.x+(shot.end.x-shot.start.x)*progress,y=shot.start.y+(shot.end.y-shot.start.y)*progress;
          shot.ball.style.transform=`translate(${x-6}px,${y-6}px)`;
          if(progress===1)impact(shot);
        }
        const lastShot=shots.length ? shots[shots.length-1] : undefined;
        const end=(lastShot?.launch || 0)+duration+(reduced?0:360);
        if(elapsed>=end) { root.querySelectorAll('.pc-fragment').forEach(n=>n.remove());cannon.style.removeProperty('--pc-cannon-lift');settle=undefined;resolve(true); }
        else frame=requestAnimationFrame(tick);
      }
      frame=requestAnimationFrame(tick);
    });
  }
  return {shoot,cancel};
}
