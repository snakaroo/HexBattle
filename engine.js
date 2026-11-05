(() => {
const DEFAULT_WIDTH = 8, DEFAULT_HEIGHT = 5;
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

const HexEngine = (() => {
function shuffle(items){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function key(q,r){return `${q},${r}`}
function createGame(actionAllowance=2,width=DEFAULT_WIDTH,height=DEFAULT_HEIGHT){
  let game, effects=[];
  function queueEffect(message,options={}){effects.push({message,...options})}
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
function newPlayer(){const deckList=[...DECK_LIST];deckList.splice(deckList.indexOf('knight'),1);deckList.splice(deckList.indexOf('archer'),1);const deck=shuffle(deckList);const hand=['knight','archer',...deck.splice(0,5)];return {hand,deck,discard:[],score:0,turns:0}}
function newGame(actionAllowance=2,width=DEFAULT_WIDTH,height=DEFAULT_HEIGHT){effects=[];game={width,height,cells:new Map(),units:[],players:[newPlayer(),newPlayer()],active:0,round:1,actionAllowance,actions:actionAllowance,maxActions:actionAllowance,selected:null,pendingPlacement:null,revealed:[new Set(),new Set()],log:[],nextId:1,winner:null};for(let r=0;r<height;r++)for(let q=0;q<rowWidth(r);q++)game.cells.set(key(q,r),{q,r,item:null});game.players[0].turns=1;say('The borderlands await. Azure deploys first.');}
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
}

function selectCard(index){if(!Number.isInteger(index)||index<0||index>=player().hand.length||game.pendingPlacement||game.actions<=0||game.winner!==null)return;game.selected=game.selected?.kind==='card'&&game.selected.index===index?null:{kind:'card',index}}
function selectHex(q,r){
  if(!Number.isInteger(q)||!Number.isInteger(r)||!inside(q,r))return;
  if(game.winner!==null)return;
  if(game.pendingPlacement){
    if(validTiles().includes(key(q,r))){placeItem(game.pendingPlacement.type,q,r);game.pendingPlacement=null}
    return;
  }
  const occupant=unitAt(q,r),selected=game.selected;
  if(selected&&game.actions>0&&validTiles().includes(key(q,r))){
    if(selected.kind==='card'){
      if(player().hand[selected.index]==='soup')useSoup(selected.index,occupant);
      else playCard(selected.index,q,r);
    }
    else activate(game.units.find(u=>u.id===selected.id),q,r);
    game.selected=null;return;
  }
  if(occupant&&occupant.owner===game.active){game.selected=selected?.kind==='unit'&&selected.id===occupant.id?null:{kind:'unit',id:occupant.id};return}
  game.selected=null;
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
function checkWin(){for(let i=0;i<2;i++)if(game.players[i].score>=6&&game.winner===null){game.winner=i;say(`${NAMES[i]} wins the battle!`)}}
function endTurn(){if(game.winner!==null||game.pendingPlacement)return;effects=[];game.selected=null;game.revealed[game.active].clear();game.active=1-game.active;if(game.active===0)game.round++;game.actions=game.actionAllowance;game.maxActions=game.actionAllowance;const p=player();p.turns++;for(const u of game.units)if(u.owner===game.active)u.activations=0;drawCards(p,2);say(`${SHORT[game.active]}'s turn begins. ${game.actionAllowance} actions available; 2 cards drawn.`)}
  newGame(actionAllowance,width,height);
  return {get state(){return game},newGame,selectCard,selectHex,rollItem,endTurn,validTiles,itemVisible,emptyItemTiles,canActivate,targetsForUnit,soupUnits,cell,unitAt,player,takeEffects(){return effects.splice(0)},loadState(state){game=decodeState(state)}};
}
function encodeState(state){return {...state,cells:[...state.cells],revealed:state.revealed.map(set=>[...set])}}
function decodeState(state){return {...state,cells:new Map(state.cells),revealed:state.revealed.map(items=>new Set(items))}}
function project(state,seat){
  const visible=c=>!c.item||c.item.owner===seat||c.item.discoveredBy.includes(seat)||state.revealed[seat].has(`${c.q},${c.r}`);
  const cells=[...state.cells].map(([spot,c])=>[spot,{...c,item:visible(c)?c.item:null}]);
  const pending=state.pendingPlacement;
  // Do not disclose the authoritative list of vacant tiles: it would reveal hidden traps.
  const publicTiles=pending&&seat===state.active?[...state.cells.values()].filter(c=>{
    if(onEdgeFor(state,c.q,c.r,0)||onEdgeFor(state,c.q,c.r,1)||state.units.some(u=>u.hp>0&&u.q===c.q&&u.r===c.r)||visible(c)&&c.item)return false;
    const a=c.q-Math.ceil(c.r/2),b=u=>u.q-Math.ceil(u.r/2);
    return state.units.some(u=>u.hp>0&&u.owner===seat&&!(u.type==='ram'&&u.restUntil===state.players[seat].turns)&&(Math.abs(a-b(u))+Math.abs(c.r-u.r)+Math.abs(a-b(u)+c.r-u.r))/2===pending.roll);
  }).map(c=>({q:c.q,r:c.r})):[];
  return encodeState({...state,cells:new Map(cells),players:state.players.map((p,i)=>({hand:i===seat?[...p.hand]:[],deck:Array(i===seat?p.deck.length:0).fill(null),discard:[],score:p.score,turns:p.turns})),selected:seat===state.active?state.selected:null,pendingPlacement:pending&&seat===state.active?{type:pending.type,roll:pending.roll,tiles:publicTiles}:null,revealed:[new Set(),new Set()],log:state.log.filter(line=>line.secretOwner===null||line.secretOwner===seat)});
}
function onEdgeFor(state,q,r,owner){return q===(owner===0?0:state.width+(r%2)-1)}
return {createGame,encodeState,decodeState,project,CARDS,NAMES,SHORT,DEFAULT_WIDTH,DEFAULT_HEIGHT};
})();
if(typeof module!=='undefined')module.exports=HexEngine;
else globalThis.HexEngine=HexEngine;
})();
