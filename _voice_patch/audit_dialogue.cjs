const fs = require('fs');
const vm = require('vm');
const crypto = require('crypto');
const baselinePath = process.argv[2] || 'Science_at_Home_V8.html';
const originalHTML = fs.readFileSync(baselinePath, 'utf8');
const source = originalHTML.split('<script>')[1].split('</script>')[0];
const captures = [];
const nodes = new Map();
const listeners = {};
function node() {
  return {innerHTML:'',textContent:'',dataset:{},style:{setProperty(){}},
    classList:{add(){},remove(){},toggle(){}},remove(){},append(){},
    offsetTop:0,offsetHeight:100,clientHeight:100,disabled:false};
}
const document = {
  body:node(),documentElement:node(),
  querySelector(selector) {if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector)},
  querySelectorAll(){return []},createElement:node,
  addEventListener(k,f){(listeners[k]||=[]).push(f)},dispatchEvent(){}
};
let js = source;
const oldOe = js.slice(js.indexOf('function Oe(y,E,P=!0,Y="Me")'),js.indexOf('function et(y,E="Me")'));
js = js.replace(oldOe,`function Oe(y,E,P=!0,Y="Me"){
 if(P)(Array.isArray(y)?y:[y]).filter(Boolean).forEach((text,part)=>globalThis.capture(kt(text),Y,{group:c.group,phase:c.phase,scene:c.scene,step:c.step,type:c.activeType,review:c.reviewIndex,challenge:c.challengeIndex,discovery:c.discovery,kind:"automatic",part}));
 E?.();
}`);
js = js.replace('function et(y,E="Me"){return','function et(y,E="Me"){globalThis.capture(kt(y),E,{group:c.group,phase:c.phase,scene:c.scene,step:c.step,type:c.activeType,review:c.reviewIndex,challenge:c.challengeIndex,discovery:c.discovery,kind:"replay"});return');
const start = js.indexOf('i("#loading")?.remove(),t.has("board")');
const end = js.indexOf('setInterval(Rt,100)',start)+'setInterval(Rt,100)'.length;
js = js.slice(0,start)+`globalThis.audit={
 get state(){return c},get sequence(){return f},get data(){return {Qe,Rn,At,ji}},
 reset(group){u.group=group;c=ce();c.started=true},
 scene:Q,step(index){c.step=index;$t()},
 tutorial(step){c.phase="tutorial";c.step=step;N()},
 forced:T,explore:O,discovery:Je,
 review(index){c.reviewIndex=index;F()},
 challenge(index){c.challengeIndex=index;ie()},
 finish:ve,teacher:Xt,
 extra(type){f=[{type}];c.step=0;c.phase="scene";$t()},
 say:Oe
}`+js.slice(end);
const context={console,document,window:{},location:{search:'',pathname:'/'},
 localStorage:{getItem(){return null},setItem(){},removeItem(){}},
 URLSearchParams,performance:{now:()=>1},innerWidth:1280,innerHeight:720,
 setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,addEventListener(){},
 capture(text,speaker,event){if(text)captures.push({text,speaker,event})}
};
vm.createContext(context);vm.runInContext(js,context);
const a=context.audit;
function click(action, values={}) {
 const target={dataset:{action,...values},disabled:false,closest(){return this}};
 for(const f of listeners.click||[]) f({target});
}
for(let group=1;group<=6;group++) {
 a.reset(group);
 for(let step=0;step<5;step++) a.tutorial(step);
 for(let scene=0;scene<5;scene++) {
   a.scene(scene);
   for(let step=0;step<a.sequence.length;step++) a.step(step);
   a.extra('gold-offer');a.extra('gold');
   a.extra('share');click('share-reply');
   a.forced();
 }
 a.explore();
 for(let i=0;i<a.data.ji.length;i++) {
   a.discovery(i,0);click('discovery-answer',{part:'0',value:'wrong'});
   a.discovery(i,1);click('discovery-answer',{part:'1',value:String(a.data.ji[i].answer)});
 }
 for(let i=0;i<6;i++)a.review(i);
 for(let i=0;i<6;i++)a.challenge(i);
 a.finish(false);a.finish(true);
 for(let i=0;i<5;i++)click('poster',{value:String(i)});
 for(let i=0;i<5;i++)click('replay',{index:String(i)});
 for(let i=0;i<7;i++){a.teacher.signIndex=i;a.teacher.teacherAction('sign-answer',{dataset:{}})}
}
// Teacher voice-test lines are part of the existing audio surface.
const tests={Question:'Look carefully at the evidence.',Me:'I am ready to explore!',Grandma:'Salam, my dear!',Grandpa:'You think like scientists!',Mom:'Come and help me, my dear.',Dad:'Let us look at the old gate.',Brother:'My drink has bubbles too.',Sister:'Look! My ice is melting.',Saqr:'Check my idea using the evidence.'};
for(const [speaker,text] of Object.entries(tests))captures.push({speaker,text,event:{kind:'teacher-test'}});
const clips={},lookup={},events={};
const slug={Me:'mariam',Grandma:'grandma',Grandpa:'grandpa',Mom:'mother',Dad:'father',Brother:'brother',Sister:'sister',Question:'narrator',Saqr:'saqr'};
for(const line of captures) {
 const key=JSON.stringify([line.speaker,line.text]);
 const id=slug[line.speaker]+'_'+crypto.createHash('sha256').update(key).digest('hex').slice(0,20);
 if(clips[id]&&JSON.stringify([clips[id].speaker,clips[id].text])!==key)throw Error('ID collision');
 clips[id] ||= {id,speaker:line.speaker,text:line.text,src:`audio/${slug[line.speaker]}/${id}.mp3`,status:'pending-recording'};
 lookup[key]=id;
 const eventId=crypto.createHash('sha256').update(JSON.stringify({...line.event,clipId:id})).digest('hex').slice(0,24);
 events[eventId] ||= {...line.event,id:'event_'+eventId,clipId:id};
}
const manifest={schema:1,ready:false,baselineGitBlob:'481e9a93f248444b692c03f8ab0b82cf0441befd',cast:Object.fromEntries(Object.keys(slug).map(k=>[k,{name:slug[k],status:'pending-casting'}])),clips,lookup,tests:Object.fromEntries(Object.entries(tests).map(([speaker,text])=>[speaker,lookup[JSON.stringify([speaker,text])]]))};

fs.writeFileSync(__dirname+'/dialogue-manifest.json',JSON.stringify(manifest,null,2));
fs.writeFileSync(__dirname+'/dialogue-events.json',JSON.stringify(Object.values(events),null,2));
const bySpeaker={};for(const clip of Object.values(clips))bySpeaker[clip.speaker]=(bySpeaker[clip.speaker]||0)+1;
console.log(JSON.stringify({uniqueClips:Object.keys(clips).length,events:Object.keys(events).length,captured:captures.length,bySpeaker},null,2));
