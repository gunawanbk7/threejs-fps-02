// All sound is synthesised with WebAudio: no audio files, no network. A shared
// noise buffer feeds the gunshots and the explosion; short oscillators do the
// beeps, clicks and stings. Volume is distance-attenuated by the caller.
export function createAudio() {
  let context = null;
  let noiseBuffer = null;
  let master = null;

  function ensure() {
    if (context) return context;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = 0.5;
    master.connect(context.destination);
    const length = context.sampleRate * 1;
    noiseBuffer = context.createBuffer(1, length, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return context;
  }

  function noise({ duration, volume, filterFreq, filterType = 'lowpass', when = 0 }) {
    const ctx = ensure();
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(t);
    source.stop(t + duration + 0.02);
  }

  function tone({ freq, freqEnd = null, duration, volume, type = 'sine', when = 0 }) {
    const ctx = ensure();
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd !== null) osc.frequency.exponentialRampToValueAtTime(freqEnd, t + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  return {
    unlock() {
      const ctx = ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume();
    },
    shot(distance = 0) {
      // Close shots crack; distant shots are a dull thump.
      const atten = Math.max(0.12, 1 - distance / 70);
      noise({ duration: 0.11, volume: 0.5 * atten, filterFreq: 2600 });
      noise({ duration: 0.22, volume: 0.35 * atten, filterFreq: 320 });
      tone({ freq: 160, freqEnd: 55, duration: 0.1, volume: 0.25 * atten, type: 'triangle' });
    },
    dryFire() {
      tone({ freq: 1400, duration: 0.03, volume: 0.12, type: 'square' });
    },
    reload() {
      tone({ freq: 900, duration: 0.04, volume: 0.14, type: 'square', when: 0 });
      tone({ freq: 620, duration: 0.05, volume: 0.14, type: 'square', when: 0.45 });
      tone({ freq: 1100, duration: 0.05, volume: 0.16, type: 'square', when: 1.35 });
    },
    hit(kill) {
      tone({ freq: kill ? 1320 : 980, duration: 0.06, volume: 0.2, type: 'square' });
      if (kill) tone({ freq: 1760, duration: 0.09, volume: 0.18, type: 'square', when: 0.07 });
    },
    hurt() {
      tone({ freq: 220, freqEnd: 110, duration: 0.16, volume: 0.3, type: 'sawtooth' });
      noise({ duration: 0.12, volume: 0.2, filterFreq: 500 });
    },
    step() {
      noise({ duration: 0.05, volume: 0.05, filterFreq: 400 });
    },
    bounce() {
      tone({ freq: 2400, freqEnd: 1800, duration: 0.04, volume: 0.1, type: 'square' });
    },
    beep(planted = false) {
      tone({ freq: planted ? 1560 : 1040, duration: 0.09, volume: 0.22, type: 'square' });
    },
    plantDone() {
      tone({ freq: 880, duration: 0.12, volume: 0.22, type: 'square' });
      tone({ freq: 1174, duration: 0.16, volume: 0.22, type: 'square', when: 0.12 });
    },
    defuseDone() {
      tone({ freq: 1174, duration: 0.12, volume: 0.22, type: 'square' });
      tone({ freq: 880, duration: 0.18, volume: 0.22, type: 'square', when: 0.12 });
    },
    explosion() {
      noise({ duration: 1.4, volume: 0.9, filterFreq: 240 });
      noise({ duration: 0.5, volume: 0.6, filterFreq: 3200, filterType: 'highpass' });
      tone({ freq: 90, freqEnd: 28, duration: 1.1, volume: 0.7, type: 'sine' });
    },
    buy() {
      tone({ freq: 1320, duration: 0.05, volume: 0.16, type: 'square' });
      tone({ freq: 1760, duration: 0.07, volume: 0.14, type: 'square', when: 0.05 });
    },
    denied() {
      tone({ freq: 220, duration: 0.12, volume: 0.2, type: 'square' });
    },
    roundStart() {
      tone({ freq: 523, duration: 0.1, volume: 0.18, type: 'triangle' });
      tone({ freq: 784, duration: 0.16, volume: 0.18, type: 'triangle', when: 0.1 });
    },
    roundEnd(win) {
      const notes = win ? [523, 659, 784, 1046] : [392, 330, 262];
      notes.forEach((freq, i) => tone({ freq, duration: 0.18, volume: 0.2, type: 'triangle', when: i * 0.13 }));
    },
    tick() {
      tone({ freq: 1200, duration: 0.04, volume: 0.14, type: 'square' });
    },
  };
}
