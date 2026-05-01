import fs from 'node:fs';

const files = process.argv.slice(2);
if (files.length === 0) {
  process.exit(1);
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function buildSamples(events) {
  const samples = [];
  for (const e of events) {
    if (e && typeof e === 'object' && e.type === 'physics_sample') {
      samples.push(e);
    }
  }
  samples.sort((a, b) => (Number(a.t) || 0) - (Number(b.t) || 0));
  const ts = samples.map((s) => Number(s.t) || 0);
  return { samples, ts };
}

function sampleIndexAt(ts, t) {
  let lo = 0;
  let hi = ts.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ts[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return Math.max(0, Math.min(ts.length - 1, lo));
}

function hpMap(sample) {
  const out = new Map();
  const worms = Array.isArray(sample?.worms) ? sample.worms : [];
  for (const row of worms) {
    if (!Array.isArray(row) || row.length < 7) continue;
    const team = row[0];
    const hp = Number(row[5]) || 0;
    const idx = Number(row[6]) || 0;
    out.set(`${team}:${idx}`, hp);
  }
  return out;
}

const agg = new Map();

for (const p of files) {
  const log = readJson(p);
  const events = Array.isArray(log?.events) ? log.events : [];
  const { samples, ts } = buildSamples(events);

  for (const e of events) {
    if (!e || typeof e !== 'object') continue;
    if (e.type !== 'bot_decision') continue;
    if (e.stage !== 'execute_fire' && e.stage !== 'reserve_fire' && e.stage !== 'dig_fire') continue;
    const t = Number(e.t) || 0;
    const team = e.team;
    const dbg = e.debug && typeof e.debug === 'object' ? e.debug : null;
    const trace = dbg?.trace && typeof dbg.trace === 'object' ? dbg.trace : null;
    const chosen = trace?.chosen && typeof trace.chosen === 'object' ? trace.chosen : null;
    const weaponId = chosen?.weaponId || null;
    if (!weaponId) continue;

    const expected = Number(chosen.expectedDamage ?? chosen.expectedEnemyDamage ?? 0) || 0;

    let allyD = 0;
    let enemyD = 0;
    if (samples.length > 0) {
      const i0 = sampleIndexAt(ts, t);
      const i1 = sampleIndexAt(ts, t + 8);
      const pre = hpMap(samples[i0]);
      const post = hpMap(samples[i1]);
      for (const [k, hp0] of pre.entries()) {
        const hp1 = post.has(k) ? post.get(k) : hp0;
        const d = (hp0 ?? 0) - (hp1 ?? 0);
        if (d <= 0.1) continue;
        const kTeam = k.split(':')[0];
        if (kTeam === team) allyD += d;
        else enemyD += d;
      }
    }

    const cur = agg.get(weaponId) || { weaponId, n: 0, expectedSum: 0, enemySum: 0, allySum: 0, byStage: {} };
    cur.n += 1;
    cur.expectedSum += expected;
    cur.enemySum += enemyD;
    cur.allySum += allyD;
    cur.byStage[e.stage] = (cur.byStage[e.stage] || 0) + 1;
    agg.set(weaponId, cur);
  }
}

const out = Array.from(agg.values())
  .map((x) => ({
    weaponId: x.weaponId,
    shots: x.n,
    expectedAvg: x.n ? x.expectedSum / x.n : 0,
    realEnemyAvg: x.n ? x.enemySum / x.n : 0,
    realAllyAvg: x.n ? x.allySum / x.n : 0,
    byStage: x.byStage
  }))
  .sort((a, b) => b.shots - a.shots);

process.stdout.write(JSON.stringify(out, null, 2));

