"""Apply a narrowly scoped audio patch to the exact approved V8 bytes.

Default builds fail closed until all real recordings are present and verified.
--draft creates a local development copy only; it must never be deployed.
"""
import argparse
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('baseline', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('--draft', action='store_true')
args = parser.parse_args()
root = Path(__file__).resolve().parent
baseline = args.baseline.read_bytes()
expected = '481e9a93f248444b692c03f8ab0b82cf0441befd'
actual = hashlib.sha1(b'blob '+str(len(baseline)).encode()+b'\0'+baseline).hexdigest()
assert actual == expected, 'Baseline is not the approved attached V8; inspect before changing it.'
manifest = json.loads((root/'dialogue-manifest.json').read_text())
if not args.draft:
    assert manifest['ready'], 'Real character recordings and casting are still pending.'
    for clip in manifest['clips'].values():
        assert clip['status'] == 'ready', f"Missing recording: {clip['id']}"
        audio = root/clip['src']
        assert audio.is_file() and audio.stat().st_size > 1000, f'Missing or empty asset: {audio}'
        assert hashlib.sha256(audio.read_bytes()).hexdigest() == clip['sha256'], f'Changed asset: {audio}'
        assert clip['duration'] > 0 and clip.get('verified'), f"Unverified audio: {clip['id']}"

s = baseline.decode('utf8')
edits = []
def replace(old, new, reason):
    global s
    assert s.count(old) == 1, f'Ambiguous patch target: {reason}'
    edits.append({'reason':reason,'old':old,'new':new})
    s = s.replace(old,new)

start = s.index('gl=class{')
end = s.index(',xl=class',start)
manager = (root/'recorded-dialogue.js').read_text()
manager = manager[manager.index('class RecordedDialogueAudio'):].replace('class RecordedDialogueAudio','class',1).rstrip()
replace(s[start:end], 'voiceManifest='+json.dumps(manifest,ensure_ascii=True,separators=(',',':'))+',gl='+manager, 'Replace only the voice manager and add its recording catalogue')
replace('new gl(window.speechSynthesis,window.SpeechSynthesisUtterance,{','new gl(voiceManifest,{','Remove installed-voice dependency')
replace(',document.body.classList.toggle("voice-unavailable",!!Fe?.lastFailure)','', 'Keep failures quiet and preserve text/replay')
start = s.index('.voice-unavailable .speech-bubble:before{')
end = s.index('}',start)+1
replace(s[start:end],'','Remove obsolete voice error banner only')

context = '''function voiceLineId(text,speaker,part=0){
 let clip=Fe.resolve(text,speaker);
 return ["v8",c.group,c.phase,Qe[c.scene]?.id||"home",c.activeType||"",c.step,c.reviewIndex,c.challengeIndex,c.discovery??"",clip?.id||"missing",part].join(".");
}
function voicePreload(){
 let lines=[];
 if(c.phase==="tutorial")lines=[{text:"Come down, my dear!",speaker:"Grandma"},{text:"Coming, Grandma!",speaker:"Me"}];
 else if(c.phase==="review")lines=H.slice(c.reviewIndex+1,c.reviewIndex+3).map(text=>({text,speaker:"Question"}));
 else if(c.phase==="challenge")lines=ih[c.group-1].slice(c.challengeIndex+1,c.challengeIndex+3).map(code=>{let q=sh(c.group,code);return{text:kt(q.text+(q.sub?" "+q.sub.replaceAll("\\n"," "):"")),speaker:"Question"}});
 else if(te())for(let step of f.slice(c.step+1)){
  let scene=Qe[c.scene],line;
  if(step.type==="line")line={text:step.text,speaker:step.speaker};
  else if(["reply","reply-shown"].includes(step.type))line={text:step.text,speaker:"Me"};
  else if(step.type==="conclude")line={text:scene.conclude,speaker:"Me"};
  else if(step.type==="notice")line={text:"Hmm… it is not the same!",speaker:"Me"};
  else if(step.type==="twin-line")line={text:Rn[step.twin].line,speaker:Rn[step.twin].family};
  else if(step.type==="twin-rule")line={text:Rn[step.twin].reason,speaker:"Me"};
  if(line)lines.push(line);if(lines.length===2)break;
 }
 Fe.preloadDialogue(lines.map(line=>({...line,text:kt(line.text)})));
}
'''
old = s[s.index('function Oe(y,E,P=!0,Y="Me")'):s.index('function k(y)')]
new = '''function Oe(y,E,P=!0,Y="Me",lineId=""){
 Ue();if(!P){E?.();return}
 let lines=(Array.isArray(y)?y:[y]).filter(Boolean),index=0;
 const next=()=>{if(index>=lines.length){E?.();return}
  const part=index++,text=kt(lines[part]);
  Fe.speak(text,Y,next,lineId||voiceLineId(text,Y,part));
 };
 next();voicePreload();
}
function et(y,E="Me"){
 return `<button class="read-one" data-action="read-line" data-speaker="${s(E)}" data-text="${s(y)}" data-line-id="${s(voiceLineId(kt(y),E))}" aria-label="Replay this sentence">${fn("sound",23)}</button>`;
}
'''
replace(old,context+new,'Map stable event IDs to speaker-specific recordings and preload two likely lines')
replace('Oe(E.dataset.text,null,!0,E.dataset.speaker||"Me")','Oe(E.dataset.text,null,!0,E.dataset.speaker||"Me",E.dataset.lineId)','Replay exactly the current event recording')
replace('function Pe(){Fe.unlock();','function Pe(){Fe.unlock();Fe.preloadDialogue([{text:"Come down, my dear!",speaker:"Grandma"},{text:"Coming, Grandma!",speaker:"Me"}]);','Use existing Start/continue interaction to unlock and preload opening audio')
replace('return Y>=4?!0:Fe.lastFailure||u.muted?Y>=Math.min(E,4):Y>=.7&&!L?.busy','return L?.busy?!1:Fe.lastFailure||u.muted?Y>=Math.min(E,4):Y>=.7','Let actual playback completion govern automatic dialogue advance')
replace('if(c.elapsed>=Ke()){','if(c.elapsed>=Ke()&&!L?.busy&&!d){','Wait for the current utterance at automatic game timeout')
replace('addEventListener("pagehide",Ae)','addEventListener("pagehide",()=>{Fe.cleanup();Ae()})','Stop dialogue and release audio on page exit')
replace('The page makes no network requests. Edge natural speech needs internet.','Recorded voices load from this website. No installed voices are required.','Update audio-specific teacher guidance')

# All changes must be the exact whitelisted replacements.
replay = baseline.decode('utf8')
for edit in edits:
    assert replay.count(edit['old']) == 1
    replay = replay.replace(edit['old'],edit['new'])
assert replay == s
assert 'speechSynthesis' not in s and 'SpeechSynthesisUtterance' not in s
for left,right in [('xl=class', 'function m0'),('function Ce()', 'function C('),('function q()', 'function Ge('),('function Ct()', 'function Qi('),('function $t()', 'function qt('),('function ns(', 'function mi('),('function de(', 'function ve(')]:
    original=baseline.decode('utf8')
    base_start=original.index(left,0 if left=='xl=class' else original.index('function m0'))
    patched_start=s.index(left,0 if left=='xl=class' else s.index('function m0'))
    assert original[base_start:original.index(right,base_start)] == s[patched_start:s.index(right,patched_start)], f'Protected block changed: {left}'
args.output.parent.mkdir(parents=True,exist_ok=True)
args.output.write_text(s)
(root/'patch-audit.json').write_text(json.dumps({'baselineGitBlob':actual,'draft':args.draft,'outputSha256':hashlib.sha256(s.encode()).hexdigest(),'edits':[{'reason':e['reason'],'removedBytes':len(e['old'].encode()),'addedBytes':len(e['new'].encode())} for e in edits],'protectedBlocksVerified':7},indent=2))
print(f"{'DRAFT ONLY' if args.draft else 'READY'}: {args.output}; {len(edits)} audio-only replacements; 7 protected code blocks unchanged.")
