import test from 'node:test';
import assert from 'node:assert/strict';
import {bakeSoil,hexRgb} from './terrain-art.js';
const pal={outline:'#2a1a1a',rock:['#887766','#bbaa99'],bone:'#eee5cc',root:['#5b3b25'],spark:['#ff8a2b']};
test('soil bake is deterministic per seed and embeds features',()=>{
 const a=bakeSoil(0,5,320,200,pal),b=bakeSoil(0,5,320,200,pal),c=bakeSoil(0,6,320,200,pal);
 assert.deepEqual(a.over,b.over);assert.notDeepEqual(a.over,c.over);
 assert.ok(a.over.some(v=>v!==0));assert.equal(a.shade.length,320*200);assert.ok(a.shade.some(v=>v>0));
 assert.deepEqual(hexRgb('#102030'),[16,32,48]);
});
