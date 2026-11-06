// Crater Crew background music: public-domain classical themes rendered as
// chiptune / cartoon-band arrangements with Web Audio oscillators.
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
const MASTER_LEVEL = 0.065;   // master gain at musicVolume = 1
const TENSE_TEMPO = 1.35;     // tempo multiplier for the 'tense' mood

// --- note data -------------------------------------------------------------
// Melodies are written as "NOTE/dur" tokens, dur in sixteenth notes, "r/dur"
// is a rest; parsed into arrays of [midiOrNull, durationInSixteenths].
// Chords: one symbol per beat (quarter note); "-" repeats the previous one.
// Drums: one char per sixteenth per bar: k kick, s snare, h hat, . nothing.

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
    bpm: 150, beatsPerBar: 2,
    melody: `C5/8
             C5/2 D5/2 F5/2 E5/2   D5/4 G5/4
             G5/2 A5/2 E5/2 F5/2   D5/4 D5/4
             D5/2 F5/2 E5/2 D5/2   C5/2 C6/2 B5/2 A5/2
             G5/2 F5/2 E5/2 D5/2`,
    chords: 'C - C - G - G - G - G - C - G7 -',
    drums: ['k.h.s.h.'],
    style: 'oompah',
  },
  {
    // Gioachino Rossini (d. 1868) - William Tell Overture (1829), finale
    // ("March of the Swiss Soldiers" gallop). Main theme, 8 bars of 2/4, E major.
    id: 'tell', title: 'William Tell Overture (finale)', composer: 'Gioachino Rossini', died: 1868,
    bpm: 152, beatsPerBar: 2,
    melody: `B4/1 B4/1 B4/2 B4/1 B4/1 B4/2   B4/1 B4/1 E5/2 F#5/2 G#5/2
             B4/1 B4/1 B4/2 B4/1 B4/1 B4/2   B4/1 B4/1 F#5/2 D#5/2 B4/2
             B4/1 B4/1 B4/2 B4/1 B4/1 B4/2   B4/1 B4/1 E5/2 F#5/2 G#5/2
             E5/1 E5/1 G#5/2 F#5/2 D#5/2     E5/4 r/4`,
    chords: 'E - E - E - B - E - E - B7 - E B',
    drums: ['k.hhs.hh'],
    style: 'oompah',
  },
  {
    // Wolfgang Amadeus Mozart (d. 1791) - Piano Sonata No. 11, K. 331,
    // 3rd mvt "Rondo alla Turca" (1783). Opening theme, 16 bars of 2/4, A minor
    // (the 16th-note upbeat B-A-G#-A sits at the end of bars 8 and 16).
    id: 'turca', title: 'Rondo alla Turca', composer: 'Wolfgang Amadeus Mozart', died: 1791,
    bpm: 126, beatsPerBar: 2,
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
    style: 'oompah',
  },
  {
    // Edvard Grieg (d. 1907) - "In the Hall of the Mountain King" from
    // Peer Gynt (1875). Main theme, 8 bars of 4/4: B minor, then the answer
    // on F#. Also used as the 'tense' (sudden death / low timer) track.
    id: 'mountainking', title: 'In the Hall of the Mountain King', composer: 'Edvard Grieg', died: 1907,
    bpm: 116, beatsPerBar: 4,
    melody: `B4/2 C#5/2 D5/2 E5/2 F#5/2 D5/2 F#5/4
             F5/2 C#5/2 F5/4 E5/2 C5/2 E5/4
             B4/2 C#5/2 D5/2 E5/2 F#5/2 D5/2 F#5/2 B5/2
             A5/2 F#5/2 D5/2 F#5/2 A5/8
             F#5/2 G#5/2 A#5/2 B5/2 C#6/2 A#5/2 C#6/4
             D6/2 A#5/2 D6/4 C#6/2 A#5/2 C#6/4
             F#5/2 G#5/2 A#5/2 B5/2 C#6/2 A#5/2 C#6/4
             C#6/2 A#5/2 F#5/2 A#5/2 C#6/8`,
    chords: 'B - B - C# - C - B - B - D - D - F# - F# - G - F# - F# - F# - F# - F# -',
    drums: ['k...h...k...h...'],
    style: 'pizzicato',
  },
];

// Short mood phrases (original, simple arpeggios - not taken from any work).
const VICTORY = {
  id: 'victory', title: 'Victory fanfare', composer: 'original', died: null,
  bpm: 132, beatsPerBar: 4, once: true,
  melody: 'C5/2 E5/2 G5/2 C6/6 G5/2 C6/2   E6/12 r/4',
  chords: 'C - - - C - - -', drums: ['k...s...k.s.k...', 'k...............'], style: 'pizzicato',
};
const DEFEAT = {
  id: 'defeat', title: 'Defeat sting', composer: 'original', died: null,
  bpm: 96, beatsPerBar: 4, once: true,
  melody: 'G4/4 F#4/4 F4/4 E4/12 r/8',
  chords: 'C B Bb A - - - -', drums: ['................', '................'], style: 'pizzicato',
};

// --- arrangement: turn a track into per-sixteenth event buckets -------------

const CHORD_SHAPES = {'': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], dim: [0, 3, 6]};

function parseChord(sym) {
  const m = /^([A-G])(#|b)?(m|7|dim)?$/.exec(sym);
  if (!m) throw new Error('bad chord ' + sym);
  const root = (NOTE_INDEX[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  return {root, shape: CHORD_SHAPES[m[3] || '']};
}

export function arrange(track) {
  const melody = parseMelody(track.melody);
  const bar16 = track.beatsPerBar * 4;
  let total = melody.reduce((s, [, d]) => s + d, 0);
  const length = Math.ceil(total / bar16) * bar16;
  const steps = Array.from({length}, () => []);
  let t = 0;
  for (const [midi, dur] of melody) {
    if (midi !== null) steps[t].push({voice: 'lead', midi, dur});
    t += dur;
  }
  // chords per beat
  const syms = track.chords.trim().split(/\s+/);
  const beats = length / 4;
  let prev = null;
  for (let b = 0; b < beats; b++) {
    const sym = syms[b] ?? '-';
    const chord = sym === '-' ? prev : parseChord(sym);
    if (!chord) continue;
    const newChord = chord !== prev;
    prev = chord;
    const at = b * 4;
    const beatInBar = b % track.beatsPerBar;
    // bass: root on strong beats / new chords, fifth below on weak beats
    const rootBass = 40 + ((chord.root + 12 - 4) % 12); // E2..D#3 range
    const bass = beatInBar % 2 === 0 || newChord ? rootBass : rootBass - 5;
    steps[at].push({voice: 'bass', midi: bass, dur: track.style === 'pizzicato' ? 2 : 3});
    if (track.style === 'oompah') {
      // "pah" stab on the off-eighth: triad voiced around middle C
      for (const iv of chord.shape) {
        const midi = 60 + ((chord.root + iv) % 12);
        steps[at + 2].push({voice: 'stab', midi: midi > 67 ? midi - 12 : midi, dur: 1});
      }
    }
  }
  // drums
  const bars = length / bar16;
  for (let bar = 0; bar < bars; bar++) {
    const p = track.drums[Math.min(bar, track.drums.length - 1)] ?? '';
    for (let i = 0; i < bar16; i++) {
      const c = p[i % p.length];
      if (c === 'k' || c === 's' || c === 'h') steps[bar * bar16 + i].push({voice: c});
    }
  }
  return {track, length, steps, sec16: 60 / track.bpm / 4};
}

const ARRANGED = TRACKS.map(arrange);
const ARR_VICTORY = arrange(VICTORY);
const ARR_DEFEAT = arrange(DEFEAT);
const MOUNTAIN_KING = ARRANGED.findIndex(a => a.track.id === 'mountainking');

const mtof = m => 440 * 2 ** ((m - 69) / 12);

// --- player ------------------------------------------------------------------

// Older or minimal Web Audio implementations may lack ramps; fall back to an immediate set.
const lin=(p,v,t)=>p.linearRampToValueAtTime?p.linearRampToValueAtTime(v,t):p.setValueAtTime(v,t);
const tgt=(p,v,t,k)=>p.setTargetAtTime?p.setTargetAtTime(v,t,k):p.setValueAtTime(v,t);
export function createMusic(getAudioContext) {
  let ctx = null, master = null, noise = null;
  let rotation = 0;
  let mood = 'battle';
  let current = ARRANGED[0];
  let tempo = 1;
  let step = 0;
  let nextTime = 0;
  let ended = false;
  let active = false;
  let disabled = false;
  let live = [];             // scheduled nodes still to finish: {node, end}

  function setup(ac) {
    ctx = ac;
    master = ac.createGain();
    master.gain.value = 0;
    let out = master;
    if (typeof ac.createBiquadFilter === 'function') {
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3200;
      master.connect(lp);
      out = lp;
    }
    out.connect(ac.destination);
    noise = null;
    if (typeof ac.createBuffer === 'function' && typeof ac.createBufferSource === 'function') {
      const sr = ac.sampleRate || 44100;
      noise = ac.createBuffer(1, Math.floor(sr * 0.25), sr);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    live = [];
  }

  function track(node, end) { live.push({node, end}); }

  function silenceFuture() {
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const {node} of live) { try { node.stop(now); } catch { /* already stopped */ } }
    live = [];
    if (master) {
      master.gain.cancelScheduledValues?.(now);
      master.gain.setValueAtTime(0, now);
    }
  }

  function tone(type, freq, at, dur, level, attack = 0.006) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    g.gain.setValueAtTime(0, at);
    lin(g.gain,level, at + attack);
    g.gain.setValueAtTime(level * 0.75, at + Math.max(attack, dur * 0.4));
    lin(g.gain,0, at + dur);
    o.connect(g);
    g.connect(master);
    o.start(at);
    o.stop(at + dur + 0.02);
    track(o, at + dur + 0.02);
  }

  function kick(at) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(130, at);
    o.frequency.exponentialRampToValueAtTime(45, at + 0.11);
    g.gain.setValueAtTime(0.9, at);
    lin(g.gain,0, at + 0.14);
    o.connect(g);
    g.connect(master);
    o.start(at);
    o.stop(at + 0.16);
    track(o, at + 0.16);
  }

  function hiss(at, dur, cutoff, level) {
    if (!noise) return;
    const s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = noise;
    let node = s;
    if (typeof ctx.createBiquadFilter === 'function') {
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = cutoff;
      s.connect(f);
      node = f;
    }
    g.gain.setValueAtTime(level, at);
    lin(g.gain,0, at + dur);
    node.connect(g);
    g.connect(master);
    s.start(at);
    s.stop(at + dur + 0.01);
    track(s, at + dur + 0.01);
  }

  function playStep(events, at, sec16) {
    for (const e of events) {
      switch (e.voice) {
        case 'lead': tone('square', mtof(e.midi), at, Math.max(0.06, e.dur * sec16 * 0.88), 0.32); break;
        case 'bass': tone('triangle', mtof(e.midi), at, e.dur * sec16 * 0.9, 0.75); break;
        case 'stab': tone('sawtooth', mtof(e.midi), at, Math.min(0.09, sec16 * 0.9), 0.07, 0.004); break;
        case 'k': kick(at); break;
        case 's': hiss(at, 0.09, 1800, 0.28); break;
        case 'h': hiss(at, 0.025, 7000, 0.12); break;
      }
    }
  }

  function start(arr, tempoFactor = 1, keepPosition = false) {
    if (arr !== current || !keepPosition) { step = 0; ended = false; }
    current = arr;
    tempo = tempoFactor;
    if (!keepPosition) { silenceFuture(); nextTime = 0; }
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
    if (ac !== ctx) setup(ac);
    const now = ctx.currentTime;
    if (!want) {
      if (active) { silenceFuture(); nextTime = 0; active = false; }
      return;
    }
    const level = MASTER_LEVEL * Math.min(1, Math.max(0, Number(state.musicVolume) || 0));
    if (!active) {
      master.gain.cancelScheduledValues?.(now);
      master.gain.setValueAtTime(0, now);
      lin(master.gain,level, now + 0.15);
      active = true;
    } else {
      tgt(master.gain,level, now, 0.05);
    }
    if (live.length > 64) live = live.filter(n => n.end > now);
    if (ended) return;
    // (re)sync after start, pause or a throttled background tab: never burst-schedule the backlog
    if (!nextTime || nextTime < now - 0.1) nextTime = now + 0.05;
    const sec16 = current.sec16 / tempo;
    while (nextTime < now + LOOKAHEAD) {
      playStep(current.steps[step], nextTime, sec16);
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
    rotation = (rotation + 1) % ARRANGED.length;
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
