#!/usr/bin/env node
// Отчёт по файлу «Скачать отладку» из игры «Повтори за диктором» (pithy-dictor-debug-*.json). Чистый node, без зависимостей.
//   node scripts/dictor-debug-report.mjs <файл.json> [--no-audio] [--logs]
// Печатает: шапку (устройство, фраза, что человек сказал, микрофон), раздел «Доступы и звук» (getUserMedia и play() по порядку), хронологию игры (стадии, партиалы/финалы,
// события пилюль, ноты и окна mute, ворота голоса, статусы), кривую уровня голоса по секундам (ascii) и сохраняет запись рядом: <файл>.webm / .m4a (части записи — .2.webm …).
// Время везде — от старта игры (мс), события «до игры» (запрос микрофона при старте урока, тап «Начать») идут с минусом. --logs — ещё журнал плеера и трасса жеста звука.
import { readFileSync, writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const file = args.find(a => !a.startsWith('--'))
if (!file) { console.error('Использование: node scripts/dictor-debug-report.mjs <файл.json> [--no-audio] [--logs]'); process.exit(2) }
const noAudio = args.includes('--no-audio')
const showLogs = args.includes('--logs')

const d = JSON.parse(readFileSync(file, 'utf8'))
const events = Array.isArray(d.events) ? d.events : []

const fmt = t => `${t < 0 ? '-' : ' '}${String(Math.floor(Math.abs(t) / 1000)).padStart(3)}.${String(Math.abs(t) % 1000).padStart(3, '0')}`
const j = v => JSON.stringify(v)
const short = (v, n = 70) => { const s = typeof v === 'string' ? v : j(v); return s.length > n ? `${s.slice(0, n - 1)}…` : s }
const rest = (e, skip) => Object.entries(e).filter(([k]) => !['t', 'type', 'kind', ...skip].includes(k)).map(([k, v]) => `${k}=${short(v, 60)}`).join(' ')
const h = title => console.log(`\n=== ${title} ${'='.repeat(Math.max(0, 70 - title.length))}`)

// ---------- шапка ----------
h('Шапка')
console.log(`файл:        ${file}`)
console.log(`версия:      ${d.version}   игра начата: ${d.startedAt}   выгружено: ${d.exportedAt ?? '?'}`)
console.log(`фраза:       ${d.phrase}   (куски: ${j(d.chunks)})   язык: ${d.lang ?? '?'}`)
console.log(`человек сказал: ${d.userSaid ? `«${d.userSaid}»` : '— (не заполнено)'}`)
console.log(`устройство:  ${d.device?.ua ?? '?'} | ${d.device?.platform ?? '?'} | слабое: ${d.device?.weak} | экран ${j(d.device?.screen)}`)
console.log(`микрофон:    ${short(d.mic, 400)}`)
console.log(`событий:     ${events.length}${d.dropped ? ` (вытеснено старых: ${d.dropped})` : ''}   частей записи: ${d.audioParts ?? (d.audio ? 1 : 0)}`)
if (d.grammar?.length) d.grammar.forEach((g, i) => console.log(`словарь #${i + 1}: цели ${j(g.targets)}, фраз ${g.phrases?.length ?? '?'}`))

// ---------- доступы и звук ----------
const probe = events.filter(e => e.type === 'probe')
h('Доступы и звук (getUserMedia, play(), speechSynthesis, AudioContext, окно)')
const gumCalls = probe.filter(e => e.kind === 'gum-call')
const gumRes = new Map(probe.filter(e => e.kind === 'gum-result').map(e => [e.id, e]))
const playCalls = probe.filter(e => e.kind === 'play-call')
const playRes = new Map(probe.filter(e => e.kind === 'play-result').map(e => [e.id, e]))
const denied = [...gumRes.values()].filter(r => !r.ok).length
const playFail = [...playRes.values()].filter(r => !r.ok).length
console.log(`getUserMedia: вызовов ${gumCalls.length} (отказов ${denied}); play(): вызовов ${playCalls.length} (отказов ${playFail}); первый зазвучавший звук: ${probe.find(e => e.kind === 'first-sound') ? fmt(probe.find(e => e.kind === 'first-sound').t) + ' с' : 'НЕ БЫЛО'}`)
if (!probe.length) console.log('(пробник ничего не записал: отладка включилась после старта приложения — перезагрузи страницу и повтори)')
const env = e => (e.env ? ` [вкл=${e.env.vis} fs=${e.env.fs} act=${e.env.ua?.active}/${e.env.ua?.been}${e.env.as ? ` session=${e.env.as}` : ''} ctx=${e.env.ctx || '—'}]` : '')
for (const e of probe) {
  const t = fmt(e.t)
  let line
  switch (e.kind) {
    case 'gum-call': line = `getUserMedia #${e.id} запрос: ${e.guess}; constraints ${short(e.constraints, 110)}; живых потоков ${e.live}${env(e)}\n${' '.repeat(8)}стек: ${(e.caller ?? []).join(' <- ')}`; break
    case 'gum-result': { const r = e; line = r.ok ? `getUserMedia #${e.id} ОТВЕТ ok за ${r.ms} мс; живых ${r.live}; дорожки ${short(r.tracks, 160)}` : `getUserMedia #${e.id} ОТВЕТ ОТКАЗ ${r.error} ${r.message ?? ''} за ${r.ms} мс`; break }
    case 'play-call': line = `play #${e.id} вызван: <${e.tag}> ${e.src} rs=${e.rs} muted=${e.muted} vol=${e.vol} paused=${e.paused}${env(e)}`; break
    case 'play-result': line = e.ok ? `play #${e.id} ok за ${e.ms} мс rs=${e.rs} muted=${e.muted}` : `play #${e.id} ОТКАЗ ${e.error} ${e.message ?? ''} за ${e.ms} мс rs=${e.rs}`; break
    case 'first-sound': line = `*** ПЕРВЫЙ РЕАЛЬНО ЗАЗВУЧАВШИЙ ЗВУК: ${e.src}`; break
    default: line = `${e.kind} ${rest(e, [])}`
  }
  console.log(`${t}  ${line}`)
}
if (showLogs) {
  h('Журнал плеера (хвост)'); (d.playerLog ?? []).forEach(l => console.log(l))
  h('Журнал звуков'); (d.soundLog ?? []).forEach(l => console.log(j(l)))
  h('Трасса жеста звука'); (d.gestureTrace ?? []).forEach(l => console.log(l))
} else if (d.playerLog?.length || d.gestureTrace?.length) console.log(`(в файле есть журнал плеера: ${d.playerLog?.length ?? 0} строк, трасса жеста: ${d.gestureTrace?.length ?? 0}; показать — флаг --logs)`)

// ---------- хронология игры ----------
h('Хронология игры (стадии, распознавание, пилюли, ноты, mute, ворота)')
for (const e of events) {
  if (e.type === 'level' || e.type === 'probe') continue
  const t = fmt(e.t)
  if (e.type === 'stage') console.log(`${t}  ━━ СТАДИЯ ${e.kind} ${rest(e, [])}`)
  else if (e.type === 'partial') console.log(`${t}  ~ partial «${e.text}»  seq=${j(e.seq)} промахов=${e.misses}${e.tail ? ` хвост=${e.tail.target}:${e.tail.tokens}` : ''}${e.settled === false ? ' (не устоялся)' : ''}${e.muted ? ' [MUTE]' : ''}`)
  else if (e.type === 'final') console.log(`${t}  ✔ FINAL   «${e.text}»  seq=${j(e.seq)} промахов=${e.misses}${e.stopBy ? ` stop=${e.stopBy}` : ''}${e.gatedMs ? ` gated=${e.gatedMs}мс` : ''}${e.lateChunks ? ` опозданий=${e.lateChunks}` : ''}${e.muted ? ' [MUTE]' : ''}`)
  else if (e.type === 'pill') console.log(`${t}  ● пилюля ${e.kind.padEnd(8)} ${rest(e, [])}`)
  else if (e.type === 'note') console.log(`${t}  ♪ звук ${e.kind}`)
  else if (e.type === 'mute') console.log(`${t}  ⊘ mute ${e.ms} мс (до ${fmt(e.t + e.ms)})`)
  else if (e.type === 'gate') console.log(`${t}  ${e.on ? '▲ ворота ОТКРЫТЫ (голос двигает пилюли)' : '▽ ворота закрыты'}`)
  else if (e.type === 'grammar') console.log(`${t}  словарь: цели ${j(e.targets)}, фраз ${e.phrases}`)
  else console.log(`${t}  · ${e.kind ?? e.type} ${rest(e, [])}`)
}

// ---------- кривая уровня ----------
h('Уровень голоса по секундам (RMS, пик за секунду; M — окно mute, ▲ — ворота открыты)')
const levels = events.filter(e => e.type === 'level')
if (!levels.length) console.log('(уровня нет)')
else {
  const last = Math.max(...events.filter(e => e.type !== 'probe').map(e => e.t))
  const mutes = events.filter(e => e.type === 'mute').map(e => [e.t, e.t + e.ms])
  const gates = events.filter(e => e.type === 'gate')
  const gateAt = s => { let on = false; for (const g of gates) { if (g.t <= s * 1000 + 999) on = g.on; else break } return on }
  const stageAt = ms => events.filter(e => e.type === 'stage' && e.t <= ms).at(-1)?.kind ?? ''
  const peak = Math.max(0.0001, ...levels.map(e => e.v))
  for (let s = Math.max(0, Math.floor(levels[0].t / 1000)); s <= Math.ceil(last / 1000); s++) {
    const inSec = levels.filter(e => e.t >= s * 1000 && e.t < (s + 1) * 1000)
    const m = inSec.length ? Math.max(...inSec.map(e => e.v)) : 0
    const isMute = mutes.some(([a, b]) => a < (s + 1) * 1000 && b > s * 1000)
    console.log(`${String(s).padStart(4)} с  ${m.toFixed(3)}  ${'█'.repeat(Math.round((m / peak) * 40)).padEnd(40)} ${isMute ? 'M' : ' '}${gateAt(s) ? '▲' : ' '} ${stageAt(s * 1000 + 500)}`)
  }
}

// ---------- запись ----------
if (!noAudio) {
  h('Запись микрофона')
  const parts = [d.audio, ...(d.audioMore ?? [])].filter(Boolean)
  if (!parts.length) console.log('записи нет (рекордер не заработал или формат не поддержан — смотри события rec-* выше)')
  parts.forEach((p, i) => {
    const ext = /mp4|aac/.test(p.mime) ? 'm4a' : /ogg/.test(p.mime) ? 'ogg' : 'webm'
    const out = `${file}${i ? `.${i + 1}` : ''}.${ext}`
    const buf = Buffer.from(p.base64, 'base64')
    writeFileSync(out, buf)
    console.log(`${out}  (${p.mime}, ${buf.length} байт) — начало записи на ${fmt(p.startedAtMs - d.startedAtMs)} с от старта игры (±0,1 с)`)
  })
}
