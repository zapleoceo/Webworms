import test from 'node:test';
import assert from 'node:assert/strict';
import {teamHealth} from './hud.js';
test('team health fraction counts only living hp per team',()=>{
 const w=[{team:0,alive:true,hp:100},{team:0,alive:false,hp:0},{team:1,alive:true,hp:50},{team:1,alive:true,hp:50}];
 assert.equal(teamHealth(w,0),.5);assert.equal(teamHealth(w,1),.5);assert.equal(teamHealth([],0),0);
});
