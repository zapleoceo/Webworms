import test from 'node:test';
import assert from 'node:assert/strict';
import {createMusic, arrange, TRACKS, noteToMidi, parseChord, voicing} from './music.js';

const LOOKAHEAD = 0.2;
const SLACK = 0.03; // swing + humanised jitter on top of the lookahead

// Full-featured mock: records every scheduled source, its start/stop time and type.
function makeContext({minimal = false} = {}) {
  const log = {sources: [], connections: 0, disconnects: 0, violations: [], buffers: 0};
  const param = v => ({value: v, setValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime() {},
    exponentialRampToValueAtTime() {}, cancelScheduledValues() {}});
  const ctx = {currentTime: 0, sampleRate: 8000};
  class Node {
    connect(d) { log.connections++; return d; }
    disconnect() { log.disconnects++; }
  }
  class Source extends Node {
    constructor(kind) { super(); this.kind = kind; this.frequency = param(0); this.rec = null; }
    start(at = 0) {
      if (at < ctx.currentTime - 1e-9 || at > ctx.currentTime + LOOKAHEAD + SLACK) log.violations.push({at, now: ctx.currentTime});
      const freq = this.frequency.first ?? 0;
      this.rec = {kind: this.kind, type: this.type, freq, start: at, stop: Infinity, node: this};
      log.sources.push(this.rec);
    }
    stop(at) { if (this.rec) this.rec.stop = Math.min(this.rec.stop, at); }
  }
  ctx.destination = new Node();
  ctx.createGain = () => Object.assign(new Node(), {gain: param(1)});
  ctx.createOscillator = () => {
    const o = new Source('osc');
    o.frequency.setValueAtTime = v => { o.frequency.first ??= v; };
    return o;
  };
  ctx.createBufferSource = () => new Source('noise');
  ctx.createBuffer = (ch, frames) => { log.buffers++; return {getChannelData: () => new Float32Array(frames)}; };
  ctx.createBiquadFilter = () => Object.assign(new Node(), {frequency: param(350), Q: param(1)});
  if (!minimal) {
    ctx.createDynamicsCompressor = () => Object.assign(new Node(), {threshold: param(0), knee: param(0), ratio: param(1), attack: param(0), release: param(0)});
    ctx.createConvolver = () => new Node();
    ctx.createDelay = () => Object.assign(new Node(), {delayTime: param(0)});
    ctx.createStereoPanner = () => Object.assign(new Node(), {pan: param(0)});
  }
  return {ctx, log};
}

const playing = {audioUnlocked: true, musicEnabled: true, running: true, musicVolume: 1};

function pick(player, id) {
  for (let i = 0; i < 200 && player.track.id !== id; i++) player.next();
  assert.equal(player.track.id, id);
}

// Run the player at 60 fps for `seconds`, firing onended like a real context.
function run(player, ctx, log, seconds, state = playing) {
  const end = ctx.currentTime + seconds;
  let maxLive = 0;
  while (ctx.currentTime < end) {
    ctx.currentTime += 1 / 60;
    player.tick(state);
    let liveNow = 0;
    for (const s of log.sources) {
      if (s.stop <= ctx.currentTime && !s.ended) { s.ended = true; s.node.onended?.(); }
      if (s.start <= ctx.currentTime && s.stop > ctx.currentTime) liveNow++;
    }
    maxLive = Math.max(maxLive, liveNow);
  }
  return maxLive;
}

function category(s) {
  if (s.kind === 'noise') return 'brush/shaker';
  if (s.type === 'sawtooth') return s.stop - s.start < 1 ? 'pluck' : 'pad';
  if (s.freq < 200) return 'bass/kick';
  return s.type === 'triangle' ? 'comp+mallet partner' : 'mallet';
}

test('melodies stay the public-domain tunes and every chord parses', () => {
  const first = Object.fromEntries(TRACKS.map(t => {
    const a = arrange(t);
    const lead = a.steps.flat().filter(e => e.voice === 'lead').slice(0, 5).map(e => e.midi - (t.leadShift || 0));
    assert.equal(a.length % a.bar16, 0, t.id + ' whole bars');
    return [t.id, lead];
  }));
  assert.deepEqual(first.cancan, ['C5', 'C5', 'D5', 'F5', 'E5'].map(noteToMidi));
  assert.deepEqual(first.tell, ['B4', 'B4', 'B4', 'B4', 'B4'].map(noteToMidi));
  assert.deepEqual(first.turca, ['C5', 'D5', 'C5', 'B4', 'C5'].map(noteToMidi));
  assert.deepEqual(first.mountainking, ['B4', 'C#5', 'D5', 'E5', 'F#5'].map(noteToMidi));
  for (const sym of ['C6', 'G7', 'Am', 'Bm', 'A#', 'Dm', 'E6', 'B7']) {
    const v = voicing(parseChord(sym), 55);
    assert.ok(v.every(m => m >= 55 && m < 67), sym + ' voiced in the middle register');
  }
});

test('every track has harmony, walking bass and soft drums', () => {
  for (const t of TRACKS) {
    const ev = arrange(t).steps.flat();
    const n = v => ev.filter(e => e.voice === v).length;
    assert.ok(n('pad') >= 4, t.id + ' pad chords');
    assert.ok(n('bass') >= 16, t.id + ' bass');
    assert.ok(n('k') > 0 && n('s') > 0, t.id + ' drums');
    assert.ok(new Set(ev.filter(e => e.voice === 'bass').map(e => e.midi)).size >= 4, t.id + ' bass moves');
  }
});

test('20 s per track: bounded scheduling inside the lookahead window, nodes cleaned up', () => {
  const report = {};
  for (const t of TRACKS) {
    const {ctx, log} = makeContext();
    const player = createMusic(() => ctx);
    pick(player, t.id);
    const maxLive = run(player, ctx, log, 20);
    assert.equal(player.disabled, false, t.id + ' not disabled');
    assert.deepEqual(log.violations, [], t.id + ' nothing outside the lookahead window');
    assert.ok(log.sources.every(s => Number.isFinite(s.stop)), t.id + ' every source has a stop time');
    assert.ok(log.sources.every(s => s.start <= 20 + LOOKAHEAD + SLACK), t.id + ' no runaway scheduling');
    const counts = {};
    for (const s of log.sources) counts[category(s)] = (counts[category(s)] || 0) + 1;
    // expected lead notes from the arrangement: notes per loop * loops in 20 s
    const a = arrange(t), loopSec = a.length * a.sec16;
    const leadPerLoop = a.steps.flat().filter(e => e.voice === 'lead').length;
    const expectedLead = leadPerLoop * (20 - 0.05) / loopSec;
    const leadSources = t.lead === 'pluck' ? (counts.pluck || 0) / 2 : (counts.mallet || 0) / 2;
    assert.ok(Math.abs(leadSources - expectedLead) <= leadPerLoop * 0.15 + 3, `${t.id} lead notes ${leadSources} ~ ${expectedLead.toFixed(1)}`);
    assert.ok(maxLive < 160, `${t.id} concurrent sources ${maxLive}`);
    const endedSources = log.sources.filter(s => s.ended).length;
    assert.ok(log.disconnects >= endedSources, t.id + ' ended chains are disconnected');
    assert.equal(log.buffers, 2, t.id + ' noise + reverb impulse made once');
    report[t.id] = {sources: log.sources.length, maxLive, ...counts};
  }
  console.log('[music] 20 s per track:', JSON.stringify(report));
});

test('a stalled tab does not burst-schedule the backlog; mood switches stay in the window', () => {
  const {ctx, log} = makeContext();
  const player = createMusic(() => ctx);
  run(player, ctx, log, 2);
  const before = log.sources.length;
  ctx.currentTime += 5;
  player.tick(playing);
  assert.deepEqual(log.violations, []);
  assert.ok(log.sources.length - before < 40, 'only one lookahead window after a 5 s stall');
  player.setMood('tense');
  run(player, ctx, log, 3);
  assert.equal(player.track.id, 'mountainking');
  player.setMood('victory');
  run(player, ctx, log, 6);
  const afterStinger = log.sources.length;
  run(player, ctx, log, 3);
  assert.equal(log.sources.length, afterStinger, 'stinger plays once and stops');
  player.setMood('battle');
  run(player, ctx, log, 1);
  assert.ok(log.sources.length > afterStinger, 'battle music resumes');
  assert.deepEqual(log.violations, []);
  assert.equal(player.disabled, false);
});

test('music off or volume 0 schedules nothing', () => {
  const {ctx, log} = makeContext();
  const player = createMusic(() => ctx);
  run(player, ctx, log, 1, {...playing, musicEnabled: false});
  run(player, ctx, log, 1, {...playing, musicVolume: 0});
  assert.equal(log.sources.length, 0);
});

test('a minimal Web Audio implementation (no convolver/compressor/delay/panner) still plays', () => {
  const {ctx, log} = makeContext({minimal: true});
  const player = createMusic(() => ctx);
  run(player, ctx, log, 3);
  assert.equal(player.disabled, false);
  assert.ok(log.sources.length > 20);
});

test('without an AudioContext every call is a silent no-op', () => {
  for (const get of [() => null, undefined, () => undefined]) {
    const player = createMusic(get);
    assert.doesNotThrow(() => {
      player.tick(playing); player.setMood('tense'); player.setMood('victory'); player.next(); player.reset(); player.tick(null);
    });
    assert.equal(player.disabled, false);
    assert.ok(player.track.id);
  }
});

test('an audio error disables music instead of throwing every frame', () => {
  const {ctx} = makeContext();
  ctx.createOscillator = () => { throw new Error('boom'); };
  const player = createMusic(() => ctx);
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.doesNotThrow(() => { ctx.currentTime = 0.1; player.tick(playing); player.tick(playing); });
  } finally { console.warn = warn; }
  assert.equal(player.disabled, true);
});
