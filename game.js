const W = 9, H = 7, SVG = 'http://www.w3.org/2000/svg';
const DIRS = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
const NAMES = ['Azure Guild', 'Ember Order'];
const SHORT = ['Azure', 'Ember'];
const CARDS = {
  knight:{name:'Knight',icon:'♞',kind:'unit',hp:3,damage:1,description:'Moves or attacks 1 adjacent hex. A sturdy front-line fighter.'},
  archer:{name:'Archer',icon:'➶',kind:'unit',hp:2,damage:1,description:'Moves or attacks exactly 2 hexes along any of its 6 straight lines. No close-range move.'},
  ram:{name:'Battering Ram',icon:'⚒',kind:'unit',hp:4,damage:2,description:'Strikes every hex along a 3-hex line. Rests on your next turn; while resting it takes +1 damage.'},
  dragon:{name:'Dragon',icon:'♜',kind:'unit',hp:5,damage:2,description:'Breathes onto the 2 tiles ahead and the 2 flanking the far tile, then advances. Fire also hits your own army.'},
  blacksmith:{name:'Blacksmith',icon:'⚒',kind:'unit',hp:3,damage:1,description:'Moves 1 adjacent hex. On deployment, gives an adjacent ally 1 shield.'},
  thief:{name:'Thief',icon:'◆',kind:'unit',hp:2,damage:1,description:'Moves 1 adjacent hex. Steals 1 shield from an enemy it strikes.'},
  shield:{name:'Shield',icon:'◈',kind:'supply',description:'First unit to land here gains 1 shield, absorbing 1 damage.'},
  potion:{name:'Potion',icon:'✚',kind:'supply',description:'First unit to land here heals 2 health, up to its maximum.'},
  poison:{name:'Poison',icon:'☠',kind:'supply',description:'First unit to land here loses 1 health.'},
  extra:{name:'Extra Attack',icon:'✦',kind:'supply',description:'First unit to land here gives its player 1 extra action this turn.'},
  confusion:{name:'Confusion',icon:'↝',kind:'supply',description:'First unit to land here has its next chosen movement direction reversed.'},
  sword:{name:'Double-edge',icon:'⚔',kind:'supply',description:'First unit to land here gets +1 attack, but loses 1 health each time it attacks.'},
  fence:{name:'Fence',icon:'▥',kind:'terrain',description:'A 2-health barrier. Blocks movement until destroyed.'},
  bramble:{name:'Bramble',icon:'✤',kind:'terrain',description:'Deals 1 damage to the next unit entering this tile, then disappears.'},
  soup:{name:'Soup',icon:'◕',kind:'terrain',description:'Heals the next unit entering this tile by 2, then disappears.'}
};
const DECK_LIST = ['knight','knight','knight','knight','archer','archer','archer','ram','ram','dragon','blacksmith','blacksmith','thief','thief','shield','shield','shield','potion','potion','poison','poison','extra','extra','confusion','confusion','sword','sword','fence','fence','bramble','bramble','soup','soup'];
const $ = id => document.getElementById(id);
let game;

function shuffle(items){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function key(q,r){return `${q},${r}`}
function inside(q,r){return q>=0&&q<W&&r>=0&&r<H}
// Odd rows sit half a hex to the right. Convert to axial coordinates so
// straight-line movement still follows the six visible hex directions.
function axial(q,r){return [q-Math.floor(r/2),r]}
function offset(a,r){return [a+Math.floor(r/2),r]}
function walk(q,r,direction,distance=1){const [a,row]=axial(q,r),[da,dr]=DIRS[direction];return offset(a+da*distance,row+dr*distance)}
function hexDistance(q1,r1,q2,r2){const [a1]=axial(q1,r1),[a2]=axial(q2,r2),da=a1-a2,dr=r1-r2;return (Math.abs(da)+Math.abs(dr)+Math.abs(da+dr))/2}
function cell(q,r){return game.cells.get(key(q,r))}
function unitAt(q,r){return game.units.find(u=>u.hp>0&&u.q===q&&u.r===r)}
function player(){return game.players[game.active]}
function other(){return game.players[1-game.active]}
function say(message){game.log.unshift(message);game.log=game.log.slice(0,8)}
function newPlayer(){const deckList=[...DECK_LIST];deckList.splice(deckList.indexOf('knight'),1);deckList.splice(deckList.indexOf('archer'),1);const deck=shuffle(deckList);const hand=['knight','archer',...deck.splice(0,3)];return {hand,deck,discard:[],score:0,turns:0}}
function newGame(){game={cells:new Map(),units:[],players:[newPlayer(),newPlayer()],active:0,round:1,actions:2,maxActions:2,selected:null,pendingPlacement:null,log:[],nextId:1,winner:null};for(let q=0;q<W;q++)for(let r=0;r<H;r++)game.cells.set(key(q,r),{q,r,item:null});game.players[0].turns=1;say('The borderlands await. Azure deploys first.');$('overlay').classList.add('hidden');render()}
function drawCards(p,count){for(let i=0;i<count&&p.hand.length<7;i++){if(!p.deck.length){p.deck=shuffle(p.discard);p.discard=[]}if(!p.deck.length)break;p.hand.push(p.deck.pop())}}

function targetsForUnit(u){
  if(u.type==='ram'&&u.restUntil>=game.players[u.owner].turns)return [];
  const confused=u.confused>0, options=[];
  if(u.type==='dragon'){
    const forward=u.owner===0?0:3,dir=confused?(forward+3)%6:forward;
    const click=walk(u.q,u.r,forward),destination=walk(u.q,u.r,dir);
    if(inside(...click)&&inside(...destination))options.push({click,dir,kind:'dragon'});
    return options;
  }
  const distance=u.type==='archer'?2:u.type==='ram'?3:1;
  for(let direction=0;direction<6;direction++){
    const click=walk(u.q,u.r,direction,distance),actual=confused?(direction+3)%6:direction;
    const destination=walk(u.q,u.r,actual,distance),[aq,ar]=destination;
    if(!inside(...click)||!inside(aq,ar))continue;
    if(unitAt(aq,ar)?.owner===u.owner)continue;
    options.push({click,dest:destination,direction:actual,kind:u.type});
  }
  return options;
}
function validTiles(){
  if(game.pendingPlacement)return game.pendingPlacement.tiles.map(c=>key(c.q,c.r));
  if(!game.selected||game.actions<=0||game.winner!==null)return [];
  if(game.selected.kind==='unit')return targetsForUnit(game.units.find(u=>u.id===game.selected.id)).map(t=>key(...t.click));
  const type=player().hand[game.selected.index],def=CARDS[type];
  if(!def||def.kind!=='unit')return [];
  const results=[];
  for(const c of game.cells.values()){
    if(unitAt(c.q,c.r)||c.item)continue;
    if(def.kind==='unit'&&c.q!==(game.active===0?0:W-1))continue;
    results.push(key(c.q,c.r));
  }
  return results;
}
function emptyItemTiles(){return [...game.cells.values()].filter(c=>c.q>0&&c.q<W-1&&!unitAt(c.q,c.r)&&!c.item)}
function placeItem(type,q,r){cell(q,r).item={type,hp:type==='fence'?2:undefined};say(`${SHORT[game.active]} places ${CARDS[type].name} on the field.`)}
function rollItem(){
  if(game.pendingPlacement||game.selected?.kind!=='card'||game.actions<=0)return;
  const index=game.selected.index,type=player().hand[index];
  if(!type||CARDS[type].kind==='unit')return;
  const empty=emptyItemTiles();if(!empty.length)return;
  const roll=Math.floor(Math.random()*6)+1;
  const active=game.units.filter(u=>u.hp>0&&u.owner===game.active&&!(u.type==='ram'&&u.restUntil>=player().turns));
  const eligible=roll===1?[]:empty.filter(c=>active.some(u=>hexDistance(u.q,u.r,c.q,c.r)===roll));
  player().hand.splice(index,1);player().discard.push(type);game.selected=null;
  spendAction();say(`${SHORT[game.active]} rolls a ${roll} for ${CARDS[type].name}.`);
  if(eligible.length){game.pendingPlacement={type,roll,tiles:eligible};say(`Choose a glowing hex exactly ${roll} steps from an active character.`)}
  else{const c=empty[Math.floor(Math.random()*empty.length)];placeItem(type,c.q,c.r);say(roll===1?'A roll of 1 places the item randomly.':'No eligible hex; the item is placed randomly.')}
  render();
}
function selectCard(index){if(game.pendingPlacement||game.actions<=0||game.winner!==null)return;game.selected=game.selected?.kind==='card'&&game.selected.index===index?null:{kind:'card',index};render()}
function selectHex(q,r){
  if(game.winner!==null)return;
  if(game.pendingPlacement){
    if(validTiles().includes(key(q,r))){placeItem(game.pendingPlacement.type,q,r);game.pendingPlacement=null;render()}
    return;
  }
  const occupant=unitAt(q,r),selected=game.selected;
  if(selected&&game.actions>0&&validTiles().includes(key(q,r))){
    if(selected.kind==='card')playCard(selected.index,q,r);
    else activate(game.units.find(u=>u.id===selected.id),q,r);
    game.selected=null;render();return;
  }
  if(occupant&&occupant.owner===game.active&&game.actions>0){game.selected=selected?.kind==='unit'&&selected.id===occupant.id?null:{kind:'unit',id:occupant.id};render();return}
  game.selected=null;render();
}
function spendAction(){game.actions--;if(game.actions<=0)say(`${SHORT[game.active]} is out of actions. End the turn when ready.`)}
function playCard(index,q,r){
  const p=player(),type=p.hand.splice(index,1)[0],def=CARDS[type];p.discard.push(type);
  const u={id:game.nextId++,type,owner:game.active,q,r,hp:def.hp,shield:0,confused:0,sword:false,restUntil:0,breached:false};game.units.push(u);
  say(`${SHORT[game.active]} deploys a ${def.name}.`);
  if(type==='blacksmith'){const ally=game.units.find(a=>a.id!==u.id&&a.owner===u.owner&&DIRS.some((_,direction)=>{const [x,y]=walk(q,r,direction);return a.q===x&&a.r===y}));if(ally){ally.shield++;say(`The blacksmith shields an allied ${CARDS[ally.type].name}.`)}}
  spendAction();
}
function damageUnit(target,amount,attacker,source){
  if(target.hp<=0)return;
  if(target.restUntil>=game.players[target.owner].turns&&target.type==='ram')amount++;
  const absorbed=Math.min(target.shield,amount);target.shield-=absorbed;amount-=absorbed;
  target.hp-=amount;
  const name=CARDS[target.type].name;
  if(target.hp<=0){
    target.hp=0;say(`${SHORT[target.owner]}'s ${name} falls${source?' to '+source:''}.`);
    if(attacker!==null&&attacker!==target.owner){game.players[attacker].score+=target.type==='dragon'?2:1;checkWin()}
  }else say(`${SHORT[target.owner]}'s ${name} takes ${amount} damage${absorbed?` (${absorbed} blocked)`:''}.`);
}
function hitTile(attacker,q,r,damage,friendlyFire=false,source='an attack'){
  const c=cell(q,r),target=unitAt(q,r);
  if(target&&(friendlyFire||target.owner!==attacker.owner)){
    if(attacker.type==='thief'&&target.owner!==attacker.owner&&target.shield>0){target.shield--;attacker.shield++;say('The thief steals a shield!')}
    damageUnit(target,damage,attacker.owner,source);
  }
  if(c.item?.type==='fence'){
    c.item.hp-=damage;
    if(c.item.hp<=0){c.item=null;say('A fence is smashed apart.')}else say('A fence absorbs the blow.');
  }
}
function land(u,q,r){
  if(u.hp<=0||unitAt(q,r)||cell(q,r).item?.type==='fence')return;
  u.q=q;u.r=r;
  const c=cell(q,r),item=c.item;
  if(item){
    c.item=null;const name=CARDS[item.type].name;
    say(`${SHORT[u.owner]}'s ${CARDS[u.type].name} claims ${name}.`);
    switch(item.type){
      case 'shield':u.shield++;break;
      case 'potion':case 'soup':u.hp=Math.min(CARDS[u.type].hp,u.hp+2);break;
      case 'poison':case 'bramble':damageUnit(u,1,null,name);break;
      case 'extra':game.actions=Math.min(3,game.actions+1);game.maxActions=Math.max(game.maxActions,game.actions);break;
      case 'confusion':u.confused=1;break;
      case 'sword':u.sword=true;break;
    }
  }
  if(u.hp>0&&!u.breached&&q===(u.owner===0?W-1:0)){
    u.breached=true;game.players[u.owner].score+=2;say(`${SHORT[u.owner]}'s ${CARDS[u.type].name} breaks through! +2 glory.`);checkWin();
  }
}
function attackCost(u){if(u.sword&&u.hp>0){say('The double-edged sword wounds its wielder.');damageUnit(u,1,null,'the sword')}}
function activate(u,q,r){
  const move=targetsForUnit(u).find(t=>t.click[0]===q&&t.click[1]===r);if(!move)return;
  if(u.confused){u.confused=0;say(`${CARDS[u.type].name} is confused and goes the opposite way!`)}
  if(u.type==='dragon'){
    const near=walk(u.q,u.r,move.dir),far=walk(u.q,u.r,move.dir,2);
    const flanks=move.dir===0?[walk(...far,2),walk(...far,4)]:[walk(...far,1),walk(...far,5)];
    const tiles=[near,far,...flanks];
    say(`${SHORT[u.owner]}'s dragon breathes fire!`);
    for(const [x,y] of tiles)if(inside(x,y))hitTile(u,x,y,CARDS[u.type].damage+(u.sword?1:0),true,'dragon fire');
    attackCost(u);land(u,...near);
  }else if(u.type==='ram'){
    say(`${SHORT[u.owner]}'s ram charges down the line!`);
    let blocked=false;
    for(let i=1;i<=3;i++){
      const [x,y]=walk(u.q,u.r,move.direction,i);
      if(!inside(x,y))break;
      if(unitAt(x,y)?.owner!==u.owner)hitTile(u,x,y,CARDS[u.type].damage+(u.sword?1:0),false,'the ram');
      if(cell(x,y).item?.type==='fence'||unitAt(x,y))blocked=true;
    }
    attackCost(u);if(!blocked)land(u,...move.dest);
    u.restUntil=game.players[u.owner].turns+1;
    say('The ram must rest next turn and is vulnerable.');
  }else{
    const [x,y]=move.dest;
    const attacked=!!unitAt(x,y)||cell(x,y).item?.type==='fence';
    if(attacked){hitTile(u,x,y,CARDS[u.type].damage+(u.sword?1:0),false,CARDS[u.type].name.toLowerCase());attackCost(u)}
    if(u.hp>0)land(u,x,y);
    if(!attacked)say(`${SHORT[u.owner]}'s ${CARDS[u.type].name} moves.`);
  }
  spendAction();
}
function checkWin(){for(let i=0;i<2;i++)if(game.players[i].score>=6&&game.winner===null){game.winner=i;say(`${NAMES[i]} wins the battle!`);showOverlay('VICTORY',`${NAMES[i]} wins!`,`The borderlands belong to ${SHORT[i]}. Play another battle?`,'Play again',newGame)}}
function endTurn(){if(game.winner!==null||game.pendingPlacement)return;game.selected=null;game.active=1-game.active;if(game.active===0)game.round++;game.actions=2;game.maxActions=2;const p=player();p.turns++;drawCards(p,2);say(`${SHORT[game.active]}'s turn begins. 2 cards drawn.`);render();showOverlay('PASS THE SCREEN',`${NAMES[game.active]}'s turn`,`Hand the device to ${SHORT[game.active]}. Their hand stays hidden until they are ready.`,'Ready to play',()=>{$('overlay').classList.add('hidden');render()})}
function showOverlay(kicker,title,body,button,action){$('overlayKicker').textContent=kicker;$('overlayTitle').textContent=title;$('overlayBody').textContent=body;$('overlayButton').firstChild.textContent=button+' ';$('overlayButton').onclick=action;$('overlay').classList.remove('hidden')}

function svgEl(tag,attrs={},text){const el=document.createElementNS(SVG,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v);if(text!==undefined)el.textContent=text;return el}
function renderBoard(){
  const board=$('board');board.replaceChildren();const valid=new Set(validTiles());
  for(let r=0;r<H;r++)for(let q=0;q<W;q++){
    const x=125+Math.sqrt(3)*48*(q+(r%2)/2),y=128+72*r;
    const vertices=Array.from({length:6},(_,i)=>{const a=Math.PI/180*(60*i-30);return `${(x+46*Math.cos(a)).toFixed(1)},${(y+46*Math.sin(a)).toFixed(1)}`}).join(' ');
    const c=cell(q,r),u=unitAt(q,r),g=svgEl('g',{'class':`hex ${((q+r)%2?'alt ':'')}${q===0?'home-blue ':q===8?'home-red ':''}${valid.has(key(q,r))?'valid ':''}${game.selected?.kind==='unit'&&u?.id===game.selected.id?'selected-tile':''}`,'data-q':q,'data-r':r,role:'button',tabindex:'0','aria-label':`${String.fromCharCode(65+q)}${r+1}${u?`, ${SHORT[u.owner]} ${CARDS[u.type].name}, ${u.hp} health`:''}${c.item?`, ${CARDS[c.item.type].name}`:''}${valid.has(key(q,r))?', available target':''}`});
    g.append(svgEl('polygon',{points:vertices}));
    if(c.item){g.append(svgEl('circle',{cx:x,cy:y,r:23,'class':'item-bg'}));g.append(svgEl('text',{x,y:y+1,'class':'item-icon'},CARDS[c.item.type].icon));if(c.item.type==='fence')g.append(svgEl('text',{x:x+22,y:y+25,'class':'unit-status'},String(c.item.hp)))}
    else if(u){g.append(svgEl('circle',{cx:x,cy:y,r:27,'class':`unit-disc ${u.owner?'red':'blue'}`}));g.append(svgEl('text',{x,y:y-4,'class':'unit-icon'},CARDS[u.type].icon));g.append(svgEl('text',{x,y:y+21,'class':'unit-hp'},`${'♥'.repeat(Math.min(u.hp,5))}${u.shield?' ◈'+u.shield:''}`));if(u.restUntil>=game.players[u.owner].turns&&u.type==='ram')g.append(svgEl('text',{x:x+27,y:y-20,'class':'unit-status'},'Z'));else if(u.confused)g.append(svgEl('text',{x:x+27,y:y-20,'class':'unit-status'},'↝'));}
    else if(!valid.has(key(q,r)))g.append(svgEl('text',{x,y:y+3,'class':'coord'},`${String.fromCharCode(65+q)}${r+1}`));
    if(valid.has(key(q,r)))g.append(svgEl('circle',{cx:x,cy:y,r:32,'class':'glow'}));
    board.append(g);
  }
}
function render(){
  const p=player(),name=NAMES[game.active];
  $('blueScore').textContent=game.players[0].score;$('redScore').textContent=game.players[1].score;
  $('turnLabel').textContent=`${SHORT[game.active]}'s turn`;$('roundLabel').textContent=`Round ${game.round}`;
  $('turnCount').textContent=String(p.turns).padStart(2,'0');$('activeName').textContent=name;
  $('actionText').textContent=`${game.actions} action${game.actions===1?'':'s'} remaining`;
  $('actionPips').replaceChildren(...Array.from({length:game.maxActions},(_,i)=>{const el=document.createElement('i');if(i>=game.actions)el.className='spent';return el}));
  $('deckCount').textContent=`Deck: ${p.deck.length}`;
  $('hand').replaceChildren(...p.hand.map((type,i)=>{const def=CARDS[type],b=document.createElement('button');b.className=`card ${def.kind} ${game.selected?.kind==='card'&&game.selected.index===i?'selected':''}`;b.innerHTML=`<span class="card-top"><span class="symbol">${def.icon}</span><span class="card-kind">${def.kind}</span></span><strong>${def.name}</strong><span class="stats">${def.kind==='unit'?`${def.hp} health · ${def.damage} damage`:'Roll to place'}</span>`;b.setAttribute('aria-label',`${def.name}. ${def.description}`);b.disabled=!!game.pendingPlacement;b.onclick=()=>selectCard(i);return b}));
  $('endTurn').disabled=!!game.pendingPlacement;
  const rollButton=$('rollButton');rollButton.classList.toggle('hidden',game.selected?.kind!=='card'||CARDS[p.hand[game.selected?.index]]?.kind==='unit'||!!game.pendingPlacement);
  rollButton.disabled=emptyItemTiles().length===0;
  const s=game.selected;
  if(game.pendingPlacement){const pending=game.pendingPlacement;$('detail').innerHTML=`<strong>Rolled ${pending.roll} · ${CARDS[pending.type].name}</strong><br>Choose a glowing empty hex exactly ${pending.roll} steps from one of your active characters. This placement is committed.`}
  else if(s?.kind==='card'){const def=CARDS[p.hand[s.index]];$('detail').innerHTML=`<strong>${def.name}</strong><br>${def.description}<br><br><em>${def.kind==='unit'?'Choose a glowing hex to deploy.':emptyItemTiles().length?'Click Roll to place. This commits one action and the card.':'No free non-edge hexes. This item cannot be spent.'}</em>`}
  else if(s?.kind==='unit'){const u=game.units.find(u=>u.id===s.id),def=CARDS[u.type],resting=u.restUntil>=p.turns&&u.type==='ram';$('detail').innerHTML=`<strong>${def.name}</strong> · ${u.hp}/${def.hp} health · ${u.shield} shield<br>${def.description}${u.sword?'<br>⚔ +1 damage, -1 health when attacking.':''}${u.confused?'<br>↝ Next direction is reversed.':''}${resting?'<br>Resting: cannot act this turn and takes +1 damage.':''}<br><br><em>${resting?'Choose another card or unit.':'Choose a glowing hex to act.'}</em>`}
  else $('detail').textContent=game.actions?'Select a card to deploy, or one of your units to move and attack.':'No actions left. End the turn when ready.';
  $('log').replaceChildren(...game.log.map(line=>{const el=document.createElement('div');el.textContent=line;return el}));
  renderBoard();
}
$('board').addEventListener('click',e=>{const g=e.target.closest('.hex');if(g)selectHex(+g.dataset.q,+g.dataset.r)});
$('board').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){const g=e.target.closest('.hex');if(g){e.preventDefault();selectHex(+g.dataset.q,+g.dataset.r)}}});
$('endTurn').onclick=endTurn;
$('rollButton').onclick=rollItem;
$('newButton').onclick=()=>{if(confirm('Start a new battle? Your current game will be lost.'))newGame()};
$('rulesButton').onclick=()=>$('rulesDialog').showModal();
$('closeRules').onclick=()=>$('rulesDialog').close();
newGame();
