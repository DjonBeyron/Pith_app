// Фикстура для тестов диагностики «Почему первая реплика тихая» (wordLaneSilentDiag.test.js): СТРОКИ НАСТОЯЩЕГО журнала владельца — iPhone, iOS 18.7, Safari, v3.3.75, этап «Разминка», режим звука A
// (rehearsal-audio-runs.json → runs[0].gameLog), сокращённые до нужных. Что в них видно: в голове журнала — отметки тапа ПРОШЛЫХ игр (tap −292508 и −139313 мс), а отметок тапа этой игры нет вовсе
// (середина журнала вырезана при выгрузке); реплика кота rh_warmup (+4012 мс) ушла в голос системы (слот не успел, пробуждение «AbortError»), и через ~1 с iOS заглушил дорожку микрофона (mute +4998)
// до +16827 (unmute) — 11,8 с. parseGameLog превращает такие строки в события, как их хранит журнал игры (dump.events: { t, type, kind, ...поля }).
export const OWNER_WARMUP_LOG = [
  '-292508мс probe:start-mark name=tap sinceTap=0',
  '-292508мс probe:audio-warm step=begin ctx=null session=null activation=true',
  '-291172мс probe:start-mark name=mic sinceTap=1337 mic=granted',
  '-290920мс probe:start-mark name=settle sinceTap=1588 waitedMs=251 interrupts=0 ctx=null activation=true',
  '-290838мс probe:start-mark name=wake sinceTap=1671 ok=true',
  '-288337мс probe:start-mark name=ready sinceTap=4172 words=timeout',
  '-139313мс probe:start-mark name=tap sinceTap=0',
  '-139313мс probe:audio-warm step=begin ctx=running session=null activation=true',
  '-138687мс probe:start-mark name=mic sinceTap=626 mic=granted',
  '-138436мс probe:audio-warm step=settled interrupts=0 waitedMs=251 ctx=running session=null timedOut=false activation=true',
  '4010мс probe:speech-event id=257 event=error error=canceled',
  '4010мс event:cat-speak id=rh_warmup ms=3370 trackLen=16 empty=false up=true',
  '4012мс event:cat-voice id=rh_warmup source=synth why=слот не успел за 1500 мс: слот не разбужен (play() тишины отклонён: AbortError) waitedMs=1564 slot={"rs":0,"prepared":false,"interrupted":null,"paused":true,"hasUrl":true,"wokeErr":"AbortError"} activation=expired as=play-and-record sinceTap=6250 sinceSettle=5724 interrupts=0 play=ok playMs=2',
  '4012мс probe:speech-event id=309 event=start',
  '4998мс probe:track stream=256 event=mute readyState=live live=1',
  '5018мс probe:audio-interrupt n=1 self=false ctx=interrupted session=null activation=false settling=false',
  '5319мс probe:audio-warm step=armed why=прерывание в игре activation=false',
  '6140мс probe:speech-event id=309 event=error error=canceled',
  '7385мс event:cat-speak-end id=rh_warmup ms=3370 played=3374 shapes=19 micBlocked=74 why=done',
  '11959мс event:cat-speak id=rh_warmup_miss ms=2534 trackLen=17 empty=false up=true',
  '11966мс event:cat-voice id=rh_warmup_miss source=synth why=слот не успел за 1500 мс: слот не разбужен (play() тишины отклонён: AbortError) waitedMs=1570 slot={"rs":4,"prepared":false,"interrupted":null,"paused":true,"hasUrl":true,"wokeErr":"AbortError"} activation=expired as=play-and-record sinceTap=14198 sinceSettle=13672 interrupts=1 play=ok playMs=8',
  '14801мс probe:speech-event id=310 event=end',
  '16827мс probe:track stream=256 event=unmute readyState=live live=1',
  '41294мс probe:track stream=256 event=mute readyState=live live=1',
]

const value = v => {
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v)
  if (v === 'true') return true
  if (v === 'false') return false
  if (v === 'null') return null
  if (/^[{[]/.test(v)) { try { return JSON.parse(v) } catch { return v } }
  return v
}

/** Строки текстового журнала → события журнала игры. «why=…» может содержать пробелы (до « waitedMs=»), остальные поля — key=value без пробелов */
export function parseGameLog(lines) {
  const out = []
  for (const line of lines) {
    const m = /^\s*(-?\d+)мс (probe|event):(\S+)\s*(.*)$/.exec(line)
    if (!m) continue
    let rest = m[4]
    const fields = {}
    const why = /\bwhy=(.*?)(?= waitedMs=)/.exec(rest)
    if (why) { fields.why = why[1]; rest = rest.replace(why[0], '') }
    for (const f of rest.matchAll(/(\w+)=(\S+)/g)) fields[f[1]] = value(f[2])
    out.push({ t: Number(m[1]), type: m[2], kind: m[3], ...fields })
  }
  return out
}
