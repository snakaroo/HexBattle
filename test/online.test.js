const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {DatabaseSync} = require('node:sqlite');
const {createGame,encodeState,decodeState,project} = require('../engine');
const {createServer} = require('../server');

function fixture(t,options={}){
  const dir=fs.mkdtempSync(path.join(fs.existsSync('/tmp/opencode')?'/tmp/opencode':os.tmpdir(),'hex-test-'));
  const database=path.join(dir,'matches.sqlite');
  let server=createServer({database,...options});
  const listen=()=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(`http://127.0.0.1:${server.address().port}`)));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true})});
  return {database,listen,restart:async()=>{await new Promise(resolve=>server.close(resolve));server=createServer({database,...options});return listen()}};
}
async function request(base,route,token,body){
  const response=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{...(token?{Authorization:`Bearer ${token}`} :{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:response.status,data:await response.json()};
}
async function connect(base,id,token){
  const controller=new AbortController();
  const response=await fetch(`${base}/api/matches/${id}/events`,{headers:{Authorization:`Bearer ${token}`},signal:controller.signal});
  assert.equal(response.status,200);
  return controller;
}

test('shared rules retain turn, action and move behavior',()=>{
  const game=createGame();assert.equal(game.state.active,0);
  for(const player of game.state.players){assert.equal(player.hand.length,7);assert.equal(player.deck.length,26);assert.equal(player.hand[0],'knight');assert.equal(player.hand[1],'archer')}
  game.selectCard(0);game.selectHex(0,0);
  assert.equal(game.state.units.length,1);assert.equal(game.state.actions,1);
  game.selectCard(-1);assert.equal(game.state.selected,null);
  game.endTurn();assert.equal(game.state.active,1);assert.equal(game.state.players[1].hand.length,7);
  const restored=createGame();restored.loadState(encodeState(game.state));
  assert.equal(restored.state.cells.size,42);assert.equal(restored.state.active,1);
});

test('projections hide hands, decks, items, secret logs and placement eligibility',()=>{
  const game=createGame(),state=game.state;
  state.cells.get('2,2').item={type:'fence',hp:2,owner:0,discoveredBy:[]};
  state.log.unshift({message:'Secret fence',secretOwner:0});
  state.pendingPlacement={type:'potion',roll:2,tiles:[state.cells.get('3,2')]};
  const ember=project(state,1),azure=project(state,0);
  assert.equal(ember.players[0].hand.length,0);assert.equal(ember.players[0].deck.length,0);
  assert.equal(ember.cells.find(([key])=>key==='2,2')[1].item,null);
  assert.equal(ember.log.some(line=>line.message==='Secret fence'),false);
  assert.equal(ember.pendingPlacement,null);
  assert.equal(azure.cells.find(([key])=>key==='2,2')[1].item.type,'fence');
  assert.equal(decodeState(azure).cells.size,42);
});

test('private joining, turn authorization, pausing, reconnect and persistent state',async t=>{
  const f=fixture(t);let base=await f.listen();
  const created=await request(base,'/api/matches',null,{width:8,height:5,actions:2});
  assert.equal(created.status,201);
  const {id,token:hostToken,invite}=created.data,invitation=new URL(invite,base);
  assert.equal((await request(base,`/api/invitations/${id}?invite=${invitation.searchParams.get('invite')}`)).data.actions,2);
  assert.equal((await request(base,`/api/matches/${id}`,'bad')).status,403);
  const joined=await request(base,`/api/matches/${id}/join`,null,{invite:invitation.searchParams.get('invite')});
  assert.equal(joined.status,201);
  assert.equal((await request(base,`/api/matches/${id}`,hostToken)).data.state.players[0].hand.length,7);
  assert.equal((await request(base,`/api/matches/${id}`,joined.data.token)).data.state.players[1].hand.length,7);
  assert.equal((await request(base,`/api/matches/${id}/join`,null,{invite:invitation.searchParams.get('invite')})).status,403);
  const guestToken=joined.data.token;
  assert.equal((await request(base,`/api/matches/${id}/moves`,hostToken,{type:'selectCard',index:0})).status,409);
  const host=await connect(base,id,hostToken),guest=await connect(base,id,guestToken);
  t.after(()=>{host.abort();guest.abort()});
  assert.equal((await request(base,`/api/matches/${id}/moves`,guestToken,{type:'endTurn'})).status,409);
  assert.equal((await request(base,`/api/matches/${id}/moves`,hostToken,{type:'selectCard',index:0})).status,200);
  assert.equal((await request(base,`/api/matches/${id}/moves`,hostToken,{type:'selectHex',q:0,r:0})).status,200);
  assert.equal((await request(base,`/api/matches/${id}`,guestToken)).data.state.players[0].hand.length,0);
  host.abort();
  // A server restart forgets connections, but keeps the game and each seat token.
  guest.abort();base=await f.restart();
  const restored=await request(base,`/api/matches/${id}`,hostToken);
  assert.equal(restored.data.state.units.length,1);
  assert.equal(restored.data.state.actions,1);
});

test('inactive matches expire and anonymous creation is capped',async t=>{
  let clock=1000;const f=fixture(t,{now:()=>clock,rate:1}),base=await f.listen();
  const first=await request(base,'/api/matches',null,{width:8,height:5,actions:2});
  assert.equal(first.status,201);
  assert.equal((await request(base,'/api/matches',null,{width:8,height:5,actions:2})).status,429);
  clock+=86400001;
  assert.equal((await request(base,`/api/matches/${first.data.id}`,first.data.token)).status,404);
});

test('finished result remains for the other viewer but cannot be reopened after closing',async t=>{
  const f=fixture(t),base=await f.listen();
  const created=(await request(base,'/api/matches',null,{width:8,height:5,actions:2})).data;
  const invite=new URL(created.invite,base).searchParams.get('invite');
  const guest=(await request(base,`/api/matches/${created.id}/join`,null,{invite})).data;
  const db=new DatabaseSync(f.database);
  const row=db.prepare('SELECT state FROM matches WHERE id=?').get(created.id);
  const state=JSON.parse(row.state);state.winner=0;
  db.prepare('UPDATE matches SET state=?,status=? WHERE id=?').run(JSON.stringify(state),'finished',created.id);
  db.close();
  const viewer=await connect(base,created.id,guest.token);t.after(()=>viewer.abort());
  assert.equal((await request(base,`/api/matches/${created.id}`,created.token)).data.status,'finished');
  assert.equal((await request(base,`/api/matches/${created.id}/close`,created.token,{})).status,200);
  assert.equal((await request(base,`/api/matches/${created.id}`,created.token)).status,403);
  assert.equal((await request(base,`/api/matches/${created.id}`,guest.token)).data.state.winner,0);
  assert.equal((await request(base,`/api/matches/${created.id}/close`,guest.token,{})).status,200);
  assert.equal((await request(base,`/api/matches/${created.id}`,guest.token)).status,404);
});

test('a restart discards completed results, not active matches',async t=>{
  const f=fixture(t);let base=await f.listen();
  const created=(await request(base,'/api/matches',null,{width:8,height:5,actions:2})).data;
  const db=new DatabaseSync(f.database);
  db.prepare('UPDATE matches SET status=? WHERE id=?').run('finished',created.id);db.close();
  base=await f.restart();
  assert.equal((await request(base,`/api/matches/${created.id}`,created.token)).status,404);
});
