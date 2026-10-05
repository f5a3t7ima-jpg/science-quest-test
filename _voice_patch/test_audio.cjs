const fs = require('fs');
const vm = require('vm');
const assert = require('node:assert/strict');
let now = 0, timerId = 0;
const timers = new Map();
const clock={
 setTimeout(fn,delay){const id=++timerId;timers.set(id,{fn,time:now+delay});return id},
 setInterval(fn,delay){const id=++timerId;timers.set(id,{fn,time:now+delay,interval:delay});return id},
 clearTimeout(id){timers.delete(id)},clearInterval(id){timers.delete(id)}
};
function advance(ms,onTick=()=>{}) {
 const end=now+ms;
 while(true){const entry=[...timers].filter(([,t])=>t.time<=end).sort((a,b)=>a[1].time-b[1].time)[0];if(!entry)break;
  const [id,t]=entry;now=t.time;onTick(now);if(t.interval)t.time+=t.interval;else timers.delete(id);t.fn();
 }now=end;
}
class FakeAudio {
 constructor(){this.src='';this.currentTime=0;this.paused=true;this.ended=false;this.plays=0;this.loads=0}
 setAttribute(){}removeAttribute(){this.src=''}load(){this.loads++;this.currentTime=0;this.ended=false}
 play(){this.paused=false;this.plays++;return this.reject ? Promise.reject(this.reject) : Promise.resolve()}
 pause(){this.paused=true}
 start(){this.onplaying?.()}
 end(){this.ended=true;this.onended?.()}
}
const warnings=[];
const context={...clock,Date:{now:()=>now},console:{warn(...args){warnings.push(args)}},Audio:FakeAudio};
vm.createContext(context);
vm.runInContext(fs.readFileSync(__dirname+'/recorded-dialogue.js','utf8')+';globalThis.Manager=RecordedDialogueAudio',context);
const manifest=JSON.parse(fs.readFileSync(__dirname+'/dialogue-manifest.json','utf8'));
// These are controller fixtures only; no fake audio files are made or shipped.
manifest.ready=true;for(const c of Object.values(manifest.clips))c.status='ready';
const all=Object.values(manifest.clips),first=all.find(c=>c.speaker==='Grandma'),second=all.find(c=>c.speaker==='Me');
const audio=new FakeAudio();let muted=false,completed=0;
const manager=new context.Manager(manifest,{audio,muted:()=>muted,createPreload:()=>new FakeAudio()});
function speak(clip=first){manager.speak(clip.text,clip.speaker,()=>completed++,'test.'+clip.id)}
(async()=>{
 await manager.unlock();assert.equal(manager.unlocked,true);assert.equal(audio.paused,true);
 speak();audio.start();advance(6500,t=>audio.currentTime=t/1000);assert.ok(manager.current,'Long line must still be busy after four seconds');assert.equal(completed,0);
 audio.end();assert.equal(completed,1);assert.equal(manager.current,null);assert.equal(timers.size,0);
 speak();audio.start();const staleEnd=audio.onended,staleError=audio.onerror;speak(second);audio.start();staleEnd();staleError();assert.equal(manager.current.clipId,second.id);assert.equal(completed,1);
 const count=audio.plays;manager.replay();assert.equal(audio.plays,count+1);assert.equal(manager.current.clipId,second.id);assert.equal(audio.src,second.src);
 manager.stop();assert.equal(timers.size,0);assert.equal(audio.paused,true);assert.equal(audio.onended,null);
 speak();audio.onerror();assert.equal(manager.current,null);assert.equal(completed,2);assert.ok(manager.lastFailure);
 speak();advance(10001);assert.equal(manager.current,null);assert.equal(completed,3);
 speak();audio.start();advance(13500);assert.equal(manager.current,null);assert.equal(completed,4);
 audio.reject={name:'NotAllowedError'};speak();await Promise.resolve();assert.equal(manager.current,null);assert.equal(completed,5);delete audio.reject;
 muted=true;speak();assert.equal(manager.current,null);assert.equal(completed,6);muted=false;
 manager.speak('missing line','Me',()=>completed++);assert.equal(completed,7);assert.equal(manager.current,null);
 for(let i=0;i<all.length;i+=2){manager.preloadDialogue(all.slice(i,i+4));assert.ok(manager.preloads.size<=2)}
 manager.cleanup();assert.equal(manager.preloads.size,0);assert.equal(timers.size,0);
 for(const clip of all)assert.equal(manager.resolve(clip.text,clip.speaker).id,clip.id);
 console.log('PASS: long speech, completion, stale callbacks, overlap prevention, replay, cancellation, media error, load timeout, stall timeout, autoplay rejection, mute, missing clip, bounded preload and all 140 mappings.');
 const html=fs.readFileSync(__dirname+'/draft.html','utf8');new vm.Script(html.split('<script>')[1].split('</script>')[0]);
 assert.ok(!html.includes('speechSynthesis')&&!html.includes('SpeechSynthesisUtterance'));console.log('PASS: patched JavaScript parses; no browser TTS dependencies.');
})().catch(e=>{console.error(e);process.exitCode=1});
