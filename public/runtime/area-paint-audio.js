// Piano starts on simulation entry; soft brush swishes start with painting.
export function createPaintAudio() {
  let context, volume, filter, noise, timer, music, disposed=false;
  let muted=false;
  let musicWanted=false;
  function clearRetry() {
    document.removeEventListener('pointerup', retryMusic);
    document.removeEventListener('keydown', retryMusic);
  }
  function retryMusic() { if(musicWanted)startMusic(); }
  function startMusic() {
    if(muted || disposed)return;
    musicWanted=true;
    try {
      if(!music){music=new Audio(new URL('./audio/paint-piano.mp3',import.meta.url).href);music.loop=true;music.volume=.22;}
      music.play().then(clearRetry).catch(error=>{
        // An automatically opened simulation may need the first browser gesture.
        if(error.name==='NotAllowedError' && musicWanted && !muted && !disposed){
          document.addEventListener('pointerup',retryMusic);
          document.addEventListener('keydown',retryMusic);
        }
      });
    }catch{}
  }
  function prime() {
    if (muted || disposed) return;
    startMusic();
    try {
      if (!context) {
        const AudioContext=window.AudioContext||window.webkitAudioContext;
        if (!AudioContext) return;
        context=new AudioContext();
        volume=context.createGain();volume.gain.value=0;volume.connect(context.destination);
        const buffer=context.createBuffer(1,context.sampleRate*2,context.sampleRate);
        const data=buffer.getChannelData(0);
        let smooth=0;
        for(let i=0;i<data.length;i++){smooth=(smooth+Math.random()*.12-.06)/1.06;data[i]=smooth*5;}
        noise=context.createBufferSource();noise.buffer=buffer;noise.loop=true;
        filter=context.createBiquadFilter();filter.type='bandpass';filter.frequency.value=1200;filter.Q.value=.45;
        noise.connect(filter);filter.connect(volume);noise.start();

      }
      if(context.state==='suspended')context.resume().catch(()=>{});
    } catch { /* Painting still works when audio is unavailable. */ }
  }
  function stop() {
    clearTimeout(timer);
    if(!context || !volume || context.state==='closed')return;
    try {volume.gain.cancelScheduledValues(context.currentTime);volume.gain.setTargetAtTime(0,context.currentTime,.055);}catch{}
  }
  function move(row, progress) {
    if(muted || disposed || !context || !volume || !filter)return;
    const now=context.currentTime;
    try {
      // A quiet, airy stroke with a gentle swell instead of a gritty frequency sweep.
      const swell=Math.sin(Math.PI*progress);
      filter.frequency.setTargetAtTime(1200+250*swell,now,.08);
      volume.gain.setTargetAtTime(.065+.025*swell,now,.06);
      clearTimeout(timer);timer=setTimeout(stop,100);
    } catch {}
  }
  function pauseMusic(){musicWanted=false;clearRetry();music?.pause();}
  return {startMusic,prime,move,stop,pauseMusic,get muted(){return muted;},
    toggle(){muted=!muted;try{localStorage.setItem('psat-audio-muted',String(muted));}catch{}if(muted){stop();pauseMusic();}else prime();return muted;},
    destroy(){disposed=true;stop();pauseMusic();if(music){music.removeAttribute('src');music.load();music=undefined;}if(context){context.close().catch(()=>{});context=undefined;}}
  };
}
