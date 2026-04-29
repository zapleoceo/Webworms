import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const inputPath = new URL('../allsrites.png', import.meta.url);
const outDir = new URL('../public/sprites/allsprites/', import.meta.url);

const sprites = [
  { name: 'bazooka_icon', x: 0, y: 1386, w: 146, h: 154 },
  { name: 'bazooka_weapon', x: 146, y: 1386, w: 146, h: 154 },
  { name: 'bazooka_projectile', x: 292, y: 1386, w: 146, h: 154 },
  { name: 'bazooka_flash', x: 438, y: 1386, w: 146, h: 154 },
  { name: 'bazooka_trail', x: 584, y: 1386, w: 146, h: 154 },
  { name: 'bazooka_hit', x: 730, y: 1386, w: 146, h: 154 },
  { name: 'bazooka_explosion', x: 876, y: 1386, w: 146, h: 154 },

  { name: 'triple_icon', x: 0, y: 1232, w: 146, h: 154 },
  { name: 'triple_weapon', x: 146, y: 1232, w: 146, h: 154 },
  { name: 'triple_bullets', x: 292, y: 1232, w: 146, h: 154 },
  { name: 'triple_flash', x: 438, y: 1232, w: 146, h: 154 },
  { name: 'triple_trail', x: 584, y: 1232, w: 146, h: 154 },
  { name: 'triple_hit', x: 730, y: 1232, w: 146, h: 154 },
  { name: 'triple_explosion', x: 876, y: 1232, w: 146, h: 154 },

  { name: 'rocket_icon', x: 0, y: 1078, w: 146, h: 154 },
  { name: 'rocket_weapon', x: 146, y: 1078, w: 146, h: 154 },
  { name: 'rocket_projectile', x: 292, y: 1078, w: 146, h: 154 },
  { name: 'rocket_flash', x: 438, y: 1078, w: 146, h: 154 },
  { name: 'rocket_trail', x: 584, y: 1078, w: 146, h: 154 },
  { name: 'rocket_hit', x: 730, y: 1078, w: 146, h: 154 },
  { name: 'rocket_explosion', x: 876, y: 1078, w: 146, h: 154 },

  { name: 'minigun_icon', x: 0, y: 924, w: 146, h: 154 },
  { name: 'minigun_weapon', x: 146, y: 924, w: 146, h: 154 },
  { name: 'minigun_bullet', x: 292, y: 924, w: 146, h: 154 },
  { name: 'minigun_flash', x: 438, y: 924, w: 146, h: 154 },
  { name: 'minigun_stream', x: 584, y: 924, w: 146, h: 154 },
  { name: 'minigun_hit', x: 730, y: 924, w: 146, h: 154 },
  { name: 'minigun_explosion', x: 876, y: 924, w: 146, h: 154 },

  { name: 'grenade_icon', x: 0, y: 770, w: 146, h: 154 },
  { name: 'grenade_idle', x: 146, y: 770, w: 146, h: 154 },
  { name: 'grenade_flying', x: 292, y: 770, w: 146, h: 154 },
  { name: 'grenade_trigger', x: 438, y: 770, w: 146, h: 154 },
  { name: 'grenade_smoke', x: 584, y: 770, w: 146, h: 154 },
  { name: 'grenade_hit', x: 730, y: 770, w: 146, h: 154 },
  { name: 'grenade_explosion', x: 876, y: 770, w: 146, h: 154 },

  { name: 'blaster_icon', x: 0, y: 616, w: 146, h: 154 },
  { name: 'blaster_weapon', x: 146, y: 616, w: 146, h: 154 },
  { name: 'blaster_projectile', x: 292, y: 616, w: 146, h: 154 },
  { name: 'blaster_flash', x: 438, y: 616, w: 146, h: 154 },
  { name: 'blaster_trail', x: 584, y: 616, w: 146, h: 154 },
  { name: 'blaster_hit', x: 730, y: 616, w: 146, h: 154 },
  { name: 'blaster_explosion', x: 876, y: 616, w: 146, h: 154 },

  { name: 'rope_icon', x: 0, y: 462, w: 146, h: 154 },
  { name: 'rope_device', x: 146, y: 462, w: 146, h: 154 },
  { name: 'rope_hook', x: 292, y: 462, w: 146, h: 154 },
  { name: 'rope_line', x: 438, y: 462, w: 146, h: 154 },
  { name: 'rope_coil', x: 584, y: 462, w: 146, h: 154 },
  { name: 'rope_attach', x: 730, y: 462, w: 146, h: 154 },
  { name: 'rope_impact', x: 876, y: 462, w: 146, h: 154 }
];

function getPixel(png, x, y) {
  const idx = (png.width * y + x) << 2;
  return [png.data[idx], png.data[idx + 1], png.data[idx + 2], png.data[idx + 3]];
}

function setPixel(png, x, y, r, g, b, a) {
  const idx = (png.width * y + x) << 2;
  png.data[idx] = r;
  png.data[idx + 1] = g;
  png.data[idx + 2] = b;
  png.data[idx + 3] = a;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function bilerp(c00, c10, c01, c11, u, v) {
  const top = [
    lerp(c00[0], c10[0], u),
    lerp(c00[1], c10[1], u),
    lerp(c00[2], c10[2], u)
  ];
  const bot = [
    lerp(c01[0], c11[0], u),
    lerp(c01[1], c11[1], u),
    lerp(c01[2], c11[2], u)
  ];
  return [
    lerp(top[0], bot[0], v),
    lerp(top[1], bot[1], v),
    lerp(top[2], bot[2], v)
  ];
}

function removeBackground(out) {
  const w = out.width;
  const h = out.height;
  const c00 = getPixel(out, 0, 0);
  const c10 = getPixel(out, w - 1, 0);
  const c01 = getPixel(out, 0, h - 1);
  const c11 = getPixel(out, w - 1, h - 1);

  const t0 = 28;
  const t1 = 70;

  for (let y = 0; y < h; y++) {
    const v = h <= 1 ? 0 : y / (h - 1);
    for (let x = 0; x < w; x++) {
      const u = w <= 1 ? 0 : x / (w - 1);
      const [r, g, b, a] = getPixel(out, x, y);
      const [br, bg, bb] = bilerp(c00, c10, c01, c11, u, v);
      const d = Math.abs(r - br) + Math.abs(g - bg) + Math.abs(b - bb);
      if (d <= t0) {
        setPixel(out, x, y, r, g, b, 0);
      } else if (d < t1) {
        const k = (d - t0) / (t1 - t0);
        setPixel(out, x, y, r, g, b, Math.round(a * k));
      }
    }
  }
}

async function main() {
  const buf = fs.readFileSync(inputPath);
  const atlas = PNG.sync.read(buf);

  fs.mkdirSync(outDir, { recursive: true });
  const refH = Math.max(atlas.height, ...sprites.map(s => s.y + s.h));

  for (const s of sprites) {
    const srcY = refH - s.y - s.h;
    const out = new PNG({ width: s.w, height: s.h });
    PNG.bitblt(atlas, out, s.x, srcY, s.w, s.h, 0, 0);
    removeBackground(out);
    const outPath = new URL(`./${s.name}.png`, outDir);
    fs.writeFileSync(outPath, PNG.sync.write(out));
  }

  const manifest = sprites.reduce((acc, s) => {
    acc[s.name] = `/sprites/allsprites/${s.name}.png`;
    return acc;
  }, {});
  fs.writeFileSync(new URL('./manifest.json', outDir), JSON.stringify(manifest, null, 2));
}

main();
