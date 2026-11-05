const DEFAULT_WIDTH = 8, DEFAULT_HEIGHT = 5, SVG = 'http://www.w3.org/2000/svg';
const DIRS = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
const NAMES = ['Azure Guild', 'Ember Order'];
const SHORT = ['Azure', 'Ember'];
const CARDS = {
  knight:{name:'Knight',icon:'♞',kind:'unit',hp:3,damage:1,description:'Moves or attacks 1 adjacent hex. A sturdy front-line fighter.'},
  archer:{name:'Archer',icon:'➶',kind:'unit',hp:2,damage:1,description:'Moves or attacks exactly 2 hexes along any of its 6 straight lines. No close-range move.'},
  ram:{name:'Battering Ram',icon:'🪵',kind:'unit',hp:4,damage:2,description:'Strikes all 3 hexes in a line, collecting items it crosses. May charge twice with Extra Attack before resting next turn.'},
  dragon:{name:'Dragon',icon:'♜',kind:'unit',hp:5,damage:2,description:'Breathes onto the 2 tiles ahead and the 2 flanking the far tile, then advances. Fire also hits your own army.'},
  blacksmith:{name:'Blacksmith',icon:'⚒',kind:'unit',hp:3,damage:1,description:'Moves 1 adjacent hex. On deployment, gives an adjacent ally 1 shield.'},
  thief:{name:'Thief',icon:'◆',kind:'unit',hp:2,damage:1,description:'Moves 1 adjacent hex. Steals 1 shield from an enemy it strikes.'},
  shield:{name:'Shield',icon:'◈',kind:'supply',description:'First unit to land here gains 1 shield, absorbing 1 damage.'},
  potion:{name:'Potion',icon:'✚',kind:'supply',description:'First unit to land here heals 2 health, up to its maximum.'},
  poison:{name:'Poison',icon:'☠',kind:'supply',description:'First unit to land here loses 1 health.'},
  extra:{name:'Extra Attack',icon:'✦',kind:'supply',description:'The first unit to land here stores one extra move or attack. It can act twice in a turn if you have actions left. Bonuses do not stack.'},
  confusion:{name:'Confusion',icon:'↝',kind:'supply',description:'The first unit to land here immediately returns to the hex it just came from.'},
  sword:{name:'Double-edge',icon:'⚔',kind:'supply',description:'First unit to land here gets +1 attack, but loses 1 health each time it attacks.'},
  fence:{name:'Fence',icon:'▥',kind:'terrain',description:'A 2-health barrier. Blocks movement until destroyed.'},
  bramble:{name:'Bramble',icon:'✤',kind:'terrain',description:'Deals 1 damage to the next unit entering this tile, then disappears.'},
  soup:{name:'Soup of Seeing',icon:'◉',kind:'consumable',description:'Use on one of your characters to reveal a snapshot of opponent items in its possible movement hexes until your turn ends. No die roll.'}
};
const DECK_LIST = ['knight','knight','knight','knight','archer','archer','archer','ram','ram','dragon','blacksmith','blacksmith','thief','thief','shield','shield','shield','potion','potion','poison','poison','extra','extra','confusion','confusion','sword','sword','fence','fence','bramble','bramble','soup','soup'];
const $ = id => document.getElementById(id);
let game;
let effectTimer=null, effectQueue=[];
let viewMode=(()=>{try{return sessionStorage.getItem('hex-battle-view')==='flat'?'flat':'isometric'}catch{return 'isometric'}})();

function shuffle(items){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function key(q,r){return `${q},${r}`}
function rowWidth(r){return game.width+(r%2)}
function inside(q,r){return r>=0&&r<game.height&&q>=0&&q<rowWidth(r)}
function onEdge(q,r,owner){return q===(owner===0?0:rowWidth(r)-1)}
// Longer rows extend half a hex on both sides of the shorter rows.
// Axial coordinates preserve straight hex movement across the stagger.
function axial(q,r){return [q-Math.ceil(r/2),r]}
function offset(a,r){return [a+Math.ceil(r/2),r]}
function walk(q,r,direction,distance=1){const [a,row]=axial(q,r),[da,dr]=DIRS[direction];return offset(a+da*distance,row+dr*distance)}
function hexDistance(q1,r1,q2,r2){const [a1]=axial(q1,r1),[a2]=axial(q2,r2),da=a1-a2,dr=r1-r2;return (Math.abs(da)+Math.abs(dr)+Math.abs(da+dr))/2}
function cell(q,r){return game.cells.get(key(q,r))}
function unitAt(q,r){return game.units.find(u=>u.hp>0&&u.q===q&&u.r===r)}
function player(){return game.players[game.active]}
function other(){return game.players[1-game.active]}
function say(message,secretOwner=null){game.log.unshift({message,secretOwner});game.log=game.log.slice(0,8)}
function queueEffect(message,{kind='item',target=null,attacker=null,label='✦'}={}){effectQueue.push({message,kind,target,attacker,label})}
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
function newPlayer(){const deckList=[...DECK_LIST];deckList.splice(deckList.indexOf('knight'),1);deckList.splice(deckList.indexOf('archer'),1);const deck=shuffle(deckList);const hand=['knight','archer',...deck.splice(0,3)];return {hand,deck,discard:[],score:0,turns:0}}
function newGame(actionAllowance=2,width=DEFAULT_WIDTH,height=DEFAULT_HEIGHT){clearEffects();game={width,height,cells:new Map(),units:[],players:[newPlayer(),newPlayer()],active:0,round:1,actionAllowance,actions:actionAllowance,maxActions:actionAllowance,selected:null,pendingPlacement:null,revealed:[new Set(),new Set()],log:[],nextId:1,winner:null};for(let r=0;r<height;r++)for(let q=0;q<rowWidth(r);q++)game.cells.set(key(q,r),{q,r,item:null});game.players[0].turns=1;say('The borderlands await. Azure deploys first.');$('overlay').classList.add('hidden');render()}
function drawCards(p,count){for(let i=0;i<count&&p.hand.length<7;i++){if(!p.deck.length){p.deck=shuffle(p.discard);p.discard=[]}if(!p.deck.length)break;p.hand.push(p.deck.pop())}}
function canActivate(u){return u.hp>0&&u.owner===game.active&&u.activations<2&&(u.activations===0||u.extraReady)&&!(u.type==='ram'&&u.restUntil===player().turns)}

function targetsForUnit(u){
  if(u.type==='ram'&&u.restUntil===game.players[u.owner].turns)return [];
  const options=[];
  if(u.type==='dragon'){
    const forward=u.owner===0?0:3,dir=forward;
    const click=walk(u.q,u.r,forward),destination=walk(u.q,u.r,dir);
    if(inside(...click)&&inside(...destination))options.push({click,dir,kind:'dragon'});
    return options;
  }
  const distance=u.type==='archer'?2:u.type==='ram'?3:1;
  for(let direction=0;direction<6;direction++){
    const click=walk(u.q,u.r,direction,distance),destination=click,[aq,ar]=destination;
    if(!inside(...click)||!inside(aq,ar))continue;
    if(unitAt(aq,ar)?.owner===u.owner)continue;
    options.push({click,dest:destination,direction,kind:u.type});
  }
  return options;
}
function validTiles(){
  if(game.pendingPlacement)return game.pendingPlacement.tiles.map(c=>key(c.q,c.r));
  if(!game.selected||game.actions<=0||game.winner!==null)return [];
  if(game.selected.kind==='unit'){const u=game.units.find(u=>u.id===game.selected.id);return canActivate(u)?targetsForUnit(u).map(t=>key(...t.click)):[]}
  const type=player().hand[game.selected.index],def=CARDS[type];
  if(def?.kind==='consumable')return soupUnits().map(u=>key(u.q,u.r));
  if(!def||def.kind!=='unit')return [];
  const results=[];
  for(const c of game.cells.values()){
    if(unitAt(c.q,c.r)||c.item)continue;
    if(def.kind==='unit'&&!onEdge(c.q,c.r,game.active))continue;
    results.push(key(c.q,c.r));
  }
  return results;
}
function emptyItemTiles(){return [...game.cells.values()].filter(c=>!onEdge(c.q,c.r,0)&&!onEdge(c.q,c.r,1)&&!unitAt(c.q,c.r)&&!c.item)}
function itemVisible(c,viewer=game.active){return !!c.item&&(c.item.owner===viewer||c.item.discoveredBy.includes(viewer)||game.revealed[viewer].has(key(c.q,c.r)))}
function soupUnits(){return game.units.filter(u=>u.hp>0&&u.owner===game.active&&targetsForUnit(u).length>0)}
function soupHexes(u){
  const targets=targetsForUnit(u),hexes=new Set(targets.map(t=>key(...t.click)));
  if(u.type==='ram')for(const target of targets)for(let i=1;i<=3;i++){const [q,r]=walk(u.q,u.r,target.direction,i);if(inside(q,r))hexes.add(key(q,r))}
  return hexes;
}
function useSoup(index,u){
  player().hand.splice(index,1);player().discard.push('soup');
  let found=0;
  for(const spot of soupHexes(u)){const c=game.cells.get(spot);if(c.item&&c.item.owner!==game.active&&!itemVisible(c)){found++;game.revealed[game.active].add(spot)}}
  say(`${SHORT[game.active]} uses Soup of Seeing on a ${CARDS[u.type].name}.`);
  say(`Soup of Seeing reveals ${found} hidden item${found===1?'':'s'}.`,game.active);
  queueEffect(`Soup of Seeing! ${CARDS[u.type].name} reveals ${found} hidden item${found===1?'':'s'}.`,{kind:'item',target:[u.q,u.r],label:'◉'});
  spendAction();
}
function placeItem(type,q,r){cell(q,r).item={type,hp:type==='fence'?2:undefined,owner:game.active,discoveredBy:[]};say(`${SHORT[game.active]} places ${CARDS[type].name} on the field.`,game.active)}
function rollItem(){
  if(game.pendingPlacement||game.selected?.kind!=='card'||game.actions<=0)return;
  const index=game.selected.index,type=player().hand[index];
  if(!type||CARDS[type].kind==='unit'||CARDS[type].kind==='consumable')return;
  const empty=emptyItemTiles();if(!empty.length)return;
  const roll=Math.floor(Math.random()*6)+1;
  const active=game.units.filter(u=>u.hp>0&&u.owner===game.active&&!(u.type==='ram'&&u.restUntil===player().turns));
  const eligible=roll===1?[]:empty.filter(c=>active.some(u=>hexDistance(u.q,u.r,c.q,c.r)===roll));
  player().hand.splice(index,1);player().discard.push(type);game.selected=null;
  spendAction();say(`${SHORT[game.active]} rolls a ${roll} for ${CARDS[type].name}.`,game.active);
  if(eligible.length){game.pendingPlacement={type,roll,tiles:eligible};say(`Choose a glowing hex exactly ${roll} steps from an active character.`,game.active)}
  else{const c=empty[Math.floor(Math.random()*empty.length)];placeItem(type,c.q,c.r);say(roll===1?'A roll of 1 places the item randomly.':'No eligible hex; the item is placed randomly.',game.active)}
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
    if(selected.kind==='card'){
      if(player().hand[selected.index]==='soup')useSoup(selected.index,occupant);
      else playCard(selected.index,q,r);
    }
    else activate(game.units.find(u=>u.id===selected.id),q,r);
    game.selected=null;render();return;
  }
  if(occupant&&occupant.owner===game.active){game.selected=selected?.kind==='unit'&&selected.id===occupant.id?null:{kind:'unit',id:occupant.id};render();return}
  game.selected=null;render();
}
function spendAction(){game.actions--;if(game.actions<=0)say(`${SHORT[game.active]} is out of actions. End the turn when ready.`)}
function playCard(index,q,r){
  const p=player(),type=p.hand.splice(index,1)[0],def=CARDS[type];p.discard.push(type);
  const u={id:game.nextId++,type,owner:game.active,q,r,hp:def.hp,shield:0,extraReady:false,activations:0,restUntil:0,breached:false};game.units.push(u);
  say(`${SHORT[game.active]} deploys a ${def.name}.`);
  if(type==='blacksmith'){const ally=game.units.find(a=>a.id!==u.id&&a.owner===u.owner&&DIRS.some((_,direction)=>{const [x,y]=walk(q,r,direction);return a.q===x&&a.r===y}));if(ally){ally.shield++;say(`The blacksmith shields an allied ${CARDS[ally.type].name}.`)}}
  spendAction();
}
function damageUnit(target,amount,attacker,source,attackerPosition=null){
  if(target.hp<=0)return;
  const ownerTurn=game.players[target.owner].turns;
  if(target.type==='ram'&&(target.restUntil===ownerTurn||(target.restUntil>ownerTurn&&game.active!==target.owner)))amount++;
  const absorbed=Math.min(target.shield,amount);target.shield-=absorbed;amount-=absorbed;
  if(absorbed)queueEffect(`Shield! ${CARDS[target.type].name} blocks ${absorbed} damage.`,{kind:'shield',target:[target.q,target.r],attacker:attackerPosition,label:'◈'});
  if(amount)queueEffect(`${CARDS[target.type].name} takes ${amount} damage${source?' from '+source:''}!`,{kind:'hit',target:[target.q,target.r],attacker:attackerPosition,label:`−${amount}`});
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
    damageUnit(target,damage,attacker.owner,source,[attacker.q,attacker.r]);
  }
  if(c.item?.type==='fence'){
    if(!c.item.discoveredBy.includes(attacker.owner))c.item.discoveredBy.push(attacker.owner);
    c.item.hp-=damage;
    if(c.item.hp<=0){c.item=null;say('A fence is smashed apart.');queueEffect('Fence smashed! The path is clear.',{kind:'hit',target:[q,r],attacker:[attacker.q,attacker.r],label:'▥'})}
    else{say('A fence absorbs the blow.');queueEffect('Fence! The barrier blocks the attack.',{kind:'shield',target:[q,r],attacker:[attacker.q,attacker.r],label:'▥'})}
  }
}
function land(u,q,r){
  if(u.hp<=0||unitAt(q,r)||cell(q,r).item?.type==='fence')return {entered:false,bounced:false};
  const previous=[u.q,u.r];
  u.q=q;u.r=r;
  const c=cell(q,r),item=c.item;
  let bounced=false;
  if(item){
    c.item=null;const name=CARDS[item.type].name;
    say(`${SHORT[u.owner]}'s ${CARDS[u.type].name} claims ${name}.`);
    switch(item.type){
      case 'shield':u.shield++;queueEffect(`Shield! ${CARDS[u.type].name} gains protection.`,{kind:'item',target:[q,r],label:'◈'});break;
      case 'potion':{
        const healed=Math.min(2,CARDS[u.type].hp-u.hp);u.hp+=healed;
        queueEffect(`Potion! ${CARDS[u.type].name} heals ${healed} health.`,{kind:'item',target:[q,r],label:`+${healed}`});break;
      }
      case 'poison':case 'bramble':queueEffect(`${name}! ${CARDS[u.type].name} is hurt.`,{kind:'item',target:[q,r],label:'☠'});damageUnit(u,1,null,name);break;
      case 'extra':
        if(u.extraReady){say(`${CARDS[u.type].name} already holds an Extra Attack; the second one is lost.`);queueEffect(`Extra Attack! ${CARDS[u.type].name} already holds one.`,{kind:'item',target:[q,r],label:'✦'})}
        else{u.extraReady=true;queueEffect(u.activations>=2?`Extra Attack! ${CARDS[u.type].name} saves a bonus for a future turn.`:`Extra Attack! ${CARDS[u.type].name} may act twice if actions remain.`,{kind:'item',target:[q,r],label:'✦'})}
        break;
      case 'confusion':u.q=previous[0];u.r=previous[1];bounced=true;say(`${CARDS[u.type].name} returns to its previous hex!`);queueEffect(`Confusion! The ${CARDS[u.type].name} returns to its previous hex.`,{kind:'item',target:[q,r],label:'↝'});break;
      case 'sword':u.sword=true;queueEffect(`Double-edge! ${CARDS[u.type].name} gains attack power at a cost.`,{kind:'item',target:[q,r],label:'⚔'});break;
    }
  }
  if(u.hp>0&&!u.breached&&onEdge(u.q,u.r,1-u.owner)){
    u.breached=true;game.players[u.owner].score+=2;say(`${SHORT[u.owner]}'s ${CARDS[u.type].name} breaks through! +2 glory.`);checkWin();
  }
  return {entered:true,bounced};
}
function attackCost(u){if(u.sword&&u.hp>0){say('The double-edged sword wounds its wielder.');damageUnit(u,1,null,'the sword')}}
function activate(u,q,r){
  if(!canActivate(u)||game.actions<=0)return;
  const move=targetsForUnit(u).find(t=>t.click[0]===q&&t.click[1]===r);if(!move)return;
  u.activations++;
  if(u.activations===2){u.extraReady=false;say(`${CARDS[u.type].name} uses its stored Extra Attack.`)}
  if(u.type==='dragon'){
    const near=walk(u.q,u.r,move.dir),far=walk(u.q,u.r,move.dir,2);
    const flanks=move.dir===0?[walk(...far,2),walk(...far,4)]:[walk(...far,1),walk(...far,5)];
    const tiles=[near,far,...flanks];
    say(`${SHORT[u.owner]}'s dragon breathes fire!`);
    for(const [x,y] of tiles)if(inside(x,y))hitTile(u,x,y,CARDS[u.type].damage+(u.sword?1:0),true,'dragon fire');
    attackCost(u);land(u,...near);
  }else if(u.type==='ram'){
    say(`${SHORT[u.owner]}'s ram charges down the line!`);
    const origin=[u.q,u.r];let traveling=true;
    for(let i=1;i<=3;i++){
      const [x,y]=walk(...origin,move.direction,i);
      if(!inside(x,y))break;
      if(unitAt(x,y)?.owner!==u.owner)hitTile(u,x,y,CARDS[u.type].damage+(u.sword?1:0),false,'the ram');
      if(traveling){
        if(cell(x,y).item?.type==='fence'||unitAt(x,y))traveling=false;
        else if(land(u,x,y).bounced)traveling=false;
      }
      if(u.hp<=0)break;
    }
    attackCost(u);
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
function checkWin(){for(let i=0;i<2;i++)if(game.players[i].score>=6&&game.winner===null){game.winner=i;say(`${NAMES[i]} wins the battle!`);showOverlay('VICTORY',`${NAMES[i]} wins!`,`The borderlands belong to ${SHORT[i]}. Play another battle?`,'Play again',()=>openSetup())}}
function endTurn(){if(game.winner!==null||game.pendingPlacement)return;clearEffects();game.selected=null;game.revealed[game.active].clear();game.active=1-game.active;if(game.active===0)game.round++;game.actions=game.actionAllowance;game.maxActions=game.actionAllowance;const p=player();p.turns++;for(const u of game.units)if(u.owner===game.active)u.activations=0;drawCards(p,2);say(`${SHORT[game.active]}'s turn begins. ${game.actionAllowance} actions available; 2 cards drawn.`);render();showOverlay('PASS THE SCREEN',`${NAMES[game.active]}'s turn`,`Hand the device to ${SHORT[game.active]}. Their hand stays hidden until they are ready.`,'Ready to play',()=>{$('overlay').classList.add('hidden');render()})}
function showOverlay(kicker,title,body,button,action){$('overlayKicker').textContent=kicker;$('overlayTitle').textContent=title;$('overlayBody').textContent=body;$('overlayButton').firstChild.textContent=button+' ';$('overlayButton').onclick=action;$('overlay').classList.remove('hidden')}
function openSetup(initial=false){$('actionAllowance').value=String(game.actionAllowance);$('boardRows').value=String(game.height);$('boardWidth').value=String(game.width);$('cancelSetup').classList.toggle('hidden',initial);$('setupDialog').showModal()}

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
  const p=player(),name=NAMES[game.active];
  $('blueScore').textContent=game.players[0].score;$('redScore').textContent=game.players[1].score;
  $('turnLabel').textContent=`${SHORT[game.active]}'s turn`;$('roundLabel').textContent=`Round ${game.round}`;
  $('turnCount').textContent=String(p.turns).padStart(2,'0');$('activeName').textContent=name;
  $('actionText').textContent=`${game.actions} action${game.actions===1?'':'s'} remaining`;
  $('actionPips').replaceChildren(...Array.from({length:game.maxActions},(_,i)=>{const el=document.createElement('i');if(i>=game.actions)el.className='spent';return el}));
  $('deckCount').textContent=`Deck: ${p.deck.length}`;
  $('hand').replaceChildren(...p.hand.map((type,i)=>{const def=CARDS[type],b=document.createElement('button');b.className=`card ${def.kind} ${game.selected?.kind==='card'&&game.selected.index===i?'selected':''}`;b.innerHTML=`<span class="card-top"><span class="symbol">${def.icon}</span><span class="card-kind">${def.kind}</span></span><strong>${def.name}</strong><span class="stats">${def.kind==='unit'?`${def.hp} health · ${def.damage} damage`:def.kind==='consumable'?'Use on a character':'Roll to place'}</span>`;b.setAttribute('aria-label',`${def.name}. ${def.description}`);b.disabled=!!game.pendingPlacement;b.onclick=()=>selectCard(i);return b}));
  $('endTurn').disabled=!!game.pendingPlacement;
  const rollButton=$('rollButton');rollButton.classList.toggle('hidden',game.selected?.kind!=='card'||!['terrain','supply'].includes(CARDS[p.hand[game.selected?.index]]?.kind)||!!game.pendingPlacement);
  rollButton.disabled=emptyItemTiles().length===0;
  const s=game.selected;
  if(game.pendingPlacement){const pending=game.pendingPlacement;$('detail').innerHTML=`<strong>Rolled ${pending.roll} · ${CARDS[pending.type].name}</strong><br>Choose a glowing empty hex exactly ${pending.roll} steps from one of your active characters. This placement is committed.`}
  else if(s?.kind==='card'){const def=CARDS[p.hand[s.index]];$('detail').innerHTML=`<strong>${def.name}</strong><br>${def.description}<br><br><em>${def.kind==='unit'?'Choose a glowing hex to deploy.':def.kind==='consumable'?(soupUnits().length?'Choose one of your glowing characters. No die roll needed.':'No character with a possible move can use Soup right now.'):emptyItemTiles().length?'Click Roll to place. This commits one action and the card.':'No free non-edge hexes. This item cannot be spent.'}</em>`}
  else if(s?.kind==='unit'){
    const u=game.units.find(u=>u.id===s.id),def=CARDS[u.type],resting=u.restUntil===p.turns&&u.type==='ram';
    const status=resting?'Resting this turn.':u.activations===2?'Already acted twice this turn.':u.activations===1?(u.extraReady?'One extra activation available.':'Already acted this turn.'):'Normal activation available.';
    $('detail').innerHTML=`<strong>${def.name}</strong> · ${u.hp}/${def.hp} health · ${u.shield} shield<br>${def.description}<br><strong>${status}</strong>${u.extraReady?'<br>✦ Extra Attack stored until used.':''}${u.sword?'<br>⚔ +1 damage, -1 health when attacking.':''}<br><br><em>${canActivate(u)&&game.actions>0?'Choose a glowing hex to act.':'Choose another card or unit.'}</em>`;
  }
  else $('detail').textContent=game.actions?'Select a card to deploy, or one of your units to move and attack.':'No actions left. End the turn when ready.';
  $('log').replaceChildren(...game.log.filter(line=>line.secretOwner===null||line.secretOwner===game.active).map(line=>{const el=document.createElement('div');el.textContent=line.message;return el}));
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
$('setupForm').onsubmit=e=>{e.preventDefault();const allowance=Number($('actionAllowance').value),height=Number($('boardRows').value),width=Number($('boardWidth').value);if(!Number.isInteger(allowance)||allowance<1||allowance>5||!Number.isInteger(height)||height<5||height>9||!Number.isInteger(width)||width<6||width>12)return;$('setupDialog').close();newGame(allowance,width,height)};
$('rulesButton').onclick=()=>$('rulesDialog').showModal();
$('closeRules').onclick=()=>$('rulesDialog').close();
newGame();
openSetup(true);
