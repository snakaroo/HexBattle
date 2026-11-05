const {createGame,CARDS,NAMES,SHORT,DEFAULT_WIDTH,DEFAULT_HEIGHT}=HexEngine;
const SVG='http://www.w3.org/2000/svg';
const $ = id => document.getElementById(id);
let engine=createGame(), game=engine.state, online=null, effectTimer=null, effectQueue=[];
let viewMode=(()=>{try{return sessionStorage.getItem('hex-battle-view')==='flat'?'flat':'isometric'}catch{return 'isometric'}})();
function key(q,r){return `${q},${r}`}
function rowWidth(r){return game.width+(r%2)}
function onEdge(q,r,owner){return q===(owner===0?0:rowWidth(r)-1)}
function player(){return game.players[online?.seat??game.active]}
function cell(q,r){return game.cells.get(key(q,r))}
function unitAt(q,r){return game.units.find(u=>u.hp>0&&u.q===q&&u.r===r)}
function itemVisible(c){return online?!!c.item:engine.itemVisible(c)}
function validTiles(){return online&&(!online.connected||!online.ready||game.active!==online.seat)?[]:engine.validTiles()}
function emptyItemTiles(){return engine.emptyItemTiles()}
function canActivate(u){return engine.canActivate(u)}
function soupUnits(){return engine.soupUnits()}
function newGame(allowance=2,width=DEFAULT_WIDTH,height=DEFAULT_HEIGHT){clearEffects();engine.newGame(allowance,width,height);game=engine.state;$('overlay').classList.add('hidden');render()}
function applyLocal(type,...args){const before=game.active;engine[type](...args);game=engine.state;effectQueue.push(...engine.takeEffects());render();if(game.winner!==null){showOverlay('VICTORY',`${NAMES[game.winner]} wins!`,`The borderlands belong to ${SHORT[game.winner]}. Play another battle?`,'Play again',()=>openSetup());return}if(type==='endTurn'&&before!==game.active)showOverlay('PASS THE SCREEN',`${NAMES[game.active]}'s turn`,`Hand the device to ${SHORT[game.active]}. Their hand stays hidden until they are ready.`,'Ready to play',()=>{$('overlay').classList.add('hidden');render()})}
function selectCard(index){if(online)sendMove('selectCard',{index});else applyLocal('selectCard',index)}
function selectHex(q,r){if(online)sendMove('selectHex',{q,r});else applyLocal('selectHex',q,r)}
function rollItem(){if(online)sendMove('rollItem');else applyLocal('rollItem')}
function endTurn(){if(online)sendMove('endTurn');else applyLocal('endTurn')}
function showOverlay(kicker,title,body,button,action){$('overlayKicker').textContent=kicker;$('overlayTitle').textContent=title;$('overlayBody').textContent=body;$('overlayButton').firstChild.textContent=button+' ';$('overlayButton').onclick=action;$('overlay').classList.remove('hidden')}
function openSetup(initial=false){$('actionAllowance').value=String(game.actionAllowance);$('boardRows').value=String(game.height);$('boardWidth').value=String(game.width);$('cancelSetup').classList.toggle('hidden',initial);$('setupDialog').showModal()}
function clearEffects(){
  if(effectTimer!==null)clearTimeout(effectTimer);
  effectTimer=null;effectQueue=[];
  $('battleEffects').replaceChildren();
  document.querySelectorAll('.hex.effect-hit,.hex.effect-shield,.hex.effect-item,.hex.effect-lunge').forEach(el=>el.classList.remove('effect-hit','effect-shield','effect-item','effect-lunge'));
}
function hexSize(){return Math.min(60,810/(Math.sqrt(3)*(game.width+1)),570/(1.5*(game.height-1)+2))}
function boardPoint(q,r){const size=hexSize();return [475+Math.sqrt(3)*size*(q-(r%2)/2-(game.width-1)/2),345+1.5*size*(r-(game.height-1)/2)]}
function projectPoint(x,y){if(viewMode==='flat')return [x,y];return [475+(x-475)*(.84+.32*y/690),345+(y-345)*.72]}
function screenPoint(q,r){return projectPoint(...boardPoint(q,r))}
function switchView(){clearEffects();viewMode=viewMode==='isometric'?'flat':'isometric';try{sessionStorage.setItem('hex-battle-view',viewMode)}catch{}render()}
function showNextEffect(){
  if(effectTimer!==null||!effectQueue.length)return;
  const effect=effectQueue.shift(),container=$('battleEffects');container.replaceChildren();
  const toast=document.createElement('div');toast.className=`effect-toast ${effect.kind}`;toast.textContent=effect.message;container.append(toast);
  let targetHex=null,attackerHex=null;
  if(effect.target){
    const [q,r]=effect.target,[x,y]=screenPoint(q,r);
    targetHex=$('board').querySelector(`.hex[data-q="${q}"][data-r="${r}"]`);
    targetHex?.classList.add(`effect-${effect.kind}`);
    const floater=document.createElement('div');floater.className=`effect-float ${effect.kind}`;floater.textContent=effect.label;
    floater.style.left=`${x/950*100}%`;floater.style.top=`${y/690*100}%`;container.append(floater);
    if(effect.attacker){
      const [aq,ar]=effect.attacker,[ax,ay]=screenPoint(aq,ar),distance=Math.hypot(x-ax,y-ay)||1;
      attackerHex=$('board').querySelector(`.hex[data-q="${aq}"][data-r="${ar}"]`);
      const attackerContent=$('board').querySelector(`.tile-content[data-q="${aq}"][data-r="${ar}"]`);
      attackerHex?.style.setProperty('--lunge-x',`${(x-ax)/distance*10}px`);
      attackerHex?.style.setProperty('--lunge-y',`${(y-ay)/distance*10}px`);
      attackerHex?.classList.add('effect-lunge');
      attackerContent?.style.setProperty('--lunge-x',`${(x-ax)/distance*10}px`);
      attackerContent?.style.setProperty('--lunge-y',`${(y-ay)/distance*10}px`);
      attackerContent?.classList.add('effect-lunge');
    }
  }
  effectTimer=setTimeout(()=>{targetHex?.classList.remove(`effect-${effect.kind}`);attackerHex?.classList.remove('effect-lunge');$('board').querySelectorAll('.tile-content.effect-lunge').forEach(el=>el.classList.remove('effect-lunge'));container.replaceChildren();effectTimer=null;showNextEffect()},900);
}
function svgEl(tag,attrs={},text){const el=document.createElementNS(SVG,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v);if(text!==undefined)el.textContent=text;return el}
function renderBoard(){
  const board=$('board');board.replaceChildren();board.setAttribute('aria-label',`Symmetric battlefield with ${game.height} rows of ${game.width} or ${game.width+1} hexes`);
  const valid=new Set(validTiles()),size=hexSize(),isometric=viewMode==='isometric',content=[];
  document.querySelector('.board-wrap').classList.toggle('isometric',isometric);
  $('viewButton').querySelector('.view-label').textContent=`View: ${isometric?'Isometric':'Flat'}`;
  $('viewButton').querySelector('.view-icon').textContent=isometric?'▱':'⬡';
  $('viewButton').setAttribute('aria-label',`Switch to ${isometric?'flat':'isometric'} view`);
  for(let r=0;r<game.height;r++)for(let q=0;q<rowWidth(r);q++){
    const [baseX,baseY]=boardPoint(q,r),[x,y]=screenPoint(q,r);
    const vertices=Array.from({length:6},(_,i)=>{const a=Math.PI/180*(60*i-30);return projectPoint(baseX+size*.96*Math.cos(a),baseY+size*.96*Math.sin(a))});
    const points=vertices.map(([vx,vy])=>`${vx.toFixed(1)},${vy.toFixed(1)}`).join(' ');
    const c=cell(q,r),u=unitAt(q,r),visible=itemVisible(c),g=svgEl('g',{'class':`hex ${((q+r)%2?'alt ':'')}${onEdge(q,r,0)?'home-blue ':onEdge(q,r,1)?'home-red ':''}${valid.has(key(q,r))?'valid ':''}${game.selected?.kind==='unit'&&u?.id===game.selected.id?'selected-tile':''}`,'data-q':q,'data-r':r,role:'button',tabindex:'0','aria-label':`${String.fromCharCode(65+q)}${r+1}${u?`, ${SHORT[u.owner]} ${CARDS[u.type].name}, ${u.hp} health`:''}${visible?`, ${CARDS[c.item.type].name}`:''}${valid.has(key(q,r))?', available target':''}`});
    if(isometric){
      const depth=size*.27;
      g.append(svgEl('polygon',{'class':'tile-bottom',points:vertices.map(([vx,vy])=>`${vx.toFixed(1)},${(vy+depth).toFixed(1)}`).join(' ')}));
      for(let i=1;i<=3;i++){
        const [ax,ay]=vertices[i],[bx,by]=vertices[(i+1)%6];
        g.append(svgEl('polygon',{'class':`tile-side ${i===1?'side-right':'side-left'}`,points:`${ax.toFixed(1)},${ay.toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)} ${bx.toFixed(1)},${(by+depth).toFixed(1)} ${ax.toFixed(1)},${(ay+depth).toFixed(1)}`}));
      }
    }
    g.append(svgEl('polygon',{'class':'tile-top',points}));
    if(valid.has(key(q,r))){
      if(isometric)g.append(svgEl('ellipse',{cx:x,cy:y,rx:size*.62,ry:size*.39,'class':'glow'}));
      else g.append(svgEl('circle',{cx:x,cy:y,r:size*.67,'class':'glow'}));
    }
    board.append(g);
    content.push({q,r,x,y,c,u,visible});
  }
  for(const {q,r,x,y,c,u,visible} of content){
    const g=svgEl('g',{'class':'hex tile-content','data-q':q,'data-r':r,'aria-hidden':'true','pointer-events':'none'});
    const lift=isometric?size*.13:0,discSize=isometric?size*.45:size*.56;
    if(visible){g.append(svgEl('circle',{cx:x,cy:y-lift,r:isometric?size*.4:size*.48,'class':'item-bg'}));g.append(svgEl('text',{x,y:y-lift+1,'class':'item-icon'},CARDS[c.item.type].icon));if(c.item.type==='fence')g.append(svgEl('text',{x:x+size*.46,y:y+size*.52,'class':'unit-status'},String(c.item.hp)))}
    else if(u){
      if(isometric)g.append(svgEl('ellipse',{cx:x,cy:y+size*.17,rx:size*.43,ry:size*.16,'class':'unit-shadow'}));
      g.append(svgEl('circle',{cx:x,cy:y-lift,r:discSize,'class':`unit-disc ${u.owner?'red':'blue'}`}));
      g.append(svgEl('text',{x,y:y-lift-4,'class':'unit-icon',style:`font-size:${Math.min(25,size*.58)}px`},CARDS[u.type].icon));
      g.append(svgEl('text',{x,y:y-lift+discSize*.78,'class':'unit-hp'},`${'♥'.repeat(Math.min(u.hp,5))}${u.shield?' ◈'+u.shield:''}`));
      if(u.owner===game.active&&u.activations>0)g.append(svgEl('text',{x:x-size*.55,y:y-lift-size*.39,'class':'unit-used'},u.activations===2?'2×':'✓'));
      if(u.extraReady)g.append(svgEl('text',{x:x+size*.55,y:y-lift+size*.05,'class':'unit-status'},'✦'));
      if(u.restUntil===game.players[u.owner].turns&&u.type==='ram')g.append(svgEl('text',{x:x+size*.56,y:y-lift-size*.42,'class':'unit-status'},'Z'));
    }else if(!valid.has(key(q,r)))g.append(svgEl('text',{x,y:y+3,'class':'coord'},`${String.fromCharCode(65+q)}${r+1}`));
    board.append(g);
  }
}
function render(){
  const p=player(),name=NAMES[online?.seat??game.active],canPlay=!online||(online.ready&&online.connected&&online.bothConnected&&game.active===online.seat&&game.winner===null);
  $('blueScore').textContent=game.players[0].score;$('redScore').textContent=game.players[1].score;
  $('turnLabel').textContent=`${SHORT[game.active]}'s turn`;$('roundLabel').textContent=`Round ${game.round}`;
  $('turnCount').textContent=String(p.turns).padStart(2,'0');$('activeName').textContent=name;
  $('actionText').textContent=online&&!canPlay?(online.ready?'Waiting for both players or your turn':'Waiting for opponent'):`${game.actions} action${game.actions===1?'':'s'} remaining`;
  $('actionPips').replaceChildren(...Array.from({length:game.maxActions},(_,i)=>{const el=document.createElement('i');if(i>=game.actions)el.className='spent';return el}));
  $('deckCount').textContent=`Deck: ${p.deck.length}`;
  $('hand').replaceChildren(...p.hand.map((type,i)=>{const def=CARDS[type],b=document.createElement('button');b.className=`card ${def.kind} ${game.selected?.kind==='card'&&game.selected.index===i?'selected':''}`;b.innerHTML=`<span class="card-top"><span class="symbol">${def.icon}</span><span class="card-kind">${def.kind}</span></span><strong>${def.name}</strong><span class="stats">${def.kind==='unit'?`${def.hp} health · ${def.damage} damage`:def.kind==='consumable'?'Use on a character':'Roll to place'}</span>`;b.setAttribute('aria-label',`${def.name}. ${def.description}`);b.disabled=!!game.pendingPlacement||!canPlay;b.onclick=()=>selectCard(i);return b}));
  $('endTurn').disabled=!!game.pendingPlacement||!canPlay;
  const rollButton=$('rollButton');rollButton.classList.toggle('hidden',game.selected?.kind!=='card'||!['terrain','supply'].includes(CARDS[p.hand[game.selected?.index]]?.kind)||!!game.pendingPlacement);
  rollButton.disabled=emptyItemTiles().length===0||!canPlay;
  const s=game.selected;
  if(game.pendingPlacement){const pending=game.pendingPlacement;$('detail').innerHTML=`<strong>Rolled ${pending.roll} · ${CARDS[pending.type].name}</strong><br>Choose a glowing empty hex exactly ${pending.roll} steps from one of your active characters. This placement is committed.`}
  else if(s?.kind==='card'){const def=CARDS[p.hand[s.index]];$('detail').innerHTML=`<strong>${def.name}</strong><br>${def.description}<br><br><em>${def.kind==='unit'?'Choose a glowing hex to deploy.':def.kind==='consumable'?(soupUnits().length?'Choose one of your glowing characters. No die roll needed.':'No character with a possible move can use Soup right now.'):emptyItemTiles().length?'Click Roll to place. This commits one action and the card.':'No free non-edge hexes. This item cannot be spent.'}</em>`}
  else if(s?.kind==='unit'){
    const u=game.units.find(u=>u.id===s.id),def=CARDS[u.type],resting=u.restUntil===p.turns&&u.type==='ram';
    const status=resting?'Resting this turn.':u.activations===2?'Already acted twice this turn.':u.activations===1?(u.extraReady?'One extra activation available.':'Already acted this turn.'):'Normal activation available.';
    $('detail').innerHTML=`<strong>${def.name}</strong> · ${u.hp}/${def.hp} health · ${u.shield} shield<br>${def.description}<br><strong>${status}</strong>${u.extraReady?'<br>✦ Extra Attack stored until used.':''}${u.sword?'<br>⚔ +1 damage, -1 health when attacking.':''}<br><br><em>${canActivate(u)&&game.actions>0?'Choose a glowing hex to act.':'Choose another card or unit.'}</em>`;
  }
  else $('detail').textContent=game.actions?'Select a card to deploy, or one of your units to move and attack.':'No actions left. End the turn when ready.';
  $('log').replaceChildren(...game.log.filter(line=>line.secretOwner===null||line.secretOwner===(online?.seat??game.active)).map(line=>{const el=document.createElement('div');el.textContent=line.message;return el}));
  renderBoard();
  showNextEffect();
}
$('board').addEventListener('click',e=>{const g=e.target.closest('.hex');if(g)selectHex(+g.dataset.q,+g.dataset.r)});
$('board').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){const g=e.target.closest('.hex');if(g){e.preventDefault();selectHex(+g.dataset.q,+g.dataset.r)}}});
$('endTurn').onclick=endTurn;
$('rollButton').onclick=rollItem;
$('viewButton').onclick=switchView;
$('newButton').onclick=()=>openSetup();
$('cancelSetup').onclick=()=>$('setupDialog').close();
$('setupDialog').addEventListener('cancel',e=>{if($('cancelSetup').classList.contains('hidden'))e.preventDefault()});
$('setupForm').onsubmit=e=>{e.preventDefault();const allowance=Number($('actionAllowance').value),height=Number($('boardRows').value),width=Number($('boardWidth').value);if(!Number.isInteger(allowance)||allowance<1||allowance>5||!Number.isInteger(height)||height<5||height>9||!Number.isInteger(width)||width<6||width>12)return;$('setupDialog').close();if($('gameMode').value==='online')createOnline(allowance,width,height);else{online?.controller.abort();online=null;if(location.protocol!=='file:')history.replaceState(null,'','/');$('onlineStatus').classList.add('hidden');newGame(allowance,width,height)}};
$('rulesButton').onclick=()=>$('rulesDialog').showModal();
$('closeRules').onclick=()=>$('rulesDialog').close();
newGame();
if(location.protocol==='file:')$('gameMode').querySelector('[value="online"]').disabled=true;
const joinPath=location.pathname.match(/^\/(join|match)\/([a-f0-9]{24})$/);
if(joinPath)resumeOnline(joinPath[2],new URLSearchParams(location.search).get('invite'));
else openSetup(true);

async function api(url,options={}){
  const response=await fetch(url,{...options,headers:{'Content-Type':'application/json',...(online?.token?{Authorization:`Bearer ${online.token}`}:{})}});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'Connection failed');return data;
}
function onlineError(message){$('onlineStatus').classList.remove('hidden');$('onlineMessage').textContent=message}
async function createOnline(actions,width,height){
  try{
    const data=await api('/api/matches',{method:'POST',body:JSON.stringify({actions,width,height})});
    localStorage.setItem(`hex-match-${data.id}`,data.token);
    await startOnline(data.id,data.token,data.invite);
  }catch(error){onlineError(error.message)}
}
async function resumeOnline(id,invite){
  try{
    let token=localStorage.getItem(`hex-match-${id}`);
    if(!token&&invite){const settings=await api(`/api/invitations/${id}?invite=${encodeURIComponent(invite)}`);if(!confirm(`Join private match? ${settings.height} rows, ${settings.width} hexes in shorter rows, ${settings.actions} actions per turn.`))return;const data=await api(`/api/matches/${id}/join`,{method:'POST',body:JSON.stringify({invite})});token=data.token;localStorage.setItem(`hex-match-${id}`,token)}
    if(!token)throw new Error('This invitation has already been claimed or is missing.');
    await startOnline(id,token);
  }catch(error){onlineError(error.message)}
}
async function startOnline(id,token,invite){
  online?.controller.abort();
  online={id,token,invite:invite?new URL(invite,location.origin).href:null,controller:new AbortController(),connected:false,ready:false,bothConnected:false,seat:0};
  history.replaceState(null,'',`/match/${id}`);
  $('setupDialog').close();$('overlay').classList.add('hidden');$('onlineStatus').classList.remove('hidden');
  const data=await api(`/api/matches/${id}`);applyOnline(data);
  streamOnline(online);
}
function applyOnline(data){
  if(!online)return;
  if(data.type==='expired'||data.type==='closed'){online.controller.abort();onlineError('Match closed or expired. Start a new game.');return}
  online.seat=data.seat;online.ready=data.ready;online.bothConnected=data.connected.every(Boolean);
  engine.loadState(data.state);game=engine.state;clearEffects();effectQueue.push(...(data.effects||[]));
  const waiting=!data.ready;
  $('invitePanel').classList.toggle('hidden',!waiting||!online.invite);
  $('closeMatch').classList.toggle('hidden',data.status!=='finished');
  $('inviteLink').value=online.invite||'';
  $('onlineMessage').textContent=data.status==='finished'?`${NAMES[game.winner]} wins!`:waiting?'Waiting for a friend to join. Share the private link.':!online.bothConnected?'Match paused: waiting for both players to connect.':game.active===online.seat?'Your turn.':'Opponent’s turn.';
  render();
}
async function streamOnline(session){
  while(online===session&&!session.controller.signal.aborted){
    try{
      const response=await fetch(`/api/matches/${session.id}/events`,{headers:{Authorization:`Bearer ${session.token}`},signal:session.controller.signal});
      if(!response.ok)throw new Error('Match unavailable');
      session.connected=true;
      const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
      while(true){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let boundary;
        while((boundary=buffer.indexOf('\n\n'))!==-1){const packet=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);const line=packet.split('\n').find(line=>line.startsWith('data: '));if(line)applyOnline(JSON.parse(line.slice(6)))}
      }
    }catch(error){if(session.controller.signal.aborted)return;onlineError(`Connection lost: ${error.message}`)}
    session.connected=false;session.bothConnected=false;render();
    if(session.controller.signal.aborted)return;
    await new Promise(resolve=>setTimeout(resolve,1500));
  }
}
async function sendMove(type,details={}){
  if(!online?.connected||!online.bothConnected||!online.ready||game.active!==online.seat)return;
  try{await api(`/api/matches/${online.id}/moves`,{method:'POST',body:JSON.stringify({type,...details})})}
  catch(error){onlineError(error.message)}
}
async function closeOnline(){
  if(!online)return;
  const session=online;try{await api(`/api/matches/${session.id}/close`,{method:'POST'})}catch(error){onlineError(error.message);return}
  localStorage.removeItem(`hex-match-${session.id}`);session.controller.abort();online=null;history.replaceState(null,'','/');$('onlineStatus').classList.add('hidden');$('overlay').classList.add('hidden');newGame();openSetup(true);
}
$('copyInvite').onclick=()=>navigator.clipboard.writeText($('inviteLink').value).catch(()=>onlineError('Copy failed; select and copy the link manually.'));
$('closeMatch').onclick=closeOnline;
$('cancelMatch').onclick=async()=>{if(!online)return;try{await api(`/api/matches/${online.id}/cancel`,{method:'POST'});localStorage.removeItem(`hex-match-${online.id}`);online.controller.abort();online=null;history.replaceState(null,'','/');$('onlineStatus').classList.add('hidden');newGame();openSetup(true)}catch(error){onlineError(error.message)}};
