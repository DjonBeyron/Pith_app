#!/usr/bin/env node
// Отчёт по файлу «Скачать отладку» из игры «Повтори за диктором» (pithy-dictor-debug-*.json). Чистый node, без зависимостей.
//   node scripts/dictor-debug-report.mjs <файл.json> [--no-audio] [--logs]
// Печатает: шапку (устройство, фраза, что человек сказал, микрофон), раздел «Доступы и звук» (getUserMedia и play() по порядку), хронологию игры (стадии, партиалы/финалы,
// события пилюль, ноты и окна mute, ворота голоса, статусы), кривую уровня голоса по секундам (ascii) и сохраняет запись рядом: <файл>.webm / .m4a (части записи — .2.webm …).
// Время везде — от старта игры (мс), события «до игры» (запрос микрофона при старте урока, тап «Начать») идут с минусом. --logs — ещё журнал плеера и трасса жеста звука.
import { readFileSync, writeFileSync } from 'node:fs'
import { speechWindows, rmsSeries, windowLevels, tickSummary, decodeWithFfmpeg, toDb, STEP_MS } from './dictorRms.mjs'

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
  if (e.kind === 'audio-tick') continue // раз в 500 мс — ниже одной сводкой
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
// ---------- аудиосессия и громкость воспроизведения (ducking) ----------
h('Аудиосессия iOS и глушение дорожки (audio-session, mic-hold, audio-tick)')
const sessEv = probe.filter(e => e.kind === 'audio-session'), holdEv = probe.filter(e => e.kind === 'mic-hold')
const tk = tickSummary(events)
console.log(`audio-session: событий ${sessEv.length}${sessEv.length ? `; режим ${sessEv[0].mode}; API ${sessEv[0].supported ? 'есть' : 'НЕТ'}; смены: ${sessEv.map(e => `${e.why}→${e.requested ?? 'не трогали'}${e.ok ? '' : ' (не удалось)'}=${e.as}`).join(' | ')}` : ' (нет: режим не включался или отладка стартовала позже)'}`)
console.log(`mic-hold: событий ${holdEv.length}${holdEv.length ? `; режим ${holdEv[0].mode}; включений ${holdEv.filter(e => e.on).length}; не ожила после возврата: ${holdEv.filter(e => e.dead).length}; muted после возврата: ${holdEv.filter(e => e.check && e.muted).length}` : ''}`)
console.log(`audio-tick (раз в 0,5 с, пока играет звук): ${tk.ticks}; тип сессии ${j(tk.sessionTypes)}; видимость ${j(tk.visibility)}; громкость <audio> ${j(tk.volumes)}${tk.sessionChanges.length > 1 ? `; тип менялся: ${tk.sessionChanges.map(c => `${fmt(c.t).trim()}→${c.as}`).join(', ')}` : ''}`)
const vcs = probe.filter(e => e.kind === 'volumechange')
if (vcs.length) console.log(`volumechange: ${vcs.length} (громкость <audio> менял кто-то, кроме игры, если игра её не трогает): ${vcs.slice(0, 6).map(e => `${fmt(e.t).trim()} vol=${e.vol}`).join(', ')}`)
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

// ---------- громкость записи в окнах речи ----------
// Окна речи диктора/Пита (по событиям playing → ended/pause) и RMS записи микрофона по 100 мс внутри них: динамик слышен в микрофон, поэтому «то громче, то тише» видно как разброс среднего по окнам
// и спад/рост внутри окна (тренд). Тишина дорожки (режим «глушить») или записи без ffmpeg в PATH — окна не оцениваются. Окна с data:-адресом (беззвучные «разбудки») не считаем.
const BARS = '▁▂▃▄▅▆▇█'
const spark = series => series.map(v => BARS[Math.max(0, Math.min(7, Math.round(((toDb(v) + 60) / 50) * 7)))]).join('')
function printWindowLevels(path, startRel) {
  const wins = speechWindows(events).filter(w => !w.src.startsWith('data:'))
  const samples = decodeWithFfmpeg(path)
  if (!samples) { console.log('  (RMS по окнам речи: не удалось декодировать запись — нужен ffmpeg в PATH)'); return }
  const rmsAll = rmsSeries(samples)
  const rows = windowLevels(wins, rmsAll, startRel)
  if (!rows.length) { console.log(`  (RMS по окнам речи: окон речи внутри записи нет; всего окон ${wins.length}; шаг ${STEP_MS} мс)`); return }
  console.log(`  RMS записи по ${STEP_MS} мс в окнах речи (дБ от полной шкалы; чем выше, тем громче динамик слышен в микрофоне):`)
  for (const r of rows) console.log(`  ${fmt(r.from)} – ${fmt(r.to).trim().padStart(7)}  ${r.kind.padEnd(6)} ${String(r.stage || '—').padEnd(8)} ${String(r.note || '—').padEnd(12)} среднее ${r.meanDb.toFixed(1).padStart(6)}  пик ${r.peakDb.toFixed(1).padStart(6)}  тренд ${(r.trendDb >= 0 ? '+' : '') + r.trendDb.toFixed(1)}  ${spark(r.series)}`)
  const dict = rows.filter(r => r.stage === 'dictor' && r.meanDb > -60)
  if (dict.length > 1) {
    const m = dict.map(r => r.meanDb), lo = Math.min(...m), hi = Math.max(...m)
    console.log(`  Диктор (стадия dictor, ${dict.length} окон): среднее от ${lo.toFixed(1)} до ${hi.toFixed(1)} дБ, разброс ${(hi - lo).toFixed(1)} дБ — ${hi - lo > 6 ? 'громкость ПЛЫВЁТ (> 6 дБ между окнами: похоже на ducking)' : 'ровно (≤ 6 дБ)'}. Внутри окон тренд ≤ -3 дБ у ${dict.filter(r => r.trendDb <= -3).length} из ${dict.length}. Слова естественно различаются по громкости: ducking — это когда одно и то же слово звучит по-разному или громкость падает внутри окна`)
  } else console.log('  Диктор: окон с заметным звуком в записи меньше двух — сравнивать нечего (дорожка заглушена режимом или динамик не слышен)')
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
    printWindowLevels(out, p.startedAtMs - d.startedAtMs)
  })
}
