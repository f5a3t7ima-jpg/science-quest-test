"""Generate website MP3 assets on GitHub's runner only, never in browsers."""
import hashlib, html, json, os, re, subprocess, time, urllib.error, urllib.request
from pathlib import Path
root=Path(__file__).resolve().parent
repo=root.parent
m=json.loads((root/'manifest.json').read_text())
key=os.environ.get('AZURE_SPEECH_KEY','')
region=os.environ.get('AZURE_SPEECH_REGION','')
if not key or not re.fullmatch('[a-z0-9]+',region):raise SystemExit('Add AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in repository Actions secrets.')
baseline=(repo/'Science_at_Home_V8.html').read_bytes()
blob=lambda data:hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
if blob(baseline)!='481e9a93f248444b692c03f8ab0b82cf0441befd':raise SystemExit('Approved V8 has changed; inspect before generating.')
draft=(repo/'Science_at_Home_V8_Audio_Architecture_DRAFT.html').read_text()
if blob(draft.encode())!='6de32c17acca34645a0fa8404a649c40581ccaa7':raise SystemExit('Audio draft changed; inspect before generating.')
base=f'https://{region}.tts.speech.microsoft.com'
headers={'Ocp-Apim-Subscription-Key':key}
def request(req):
 for retry in range(5):
  try:
   with urllib.request.urlopen(req,timeout=90) as r:return r.read()
  except urllib.error.HTTPError as e:
   if e.code not in (429,500,502,503,504) or retry==4:raise SystemExit(f'Azure request failed (HTTP {e.code}); check resource key, region, quota and billing.')
   time.sleep(min(30,2**retry*3))
  except urllib.error.URLError:
   if retry==4:raise SystemExit('Azure network request failed.')
   time.sleep(min(30,2**retry*3))
voices=json.loads(request(urllib.request.Request(base+'/cognitiveservices/voices/list',headers=headers)))
missing={v['voiceName'] for v in m['cast'].values()}-{v['ShortName'] for v in voices}
if missing:raise SystemExit('Assigned voices unavailable in this region: '+', '.join(sorted(missing)))
out=repo/'azure-voice-output';out.mkdir(exist_ok=True)
for index,c in enumerate(m['clips'].values(),1):
 cast=m['cast'][c['speaker']]
 ssml=f'<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="{cast["locale"]}"><voice name="{cast["voiceName"]}"><prosody rate="{cast["rate"]}">{html.escape(c["text"])}</prosody></voice></speak>'
 data=request(urllib.request.Request(base+'/cognitiveservices/v1',data=ssml.encode(),headers={**headers,'Content-Type':'application/ssml+xml','X-Microsoft-OutputFormat':'audio-24khz-96kbitrate-mono-mp3','User-Agent':'ScienceAtHome-AssetGeneration'},method='POST'))
 if len(data)<1000:raise SystemExit('Invalid audio: '+c['id'])
 path=out/c['src'];path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
 duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',str(path)],text=True).strip())
 if duration<=0:raise SystemExit('Invalid duration: '+c['id'])
 c.update(status='ready',verified=False,duration=duration,sha256=hashlib.sha256(data).hexdigest(),provider='Microsoft Azure Neural Speech',voiceName=cast['voiceName'])
 print(f'{index}/{len(m["clips"])} generated: {c["id"]}',flush=True)
 (out/'generation-progress.json').write_text(json.dumps({'generated':index,'required':len(m['clips']),'complete':False},indent=2))
m.update(ready=True,recordingsGenerated=len(m['clips']),listeningReview='pending')
# Technical playback is ready. Human listening approval remains explicitly pending.
start=draft.index('voiceManifest=')+len('voiceManifest=');end=draft.index(',gl=class',start)
old_manifest=json.loads(draft[start:end])
assert old_manifest['lookup']==m['lookup']
assert {(k,c['text'],c['speaker'],c['src']) for k,c in old_manifest['clips'].items()}=={(k,c['text'],c['speaker'],c['src']) for k,c in m['clips'].items()}
patched=draft[:start]+json.dumps(m,ensure_ascii=True,separators=(',',':'))+draft[end:]
assert 'speechSynthesis' not in patched and 'Ocp-Apim-Subscription-Key' not in patched and key not in patched
(out/'index.html').write_text(patched)
(out/'dialogue-manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2))
(out/'generation-progress.json').write_text(json.dumps({'generated':len(m['clips']),'required':len(m['clips']),'complete':True,'listeningReview':'pending','approvedGameUnchanged':True},indent=2))
(out/'README.txt').write_text('All 140 Azure neural MP3 files are generated. This separate audio preview has the same gameplay as the approved V8. Listening and Chrome playback checks remain pending. Upload this complete ZIP to the assistant for verification and publishing. Keep index.html and audio/ together. No Azure keys are included. The live GitHub game was not changed by this action.\n')
print('Complete. Download the azure-voice-output artifact, or ask the assistant to retrieve it.')
