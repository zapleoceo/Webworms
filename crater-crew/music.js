// Crater Crew background music: public-domain classical themes rendered as a
// soft cartoon-band arrangement with Web Audio (mallet / pizzicato lead,
// detuned string pad, walking bass, brushed drums, small room reverb).
// No samples, no recordings. Melodies are transcribed note by note from the
// public-domain compositions (all composers died more than 100 years ago).
//
// API:
//   const player = createMusic(getAudioContext)
//   player.tick(state)   every frame; schedules ~0.2 s ahead
//   player.setMood(m)    'battle' | 'tense' | 'victory' | 'defeat'
//   player.next()        next track in the rotation (new match / rematch)
//   player.reset()       stop scheduling, restart current track from the top
//
// Without an AudioContext every call is a silent no-op.

const LOOKAHEAD = 0.2;        // seconds scheduled ahead of audio.currentTime
const MASTER_LEVEL = 0.05;    // master gain at musicVolume = 1 (sits under the effects)
const TENSE_TEMPO = 1.25;     // tempo multiplier for the 'tense' mood
const FADE = 0.05;            // seconds of fade-out when a tune is cut (no clicks)
const JITTER = 0.006;         // max humanised delay of a note, seconds

// --- note data -------------------------------------------------------------
// Melodies are written as "NOTE/dur" tokens, dur in sixteenth notes, "r/dur"
// is a rest; parsed into arrays of [midiOrNull, durationInSixteenths].
// Chords: one symbol per beat (quarter note); "-" holds the previous one.
// Drums: one char per sixteenth per bar: k soft kick, s brushed snare,
// h shaker, . nothing.
// swing: how far (fraction of a sixteenth) every off-sixteenth is pushed late.

const NOTE_INDEX = {C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11};

export function noteToMidi(name) {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!m) throw new Error('bad note ' + name);
  return 12 * (Number(m[3]) + 1) + NOTE_INDEX[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

export function parseMelody(text) {
  return text.trim().split(/\s+/).map(tok => {
    const [n, d] = tok.split('/');
    const dur = Number(d);
    if (!(dur > 0)) throw new Error('bad duration ' + tok);
    return [n === 'r' ? null : noteToMidi(n), dur];
  });
}

export const TRACKS = [
  {
    // Jacques Offenbach (d. 1880) - "Galop infernal" from Orphee aux enfers
    // (1858), the can-can. Main theme, 8 bars of 2/4 in C major.
    id: 'cancan', title: 'Galop infernal (Can-can)', composer: 'Jacques Offenbach', died: 1880,
    bpm: 132, beatsPerBar: 2, swing: 0.1,
    melody: `C5/8
             C5/2 D5/2 F5/2 E5/2   D5/4 G5/4
             G5/2 A5/2 E5/2 F5/2   D5/4 D5/4
             D5/2 F5/2 E5/2 D5/2   C5/2 C6/2 B5/2 A5/2
             G5/2 F5/2 E5/2 D5/2`,
    chords: 'C6 - C6 - G7 - G - G7 - G7 - C6 - G7 -',
    drums: ['k.h.s.h.'],
    style: 'oompah', lead: 'mallet',
  },
  {
    // Gioachino Rossini (d. 1868) - William Tell Overture (1829), finale
    // ("March of the Swiss Soldiers" gallop). Main theme, 8 bars of 2/4, E major.
    id: 'tell', title: 'William Tell Overture (finale)', composer: 'Gioachino Rossini', died: 1868,
    bpm: 138, beatsPerBar: 2, swing: 0.05,
    melody: `B4/1 B4/1 B4/2 B4/1 B4/1 B4/2   B4/1 B4/1 E5/2 F#5/2 G#5/2
             B4/1 B4/1 B4/2 B4/1 B4/1 B4/2   B4/1 B4/1 F#5/2 D#5/2 B4/2
             B4/1 B4/1 B4/2 B4/1 B4/1 B4/2   B4/1 B4/1 E5/2 F#5/2 G#5/2
             E5/1 E5/1 G#5/2 F#5/2 D#5/2     E5/4 r/4`,
    chords: 'E6 - E - E6 - B7 - E6 - E - B7 - E B7',
    drums: ['k.h.s.hh'],
    style: 'oompah', lead: 'mallet',
  },
  {
    // Wolfgang Amadeus Mozart (d. 1791) - Piano Sonata No. 11, K. 331,
    // 3rd mvt "Rondo alla Turca" (1783). Opening theme, 16 bars of 2/4, A minor
    // (the 16th-note upbeat B-A-G#-A sits at the end of bars 8 and 16).
    id: 'turca', title: 'Rondo alla Turca', composer: 'Wolfgang Amadeus Mozart', died: 1791,
    bpm: 116, beatsPerBar: 2, swing: 0.08,
    melody: `C5/2 r/2 D5/1 C5/1 B4/1 C5/1   E5/2 r/2 F5/1 E5/1 D#5/1 E5/1
             B5/1 A5/1 G#5/1 A5/1 B5/1 A5/1 G#5/1 A5/1   C6/4 A5/2 C6/2
             B5/2 A5/2 G#5/2 A5/2   B5/2 A5/2 G#5/2 A5/2
             B5/2 A5/2 G#5/2 F#5/2  E5/4 B4/1 A4/1 G#4/1 A4/1
             C5/2 r/2 D5/1 C5/1 B4/1 C5/1   E5/2 r/2 F5/1 E5/1 D#5/1 E5/1
             B5/1 A5/1 G#5/1 A5/1 B5/1 A5/1 G#5/1 A5/1   C6/4 A5/2 B5/2
             C6/2 B5/2 A5/2 G#5/2   A5/2 E5/2 F5/2 D5/2
             C5/4 B4/4              A4/4 B4/1 A4/1 G#4/1 A4/1`,
    chords: 'Am - Am - E - Am - E - Am - E - E - Am - Am - E - Am - Am E Dm - Am E Am -',
    drums: ['k...s.h.'],
    style: 'oompah', lead: 'mallet',
  },
  {
    // Edvard Grieg (d. 1907) - "In the Hall of the Mountain King" from
    // Peer Gynt (1875). Main theme, 8 bars of 4/4: B minor, then the answer
    // on F#. Also used as the 'tense' (sudden death / low timer) track.
    // Played an octave down on pizzicato strings, as in the original.
    id: 'mountainking', title: 'In the Hall of the Mountain King', composer: 'Edvard Grieg', died: 1907,
    bpm: 108, beatsPerBar: 4, swing: 0.1, leadShift: -12,
    melody: `B4/2 C#5/2 D5/2 E5/2 F#5/2 D5/2 F#5/4
             F5/2 C#5/2 F5/4 E5/2 C5/2 E5/4
             B4/2 C#5/2 D5/2 E5/2 F#5/2 D5/2 F#5/2 B5/2
             A5/2 F#5/2 D5/2 F#5/2 A5/8
             F#5/2 G#5/2 A#5/2 B5/2 C#6/2 A#5/2 C#6/4
             D6/2 A#5/2 D6/4 C#6/2 A#5/2 C#6/4
             F#5/2 G#5/2 A#5/2 B5/2 C#6/2 A#5/2 C#6/4
             C#6/2 A#5/2 F#5/2 A#5/2 C#6/8`,
    chords: 'Bm - Bm - C# - C - Bm - Bm - D - D - F# - F# - A# - F# - F# - F# - F# - F# -',
    drums: ['k...s...k.h.s...'],
    style: 'pizzicato', lead: 'pluck',
  },
];

// Short mood phrases (original, simple arpeggios - not taken from any work).
const VICTORY = {
  id: 'victory', title: 'Victory fanfare', composer: 'original', died: null,
  bpm: 120, beatsPerBar: 4, once: true, swing: 0,
  melody: 'C5/1 E5/1 G5/1 C6/3 G5/2 C6/8',
  chords: 'C - - -', drums: ['k.......s.......'], style: 'pizzicato', lead: 'mallet',
};
const DEFEAT = {
  id: 'defeat', title: 'Defeat sting', composer: 'original', died: null,
  bpm: 100, beatsPerBar: 4, once: true, swing: 0,
  melody: 'G4/4 F#4/4 F4/4 E4/4',
  chords: 'C B Bb Am', drums: ['................'], style: 'pizzicato', lead: 'mallet',
};

// --- arrangement: turn a track into per-sixteenth event buckets -------------

const CHORD_SHAPES = {
  '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], '6': [0, 4, 7, 9], m6: [0, 3, 7, 9],
  maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], dim: [0, 3, 6], aug: [0, 4, 8],
};

export function parseChord(sym) {
  const m = /^([A-G])(#|b)?(maj7|m7|m6|m|7|6|dim|aug)?$/.exec(sym);
  if (!m) throw new Error('bad chord ' + sym);
  const root = (NOTE_INDEX[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  return {root, shape: CHORD_SHAPES[m[3] || '']};
}

// Close voicing of a chord with every tone inside [low, low + 12): consecutive
// chords land near each other, so the pad moves smoothly instead of jumping.
export function voicing(chord, low) {
  return chord.shape.map(iv => low + (((chord.root + iv - low) % 12) + 12) % 12).sort((a, b) => a - b);
}

const bassRoot = pc => 40 + ((pc + 12 - 4) % 12); // E2..D#3

export function arrange(track) {
  const melody = parseMelody(track.melody);
  const bar16 = track.beatsPerBar * 4;
  const total = melody.reduce((s, [, d]) => s + d, 0);
  const length = Math.ceil(total / bar16) * bar16;
  const steps = Array.from({length}, () => []);
  const shift = track.leadShift || 0;
  let t = 0;
  for (const [midi, dur] of melody) {
    if (midi !== null) steps[t].push({voice: 'lead', midi: midi + shift, dur});
    t += dur;
  }
  // chord spans: a symbol starts a span, "-" (or the same symbol again) extends it
  const syms = track.chords.trim().split(/\s+/);
  const beats = length / 4;
  const spans = [];
  for (let b = 0; b < beats; b++) {
    const sym = syms[b] ?? '-';
    const last = spans[spans.length - 1];
    if (sym === '-' || (last && last.sym === sym)) { if (last) last.beats++; continue; }
    spans.push({sym, chord: parseChord(sym), beat: b, beats: 1});
  }
  spans.forEach((span, i) => {
    const {chord} = span;
    const next = spans[i + 1] ?? (track.once ? null : spans[0]);
    // pad: one sustained chord per span
    steps[span.beat * 4].push({voice: 'pad', midis: voicing(chord, 55), dur: span.beats * 4});
    // walking bass: root, fifth, third ... and a chromatic step into the next chord
    const root = bassRoot(chord.root);
    for (let k = 0; k < span.beats; k++) {
      const at = (span.beat + k) * 4;
      let midi;
      if (k === 0) midi = root;
      else if (k === span.beats - 1 && next && next.chord.root !== chord.root) {
        const target = bassRoot(next.chord.root);
        midi = Math.abs(target - 1 - root) <= Math.abs(target + 1 - root) ? target - 1 : target + 1;
      } else if (k % 2 === 1) midi = root + 7 <= 52 ? root + 7 : root - 5;
      else midi = root + chord.shape[1];
      steps[at].push({voice: 'bass', midi, dur: track.style === 'pizzicato' ? 2 : 3});
      // "pah": a soft off-beat chord in the middle register
      if (track.style === 'oompah') steps[at + 2].push({voice: 'comp', midis: voicing(chord, 57)});
    }
  });
  // drums
  const bars = length / bar16;
  for (let bar = 0; bar < bars; bar++) {
    const p = track.drums[Math.min(bar, track.drums.length - 1)] ?? '';
    for (let i = 0; i < bar16; i++) {
      const c = p[i % p.length];
      if (c === 'k' || c === 's' || c === 'h') steps[bar * bar16 + i].push({voice: c});
    }
  }
  return {track, length, bar16, steps, sec16: 60 / track.bpm / 4};
}

const ARRANGED = TRACKS.map(arrange);
const ARR_VICTORY = arrange(VICTORY);
const ARR_DEFEAT = arrange(DEFEAT);
const MOUNTAIN_KING = ARRANGED.findIndex(a => a.track.id === 'mountainking');

const mtof = m => 440 * 2 ** ((m - 69) / 12);
const cents = c => 2 ** (c / 1200);

// --- player ------------------------------------------------------------------

// Older or minimal Web Audio implementations may lack ramps or AudioParam
// methods; fall back to an immediate set.
const setAt = (p, v, t) => { if (!p) return; if (p.setValueAtTime) p.setValueAtTime(v, t); else p.value = v; };
const lin = (p, v, t) => { if (!p) return; if (p.linearRampToValueAtTime) p.linearRampToValueAtTime(v, t); else setAt(p, v, t); };
const tgt = (p, v, t, k) => { if (!p) return; if (p.setTargetAtTime) p.setTargetAtTime(v, t, k); else setAt(p, v, t); };
const fixed = (p, v) => { if (p) p.value = v; };

export function createMusic(getAudioContext) {
  let ctx = null, master = null, noise = null, bus = null;
  // A random tune each page load and match (never the same one twice in a row).
  let rotation = Math.floor(Math.random() * ARRANGED.length);
  let mood = 'battle';
  let current = ARRANGED[0];
  let tempo = 1;
  let step = 0;
  let nextTime = 0;
  let ended = false;
  let active = false;
  let disabled = false;
  let quietUntil = 0;        // end of the last fade-out; nothing new starts before it
  let rampEnd = 0;           // end of the current master fade-in
  let lastLevel = -1;
  let live = [];             // scheduled sources still to finish: {node, end}

  // --- persistent graph (built once per AudioContext) ------------------------
  function gain(v = 1) { const g = ctx.createGain(); fixed(g.gain, v); return g; }
  function filter(type, freq, q) {
    if (typeof ctx.createBiquadFilter !== 'function') return gain();
    const f = ctx.createBiquadFilter();
    f.type = type;
    fixed(f.frequency, freq);
    fixed(f.Q, q);
    return f;
  }
  function panner(pan) {
    if (typeof ctx.createStereoPanner !== 'function') return gain();
    const p = ctx.createStereoPanner();
    fixed(p.pan, pan);
    return p;
  }

  // Small dark room: decaying stereo noise, low-passed harder as it fades.
  function roomImpulse(sr) {
    const len = Math.floor(sr * 1.6);
    const ir = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      let y = 0;
      for (let i = 0; i < len; i++) {
        const x = i / len;
        const a = 0.5 * (1 - x) + 0.04;       // one-pole low-pass, darker tail
        y += a * ((Math.random() * 2 - 1) - y);
        data[i] = y * (1 - x) ** 3 * (i < sr * 0.012 ? i / (sr * 0.012) : 1);
      }
    }
    return ir;
  }

  function setup(ac) {
    ctx = ac;
    live = [];
    quietUntil = 0; rampEnd = 0; lastLevel = -1;
    master = gain(0);
    // mix -> gentle low-pass -> compressor -> master volume -> speakers
    const mix = gain(1);
    const tone = filter('lowpass', 2300, 0.5);
    mix.connect(tone);
    let out = tone;
    if (typeof ac.createDynamicsCompressor === 'function') {
      const limiter = ac.createDynamicsCompressor();
      fixed(limiter.threshold, -20); fixed(limiter.knee, 12); fixed(limiter.ratio, 4);
      fixed(limiter.attack, 0.008); fixed(limiter.release, 0.25);
      out.connect(limiter);
      out = limiter;
    }
    out.connect(master);
    master.connect(ac.destination);

    const sr = ac.sampleRate || 44100;
    let reverb = null;
    if (typeof ac.createConvolver === 'function' && typeof ac.createBuffer === 'function') {
      reverb = ac.createConvolver();
      reverb.buffer = roomImpulse(sr);
      const wet = gain(0.8);
      reverb.connect(wet);
      wet.connect(mix);
    }
    const send = (from, amount) => { if (reverb) { const s = gain(amount); from.connect(s); s.connect(reverb); } };

    // voice buses, each with its own low-pass
    const lead = gain(1), leadLp = filter('lowpass', 1900, 0.4);
    lead.connect(leadLp); leadLp.connect(mix); send(leadLp, 0.3);
    let delay = null;
    if (typeof ac.createDelay === 'function') {
      // quiet dotted-eighth echo on the lead
      delay = ac.createDelay(1);
      const dSend = gain(0.18), fb = gain(0.3), dLp = filter('lowpass', 1300, 0.3);
      leadLp.connect(dSend); dSend.connect(delay); delay.connect(dLp); dLp.connect(fb); fb.connect(delay); dLp.connect(mix);
    }
    const padLp = filter('lowpass', 1400, 0.3);
    const padL = panner(-0.45), padR = panner(0.45);
    padL.connect(padLp); padR.connect(padLp); padLp.connect(mix); send(padLp, 0.35);
    const compBus = gain(1), compLp = filter('lowpass', 1500, 0.4);
    compBus.connect(compLp); compLp.connect(mix); send(compLp, 0.2);
    const bassBus = gain(1), bassLp = filter('lowpass', 480, 0.5);
    bassBus.connect(bassLp); bassLp.connect(mix);
    const drums = gain(1);
    drums.connect(mix); send(drums, 0.1);
    const brush = filter('bandpass', 1900, 0.7); brush.connect(drums);
    const shaker = filter('bandpass', 3600, 1.1); shaker.connect(drums);
    bus = {lead, delay, padL, padR, comp: compBus, bass: bassBus, drums, brush, shaker};

    noise = null;
    if (typeof ac.createBuffer === 'function' && typeof ac.createBufferSource === 'function') {
      noise = ac.createBuffer(1, Math.floor(sr * 0.5), sr);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
  }

  // --- scheduled voices --------------------------------------------------------
  // Every source is stopped explicitly and its little chain disconnected when it
  // ends, so the graph never grows.
  function own(src, end, chain) {
    src.stop(end);
    src.onended = () => { for (const n of chain) { try { n.disconnect(); } catch { /* gone */ } } };
    live.push({node: src, end});
  }
  function osc(type, freq, at) {
    const o = ctx.createOscillator();
    o.type = type;
    setAt(o.frequency, freq, at);
    return o;
  }
  // percussive envelope: quick attack, exponential-ish decay
  function strike(g, at, peak, attack, tau) {
    setAt(g.gain, 0, at);
    lin(g.gain, peak, at + attack);
    tgt(g.gain, 0, at + attack, tau);
  }

  // soft mallet (marimba / vibes): sine body with a detuned triangle partner, a short 4th-harmonic "tok"
  function mallet(midi, at, len, vel) {
    const f = mtof(midi), ring = Math.min(1.2, Math.max(0.35, len * 1.6));
    const body = ctx.createGain(), tok = ctx.createGain();
    strike(body, at, 0.26 * vel, 0.006, ring / 5);
    strike(tok, at, 0.05 * vel, 0.002, 0.025);
    const a = osc('sine', f, at), b = osc('triangle', f * cents(5), at), c = osc('sine', f * 4, at);
    a.connect(body); b.connect(body); c.connect(tok);
    body.connect(bus.lead); tok.connect(bus.lead);
    for (const o of [a, b, c]) o.start(at);
    own(a, at + ring, [a, body]); own(b, at + ring, [b]); own(c, at + 0.15, [c, tok]);
  }

  // pizzicato strings: detuned saw pair through a closing low-pass
  function pluck(midi, at, len, vel) {
    const f = mtof(midi), tau = Math.min(0.16, Math.max(0.05, len * 0.5)), end = at + tau * 6;
    const g = ctx.createGain(), lp = filter('lowpass', 0, 0.8);
    setAt(lp.frequency, Math.min(3000, f * 7), at);
    tgt(lp.frequency, f * 1.6, at + 0.005, 0.07);
    strike(g, at, 0.2 * vel, 0.004, tau);
    const a = osc('sawtooth', f * cents(-6), at), b = osc('sawtooth', f * cents(6), at);
    a.connect(lp); b.connect(lp); lp.connect(g); g.connect(bus.lead);
    a.start(at); b.start(at);
    own(a, end, [a, lp, g]); own(b, end, [b]);
  }

  // string pad: per chord one detuned saw pair per tone, spread left/right
  function pad(midis, at, len, vel) {
    const attack = Math.min(0.35, len * 0.3), end = at + len;
    const level = 0.042 * vel;
    const gl = ctx.createGain(), gr = ctx.createGain();
    for (const g of [gl, gr]) {
      setAt(g.gain, 0, at);
      lin(g.gain, level, at + attack);
      setAt(g.gain, level, end);
      tgt(g.gain, 0, end, 0.15);
    }
    gl.connect(bus.padL); gr.connect(bus.padR);
    midis.forEach((m, i) => {
      const f = mtof(m);
      const l = osc('sawtooth', f * cents(-7), at), r = osc('sawtooth', f * cents(7), at);
      l.connect(gl); r.connect(gr);
      l.start(at); r.start(at);
      own(l, end + 0.7, i ? [l] : [l, gl]); own(r, end + 0.7, i ? [r] : [r, gr]);
    });
  }

  // off-beat "pah": short soft triangle chord
  function comp(midis, at, vel) {
    const g = ctx.createGain();
    strike(g, at, 0.055 * vel, 0.005, 0.06);
    g.connect(bus.comp);
    midis.forEach((m, i) => {
      const o = osc('triangle', mtof(m), at);
      o.connect(g); o.start(at);
      own(o, at + 0.3, i ? [o] : [o, g]);
    });
  }

  // round bass: triangle + sine, bouncy decay, short release
  function bass(midi, at, len, vel) {
    const f = mtof(midi), end = at + len;
    const g = ctx.createGain();
    setAt(g.gain, 0, at);
    lin(g.gain, 0.24 * vel, at + 0.008);
    tgt(g.gain, 0.13 * vel, at + 0.008, 0.12);
    tgt(g.gain, 0, end, 0.03);
    const a = osc('triangle', f, at), b = osc('sine', f, at);
    a.connect(g); b.connect(g); g.connect(bus.bass);
    a.start(at); b.start(at);
    own(a, end + 0.2, [a, g]); own(b, end + 0.2, [b]);
  }

  function kick(at, vel) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(105, at);
    o.frequency.exponentialRampToValueAtTime(46, at + 0.1);
    strike(g, at, 0.32 * vel, 0.003, 0.07);
    o.connect(g); g.connect(bus.drums);
    o.start(at);
    own(o, at + 0.4, [o, g]);
  }

  function hiss(target, at, peak, tau, len) {
    if (!noise) return;
    const s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = noise;
    strike(g, at, peak, 0.003, tau);
    s.connect(g); g.connect(target);
    s.start(at, Math.random() * 0.3);
    own(s, at + len, [s, g]);
  }

  function playStep(events, at, sec16, idx) {
    const tr = current.track;
    const accent = idx % current.bar16 === 0 ? 1 : idx % 4 === 0 ? 0.88 : idx % 2 === 0 ? 0.78 : 0.7;
    const t0 = at + (idx % 2 ? (tr.swing || 0) * sec16 : 0);
    for (const e of events) {
      const vel = accent * (0.88 + Math.random() * 0.17);
      const t = t0 + Math.random() * JITTER;
      switch (e.voice) {
        case 'lead': (tr.lead === 'pluck' ? pluck : mallet)(e.midi, t, e.dur * sec16, vel); break;
        case 'pad': pad(e.midis, t, e.dur * sec16, 1); break;
        case 'comp': comp(e.midis, t, vel); break;
        case 'bass': bass(e.midi, t, e.dur * sec16 * 0.85, vel); break;
        case 'k': kick(t0, vel); break;
        case 's': hiss(bus.brush, t, 0.22 * vel, 0.045, 0.25); break;
        case 'h': hiss(bus.shaker, t, 0.08 * vel, 0.018, 0.1); break;
      }
    }
  }

  // Fade the master out and stop everything already scheduled.
  function silenceFuture() {
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const {node} of live) { try { node.stop(now + FADE + 0.01); } catch { /* already stopped */ } }
    live = [];
    if (master) {
      const cur = typeof master.gain.value === 'number' ? master.gain.value : 0;
      master.gain.cancelScheduledValues?.(now);
      setAt(master.gain, cur, now);
      lin(master.gain, 0, now + FADE);
    }
    quietUntil = now + FADE + 0.01;
    active = false;
  }

  function start(arr, tempoFactor = 1, keepPosition = false) {
    if (arr !== current || !keepPosition) { step = 0; ended = false; }
    current = arr;
    tempo = tempoFactor;
    if (!keepPosition) { silenceFuture(); nextTime = 0; }
    if (ctx && bus && bus.delay) tgt(bus.delay.delayTime, Math.min(0.9, 3 * arr.sec16 / tempo), ctx.currentTime, 0.05);
  }

  function guard(fn) {
    return (...args) => {
      if (disabled) return;
      try { return fn(...args); } catch (err) {
        disabled = true;
        try { silenceFuture(); } catch { /* ignore */ }
        if (typeof console !== 'undefined') console.warn('[music] disabled after error:', err);
      }
    };
  }

  const tick = guard(state => {
    const want = !!(state && state.audioUnlocked && state.musicEnabled && state.running && state.musicVolume > 0);
    const ac = want ? (typeof getAudioContext === 'function' ? getAudioContext() : null) : ctx;
    if (!ac) { active = false; return; }
    if (ac !== ctx) { setup(ac); start(current, tempo, true); }
    const now = ctx.currentTime;
    if (!want) {
      if (active) { silenceFuture(); nextTime = 0; }
      return;
    }
    const level = MASTER_LEVEL * Math.min(1, Math.max(0, Number(state.musicVolume) || 0));
    if (!active) {
      const t0 = Math.max(now, quietUntil);
      master.gain.cancelScheduledValues?.(t0);
      setAt(master.gain, 0, t0);
      lin(master.gain, level, t0 + 0.15);
      rampEnd = t0 + 0.15;
      lastLevel = level;
      active = true;
    } else if (level !== lastLevel && now >= rampEnd) {
      tgt(master.gain, level, now, 0.05);
      lastLevel = level;
    }
    if (live.length > 96) live = live.filter(n => n.end > now);
    if (ended) return;
    // (re)sync after start, pause or a throttled background tab: never burst-schedule the backlog
    if (!nextTime || nextTime < now - 0.1) nextTime = Math.max(now + 0.05, quietUntil);
    const sec16 = current.sec16 / tempo;
    while (nextTime < now + LOOKAHEAD) {
      playStep(current.steps[step], nextTime, sec16, step);
      nextTime += sec16;
      step++;
      if (step >= current.length) {
        if (current.track.once) { ended = true; break; }
        step = 0;
      }
    }
  });

  const setMood = guard(m => {
    if (m === mood) return;
    const prevMood = mood;
    mood = m;
    if (m === 'tense') {
      const mk = ARRANGED[MOUNTAIN_KING];
      start(mk, TENSE_TEMPO, current === mk && prevMood === 'battle');
    } else if (m === 'victory') start(ARR_VICTORY);
    else if (m === 'defeat') start(ARR_DEFEAT);
    else { mood = 'battle'; start(ARRANGED[rotation]); }
  });

  const next = guard(() => {
    rotation = (rotation + 1 + Math.floor(Math.random() * (ARRANGED.length - 1))) % ARRANGED.length;
    mood = 'battle';
    start(ARRANGED[rotation]);
  });

  const reset = guard(() => {
    silenceFuture();
    step = 0;
    nextTime = 0;
    ended = false;
    active = false;
  });

  return {
    tick, setMood, next, reset,
    get mood() { return mood; },
    get track() { const t = current.track; return {id: t.id, title: t.title, composer: t.composer, died: t.died}; },
    get disabled() { return disabled; },
  };
}
