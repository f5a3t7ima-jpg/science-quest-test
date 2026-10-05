# V8 recorded-dialogue patch — development checkpoint

Status: **NOT DEPLOYABLE. Real recordings and browser verification are pending.**

This patch targets exactly the approved `Science_at_Home_V8.html` Git blob
`481e9a93f248444b692c03f8ab0b82cf0441befd`. The uploaded HTML has the same blob ID.
The published main branch has not been modified.

Scope is audio only. The renderer, camera director, navigation, Take Me There,
activities, questions, science content, dialogue text, scores, rewards and
scene order are retained. Eleven whitelisted substitutions replace the voice
manager and its hooks, remove the obsolete error message, fix the four-second
speech cutoff, and update audio-specific teacher guidance.

The catalogue contains 140 distinct speaker/text recordings and the audit
records 1,246 event variants across the six groups, five main scenes, family
comparisons, optional challenges, notebook prompts, discoveries, review,
endings, replay controls and teacher voice tests. The audit executes the
original game functions with an instrumented DOM stub. It is a content audit,
not a graphical browser playthrough.

`recorded-dialogue.js` owns one audible HTML audio element and at most two
preload elements. Replay uses the current line's stable event ID and its
speaker-specific clip. Repeated identical lines by the same character can
share an asset; speaker identity is part of the clip key, and scene/group/step
context is part of the event ID. The catalogue builder checks ID collisions.
No operating-system voices, online speech APIs, or keys are used at runtime.

Completed checks:
- Exact approved baseline and seven protected game-code blocks checked.
- JavaScript syntax of a locally built draft checked.
- Controller tests passed for long speech, ended events, stale events, replay,
  cancellation, load and stall timeouts, rejected play promises, mute, missing
  recordings, bounded preload, and all catalogue lookups.

Pending before release:
- Generate and listen to all 140 real neural recordings; use distinct
  character voices, including young and mature voices, without pitch tricks.
- Record voice names, generation source, SHA-256, duration and verification
  for each file. Only verified clips may have `status: ready`.
- Test all six groups and their activities/endings in actual Google Chrome,
  including Start unlock, repeated replay, slow or missing audio, transitions
  and the hosted site. The controller mock tests do not prove browser playback.
- Deploy all assets with the HTML to the existing GitHub Pages link, then
  verify network requests and audio playback there.

Runway was confirmed installed on 2026-10-05. Its voice-generation commands
were not exposed in the active tool registry, so no recordings have been
generated or represented as complete. Resume with the connected Runway tools
when available; do not request another installation without checking status.

Development commands from the repository root:

```bash
node _voice_patch/audit_dialogue.cjs Science_at_Home_V8.html
python _voice_patch/build_patch.py Science_at_Home_V8.html _voice_patch/draft.html --draft
node _voice_patch/test_audio.cjs
```

Without `--draft`, the builder refuses to produce a release until the real
audio assets are present and their recorded checksums/verification match.
Do not upload the draft HTML to the live game. Do not replace any working V8
component to solve an unrelated issue.
