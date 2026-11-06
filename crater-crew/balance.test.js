// Balance invariants, measured on real PC Easy vs PC Easy matches with the headless harness (balance-sim.js).
// Small N keeps this file fast; the big runs for the report: node balance-sim.js 40
import test from 'node:test';
import assert from 'node:assert/strict';
import {game,playMatch,summarize} from './balance-sim.js';
import {data} from './engine.js';

const {state,newGame,simulateAction,fire,update,rules}=game;

test('the opening move is a coin toss from the seed, and a round means both teams have moved',()=>{
 let team1=0;
 for(let seed=1;seed<=12;seed++){state.controllers=['easy','easy'];newGame(0,2,seed);team1+=state.team;assert.equal(state.active.team,state.team);assert.equal(state.firstTeam,state.team)
  // The side that moves second starts with the komi.
  for(const w of state.worms)assert.equal(w.hp,w.team===state.team?100:100+rules.secondHp)}
 assert.ok(team1>=3&&team1<=9,`team 1 opens ${team1} of 12 matches`);
 // The setup without controllers (tests, the idle screen) keeps team 0 first.
 delete state.controllers;newGame(0,1,5);assert.equal(state.team,0);
});

test('airstrikes are rationed per team and the AI copes without them',()=>{
 state.controllers=['easy','easy'];newGame(0,2,11);
 assert.equal(state.ammo[0].airstrike,rules.airstrikes);assert.ok(Number.isFinite(rules.airstrikes)&&rules.airstrikes>0);
 state.ammo[state.team].airstrike=0;const before=state.projectiles.length;state.selected='airstrike';state.airTarget=state.worms.find(w=>w.team!==state.team).x;fire();
 assert.equal(state.projectiles.length,before,'no strike without ammo');assert.equal(state.phase,'ready');
 // Matches with every airstrike spent still finish, the AI falling back to aimed shots.
 rules.airstrikes=0;try{const r=playMatch(0,21);assert.ok(r.winner>=0,'match ends');assert.ok(!r.weapons.includes('airstrike'))}finally{rules.airstrikes=2}
});

test('the AI sandbox predicts the real outcome of a knockback blast',()=>{
 for(const seed of [7,19,33]){
  state.controllers=['easy','easy'];newGame(2,2,seed);state.wind=state.windTarget=0;
  const foe=state.worms.find(w=>w.team!==state.team&&w.alive);
  const action={weapon:'airstrike',strikeDir:1,targetX:foe.x-20};
  const predicted=simulateAction(action);
  const hp=state.worms.map(w=>w.hp);
  state.selected='airstrike';state.strikeDir=1;state.airTarget=foe.x-20;state.aiTimer=1e9;fire();
  const team=state.team;for(let i=0;i<900&&state.team===team&&!state.ended;i++)update(1/30);
  const dealt=state.worms.reduce((s,w,i)=>s+(w.team!==team?Math.max(0,hp[i]-(w.alive?w.hp:0)):0),0);
  assert.equal(dealt,predicted.enemyDmg,`seed ${seed}: sandbox ${predicted.summary}`);
  assert.deepEqual(state.worms.filter(w=>!w.alive&&w.team!==team).map(w=>w.name).sort(),predicted.kills.slice().sort());
 }
});

test('balance over real PC Easy matches: no first-mover edge, drowning is not the whole game, no weapon dominates',()=>{
 const results=[];for(const map of [0,1,2,3])for(let i=0;i<3;i++)results.push(playMatch(map,101+i*7919));
 const s=summarize(results);
 assert.equal(s.unfinished,0);
 // A round means both teams have moved.
 for(const r of results)assert.ok(r.rounds<=Math.ceil(r.turns/2)+1,`${r.rounds} rounds for ${r.turns} turns`);
 const shots=Object.entries(s.use).filter(([a])=>a in data&&data[a].damage>0),total=shots.reduce((n,[,c])=>n+c,0);
 console.log('balance',JSON.stringify({firstMoverWin:s.firstMoverWin,drownShare:s.drownShare,earlyKillMatches:s.earlyKillMatches,avgTurns:s.avgTurns,use:s.use}));
 assert.ok(s.firstMoverWin>=.25&&s.firstMoverWin<=.75,`first mover won ${s.firstMoverWin}`);
 assert.ok(s.drownShare<=.6,`drowned ${s.drownShare} of deaths`);
 for(const [a,c] of shots)assert.ok(c/total<=.6,`${a} is ${(100*c/total).toFixed(0)}% of shots`);
});
