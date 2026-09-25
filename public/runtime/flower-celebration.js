// The same flower waves, colours, timings and success melody used by Quode Player.
export function createFlowerCelebration({ isMuted = () => false } = {}) {
const tones = new Set();
let quodeAudioContext;
let activeFlowers, finishFlowers;
function element(tag, className, text) { const node=document.createElement(tag); node.className=className; if(text!=null) node.textContent=text; return node; }
function audioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return undefined;
  if (!quodeAudioContext) quodeAudioContext = new AudioContextClass();
  if (quodeAudioContext.state === "suspended") quodeAudioContext.resume().catch(() => {});
  return quodeAudioContext;
}

function playTone(frequency, delay, duration, volume, type = "sine") {
  if (isMuted()) return;
  try {
  const context = audioContext();
  if (!context) return;
  const start = context.currentTime + delay;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(.0001, start);
  gain.gain.linearRampToValueAtTime(volume, start + .012);
  gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
  oscillator.connect(gain).connect(context.destination);
  tones.add(oscillator);
  oscillator.onended = () => { tones.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
  oscillator.start(start);
  oscillator.stop(start + duration + .02);
  } catch { /* Audio must never prevent feedback or flowers. */ }
}

function playSuccessMusic() {
  [
    [523.25, 0, .34], [659.25, .2, .34], [783.99, .4, .42], [1046.5, .66, .55],
    [783.99, 1.02, .32], [987.77, 1.22, .36], [1174.66, 1.45, .42], [1318.51, 1.72, .68],
  ].forEach(([frequency, delay, duration]) => playTone(frequency, delay, duration, .035, "sine"));
}

function playErrorMusic() {
  // A clearer descending error cue, above the quiet background melody.
  [[440,0,.18,.075],[293.66,.16,.22,.08],[220,.34,.3,.085]]
    .forEach(([frequency,delay,duration,volume]) => playTone(frequency,delay,duration,volume,'triangle'));
}
function silence() {
  for (const oscillator of tones) { try { oscillator.stop(); } catch {} }
  tones.clear();
}
function cancel() {
  activeFlowers?.getAnimations({subtree:true}).forEach(animation => animation.cancel());
  activeFlowers?.remove(); activeFlowers = undefined;
  finishFlowers?.(false); finishFlowers = undefined;
  silence();
}
function celebrateWithFlowers() {
  cancel();
  const previous = document.querySelector(".flower-celebration");
  if (previous) previous.remove();
  const celebration = element("div", "flower-celebration");
  celebration.setAttribute("aria-hidden", "true");
  playSuccessMusic();
  const glyphs = ["✿", "❀", "✾"];
  const lanesPerWave = 18;
  for (let index = 0; index < 54; index += 1) {
    const wave = Math.floor(index / lanesPerWave);
    const lane = index % lanesPerWave;
    const laneOffset = (Math.random() - .5) * .7;
    const flower = element("span", "falling-flower", glyphs[Math.floor(Math.random() * glyphs.length)]);
    flower.style.setProperty("--flower-left", `${((lane + .5 + laneOffset) / lanesPerWave) * 100}%`);
    flower.style.setProperty("--flower-delay", `${wave * 150 + Math.random() * 100}ms`);
    flower.style.setProperty("--flower-duration", `${2100 + Math.random() * 300}ms`);
    flower.style.setProperty("--flower-drift", `${(Math.random() - .5) * 120}px`);
    flower.style.setProperty("--flower-size", `${1.25 + Math.random() * .8}rem`);
    flower.style.setProperty("--flower-color", ["#e65100", "#0288d1", "#2e7d32", "#c62828"][index % 4]);
    celebration.append(flower);
  }
  document.body.append(celebration);
  activeFlowers = celebration;
  return new Promise((resolve) => {
    finishFlowers = resolve;
    // Follow actual CSS completion, including delays and reduced motion.
    Promise.all(celebration.getAnimations({subtree:true}).map(animation => animation.finished)).then(() => {
      if (activeFlowers !== celebration) return;
      celebration.remove();
      activeFlowers = undefined; finishFlowers = undefined;
      resolve(true);
    }).catch(() => {
      if (activeFlowers === celebration) cancel();
    });
  });
}


return { play:celebrateWithFlowers, success:playSuccessMusic, error:playErrorMusic, cancel, silence, destroy() { cancel(); quodeAudioContext?.close().catch(() => {}); } };
}
