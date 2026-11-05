const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {DatabaseSync} = require('node:sqlite');
const {createGame,encodeState,decodeState,project} = require('./engine');

const DAY = 86400000;
const MAX_BODY = 4096;
const root = __dirname;
const files = {'/':'index.html','/index.html':'index.html','/game.js':'game.js','/engine.js':'engine.js','/style.css':'style.css'};
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
const idPattern = /^[a-f0-9]{24}$/;
const tokenPattern = /^[a-f0-9]{64}$/;
const random = bytes => crypto.randomBytes(bytes).toString('hex');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const equal = (a,b) => typeof a==='string'&&typeof b==='string'&&a.length===b.length&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));

function createServer({database=process.env.DB_PATH||'./data/matches.sqlite',now=()=>Date.now(),limit=Number(process.env.MAX_ACTIVE_MATCHES)||100,rate=Number(process.env.CREATE_LIMIT_PER_HOUR)||20}={}){
  fs.mkdirSync(path.dirname(database),{recursive:true});
  const db = new DatabaseSync(database);
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS matches (id TEXT PRIMARY KEY, invite TEXT NOT NULL, token0 TEXT NOT NULL, token1 TEXT, state TEXT NOT NULL, status TEXT NOT NULL, updated INTEGER NOT NULL, closed0 INTEGER NOT NULL DEFAULT 0, closed1 INTEGER NOT NULL DEFAULT 0);');
  // A restart disconnects every viewer; completed results must not become an archive.
  db.exec("DELETE FROM matches WHERE status='finished'");
  const get=db.prepare('SELECT * FROM matches WHERE id=?');
  const insert=db.prepare('INSERT INTO matches (id,invite,token0,state,status,updated) VALUES (?,?,?,?,?,?)');
  const save=db.prepare('UPDATE matches SET token1=?,state=?,status=?,updated=?,closed0=?,closed1=? WHERE id=?');
  const remove=db.prepare('DELETE FROM matches WHERE id=?');
  const list=db.prepare('SELECT id,updated,status FROM matches');
  const streams=new Map(), attempts=new Map();
  let closing=false;
  function sockets(id){if(!streams.has(id))streams.set(id,[new Set(),new Set()]);return streams.get(id)}
  function presence(id){return sockets(id).map(set=>set.size>0)}
  function sweep(){for(const row of list.all())if(now()-row.updated>=DAY){remove.run(row.id);notify(row.id,{type:'expired'});streams.delete(row.id)}}
  function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data))}
  function fail(res,status,message){send(res,status,{error:message})}
  function load(req,res,id){
    if(!idPattern.test(id)){fail(res,404,'Match not found');return null}
    const row=get.get(id);
    if(!row){fail(res,404,'Match not found');return null}
    const token=req.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    const digest=token&&hash(token);
    const seat=equal(digest,row.token0)?0:equal(digest,row.token1)?1:null;
    if(seat===null||row[`closed${seat}`]){fail(res,403,'Seat unavailable');return null}
    return {row,seat};
  }
  function view(row,seat){return {type:'state',seat,status:row.status,ready:!!row.token1,connected:presence(row.id),state:project(decodeState(JSON.parse(row.state)),seat)}}
  function notify(id,override,effects=[]){const row=get.get(id);for(const [seat,set] of sockets(id).entries())for(const res of set){const event=override||{...view(row,seat),effects};res.write(`data: ${JSON.stringify(event)}\n\n`)}}
  function persist(row){save.run(row.token1,row.state,row.status,row.updated,row.closed0,row.closed1,row.id)}
  async function body(req){
    let text='';for await(const part of req){text+=part;if(text.length>MAX_BODY)throw new Error('Request too large')}
    return JSON.parse(text||'{}');
  }
  const server=http.createServer(async(req,res)=>{
    try{
      sweep();
      const url=new URL(req.url,'http://localhost');
      const segments=url.pathname.split('/').filter(Boolean);
      if(req.method==='GET'&&segments[0]==='api'&&segments[1]==='invitations'&&segments.length===3){
        const id=segments[2],row=idPattern.test(id)?get.get(id):null,invite=url.searchParams.get('invite');
        if(!row||row.status!=='waiting'||!tokenPattern.test(invite||'')||!equal(hash(invite),row.invite))return fail(res,404,'Invitation unavailable');
        const state=JSON.parse(row.state);return send(res,200,{width:state.width,height:state.height,actions:state.actionAllowance});
      }
      if(req.method==='POST'&&url.pathname==='/api/matches'){
        const ip=req.socket.remoteAddress||'unknown',window=now()-3600000;
        const recent=(attempts.get(ip)||[]).filter(t=>t>window);
        attempts.set(ip,recent);
        if(recent.length>=rate||list.all().length>=limit)return fail(res,429,'Match creation limit reached');
        const config=await body(req),{width,height,actions}=config;
        if(!Number.isInteger(width)||width<6||width>12||!Number.isInteger(height)||height<5||height>9||!Number.isInteger(actions)||actions<1||actions>5)return fail(res,400,'Invalid match settings');
        const id=random(12),invite=random(32),token=random(32),engine=createGame(actions,width,height);
        insert.run(id,hash(invite),hash(token),JSON.stringify(encodeState(engine.state)),'waiting',now());
        recent.push(now());send(res,201,{id,token,invite:`/join/${id}?invite=${invite}`});return;
      }
      if(segments[0]==='api'&&segments[1]==='matches'&&segments.length>=3){
        const id=segments[2];
        if(req.method==='POST'&&segments[3]==='join'){
          if(!idPattern.test(id))return fail(res,404,'Match not found');
          const row=get.get(id),input=await body(req);
          if(!row||row.status!=='waiting'||row.token1||!tokenPattern.test(input.invite||'')||!equal(hash(input.invite),row.invite))return fail(res,403,'Invitation unavailable');
          const token=random(32);row.token1=hash(token);row.status='playing';row.updated=now();persist(row);notify(id);
          send(res,201,{id,token});return;
        }
        const authorized=load(req,res,id);if(!authorized)return;
        const {row,seat}=authorized;
        if(req.method==='GET'&&segments.length===3)return send(res,200,view(row,seat));
        if(req.method==='GET'&&segments[3]==='events'){
          res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
          sockets(id)[seat].add(res);notify(id);
          const heartbeat=setInterval(()=>res.write(': keepalive\n\n'),15000);
          req.on('close',()=>{clearInterval(heartbeat);sockets(id)[seat].delete(res);if(closing)return;const current=get.get(id);if(current?.status==='finished'){current[`closed${seat}`]=1;if(current.closed0&&current.closed1){remove.run(id);streams.delete(id)}else{persist(current);notify(id)}}else if(current)notify(id)});
          return;
        }
        if(req.method==='POST'&&segments[3]==='moves'){
          if(row.status!=='playing'||!presence(id).every(Boolean))return fail(res,409,'Waiting for both players');
          const engine=createGame();engine.loadState(JSON.parse(row.state));
          if(engine.state.active!==seat||engine.state.winner!==null)return fail(res,409,'Not your turn');
          const action=await body(req),before=JSON.stringify(encodeState(engine.state));
          if(action.type==='selectCard')engine.selectCard(action.index);
          else if(action.type==='selectHex')engine.selectHex(action.q,action.r);
          else if(action.type==='rollItem')engine.rollItem();
          else if(action.type==='endTurn')engine.endTurn();
          else return fail(res,400,'Invalid move');
          const after=JSON.stringify(encodeState(engine.state));
          if(before===after)return fail(res,400,'Illegal move');
          row.state=after;row.updated=now();if(engine.state.winner!==null)row.status='finished';persist(row);notify(id,null,engine.takeEffects());
          return send(res,200,{ok:true});
        }
        if(req.method==='POST'&&segments[3]==='close'){
          if(row.status!=='finished')return fail(res,409,'Match is not finished');
          row[`closed${seat}`]=1;for(const socket of sockets(id)[seat])socket.end();sockets(id)[seat].clear();
          if((row.closed0||!presence(id)[0])&&(row.closed1||!presence(id)[1])){remove.run(id);notify(id,{type:'closed'});streams.delete(id)}
          else{persist(row);notify(id)}
          return send(res,200,{ok:true});
        }
        if(req.method==='POST'&&segments[3]==='cancel'){
          if(seat!==0||row.status!=='waiting')return fail(res,409,'Cannot cancel match');
          remove.run(id);notify(id,{type:'closed'});streams.delete(id);return send(res,200,{ok:true});
        }
      }
      if(req.method==='GET'){
        const name=files[url.pathname]||(/^\/(join|match)\/[a-f0-9]{24}$/.test(url.pathname)?'index.html':null)||url.pathname.match(/^\/(join|match)\/(style\.css|game\.js|engine\.js)$/)?.[2];
        if(name){res.writeHead(200,{'Content-Type':types[path.extname(name)],'Cache-Control':'no-store'});fs.createReadStream(path.join(root,name)).pipe(res);return}
      }
      fail(res,404,'Not found');
    }catch(error){if(!res.headersSent)fail(res,error instanceof SyntaxError?400:500,error instanceof SyntaxError?'Invalid JSON':'Request failed');else res.end();console.error(error)}
  });
  const timer=setInterval(sweep,60000);timer.unref();
  server.on('close',()=>{closing=true;clearInterval(timer);db.close()});
  return server;
}
if(require.main===module)createServer().listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log('Hex Battle listening'));
module.exports={createServer};
