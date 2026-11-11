import { describe, it, expect } from 'vitest'
import { isVoice, voiceFill, voiceFillLine, voiceNote, STAND_VOICE_RMS } from './pillStandVoice.js'
import { honesty } from './pillStandHonesty.js'
import { summaryText } from './pillStandSummary.js'
import { packEvents } from './pillStandPacks.js'
import { thinTrace } from './pillStandCompact.js'
import { chronLine } from './pillStandChron.js'
import { topicMetrics } from './pillStandPackMetrics.js'
import { earStep, emptyEar } from './pillStandEar.js'
import { recentTargets } from './pillStandSpan.js'
import { jerks } from './pillStandFrames.js'
import { tapListen, voiceMark } from './standVoiceTap.js'
import { createStandTrace } from './pillStandTrace.js'
import { createEarVoice } from '../../shared/lib/vosk/voskVoice.js'
import { createVoiceLevel } from '../player/modules/rotate-phone/wordLaneVoiceLevel.js'
import { createRmsLevel } from '../../shared/lib/vosk/sayVoskLevel.js'

// Трасса тихого микрофона iPhone (фон 0,0003, слово 0,003–0,0045): метки v — от счётчика распознавания; marks: false — та же трасса без меток (запись до v3.3.187)
const quietTrace = ({ marks = true, gated = 0.66 } = {}) => {
  const lv = (t, rms, v, extra = {}) => ({ t, k: 'level', rms, ...(marks ? { v, ...extra } : {}) })
  const out = [{ t: 100, k: 'target', n: 0, mode: 'word', lang: 'en', say: 'house', shown: 'дом' }, { t: 110, k: 'run', mode: 'word', n: 0 }]
  for (let t = 150; t < 1000; t += 43) out.push(lv(t, 0.0003, 0))
  const word = [0.0022, 0.0038, 0.0045, 0.0041, 0.0033, 0.0044, 0.003, 0.0016]
  word.forEach((rms, i) => out.push(lv(1010 + i * 43, rms, 1, { ...(i === 0 ? { n: 0.0003 } : {}), lv: [0.42, 0.63, 0.69, 0.66, 0.59, 0.68, 0.56, 0.33][i], g: 10 })))
  if (gated) out.push({ t: 1075, k: 'fill', goal: 0.21, shown: 0.08, level: 0.63, confirmed: false }, { t: 1200, k: 'fill', goal: 0.4, shown: 0.36, level: gated, confirmed: false })
  out.push({ t: 1400, k: 'wl', kind: 'ear', text: 'голос начался: rms 0.0022 ≥ порог 0.002 (шум 0.0003)' })
  for (let t = 1360; t < 1700; t += 43) out.push(lv(t, 0.0003, 0))
  out.push({ t: 1640, k: 'vosk-final', raw: { text: 'house', result: [{ word: 'house', conf: 1 }] }, stopBy: 'ear' }, { t: 1645, k: 'listen', status: 'listening', seq: [0], misses: 0, heard: 'house' },
    { t: 1650, k: 'pill', type: 'claim', text: 'house', ms: 300 }, { t: 1660, k: 'fill', goal: 1, shown: 0.6, level: 0, confirmed: true }, { t: 1750, k: 'result', ok: true, ratio: 1, clean: true })
  return out
}

describe('стенд пилюль: «голос» в отчёте = голос распознавания (v3.3.187)', () => {
  it('метка счётчика главнее громкости; без метки — запасной порог 0,015', () => {
    expect(isVoice({ rms: 0.004, v: 1 })).toBe(true)
    expect(isVoice({ rms: 0.05, v: 0 })).toBe(false) // громко, но счётчик голосом не назвал (шум громкой комнаты)
    expect(isVoice({ rms: 0.004 })).toBe(false)
    expect(isVoice({ rms: STAND_VOICE_RMS })).toBe(true)
  })
  it('тихая речь 0,003–0,0045: голос есть, зачёт «N мс от конца голоса», ложных «без голоса» нет; та же трасса без меток — «голоса не было» (как до v3.3.187)', () => {
    const s = honesty(quietTrace()).segs[0]
    expect(s.voiceStart).toBe(910)
    expect(s.voiceEnd).toBe(1211)
    expect(s.result.afterVoice).toBe(439)
    expect(s.falses).toEqual([])
    const old = honesty(quietTrace({ marks: false })).segs[0]
    expect(old.voiceStart).toBeNull()
    expect(old.result.afterVoice).toBeNull()
    expect(old.voice).toBeNull()
    expect(old.falses.map(f => f.kind)).toContain('счёт слова без голоса')
  })
  it('сводка: «голос: … (счётчик распознавания: шум, пик речи)» и строка «заливка голосом: шла — уровень, усиление, ворота, цель, задержка»', () => {
    const text = summaryText({ version: '3.3.187', mode: 'word', lang: 'en' }, quietTrace())
    expect(text).toContain('голос: +910…+1211 мс (счётчик распознавания: шум 0,0003, пик речи 0,0045)')
    expect(text).toContain('заливка голосом: шла — уровень до 0,69 (усиление ×10,0: шум 0,0003, пик речи 0,0045), после ворот до 0,66, цель до зачёта 0,40; начало голоса → заливка на экране 65 мс')
    expect(text).toContain('439 мс от конца голоса')
    expect(text).not.toContain('голоса не было')
  })
  it('голос был, заливка не шла — в отчёте видно почему: ворота не открылись / уровень 0', () => {
    const vf = voiceFill(quietTrace({ gated: 0 }).filter(e => e.k !== 'pill' && !(e.k === 'fill' && e.t > 1600)))
    expect(vf).toMatchObject({ noise: 0.0003, peak: 0.0045, gain: 10, lv: 0.69, gated: null, lagMs: null })
    expect(voiceFillLine(vf)).toMatch(/^заливка голосом: НЕ шла — уровень до 0,69 \(усиление ×10,0: шум 0,0003, пик речи 0,0045\), но ворота голоса не открылись/)
    expect(voiceFillLine({ ...vf, lv: 0, gain: 1 })).toMatch(/^заливка голосом: НЕ шла — уровень 0: голос после усиления ×1,0 ниже пола кривой 0,006/)
    expect(voiceFillLine({ ...vf, lv: null })).toBe('') // фраза «Скажи»: уровня в трассе нет
    expect(voiceNote(null)).toBe('')
    expect(voiceFill([{ t: 1, k: 'level', rms: 0.2 }])).toBeNull() // трасса без меток
  })
  it('пакеты тем: «▲ голос» на тихой речи с шумом и уровнем, заливка «Анимации» несёт уровень после ворот, метрики тем — те же строки', () => {
    const ev = quietTrace(), t0 = 100
    const ear = packEvents(['ear'], ev).filter(e => e.k === 'level')
    const up = ear.find(e => e.voice)
    expect(up).toMatchObject({ t: 1010, rms: 0.0022, voice: true, n: 0.0003, lv: 0.42, g: 10 })
    expect(chronLine(up, t0)).toBe('   +910  rms 0,0022 ▲ голос · шум 0,0003 · уровень 0,42 (×10,0)')
    expect(ear.filter(e => e.voice === false && e.t > 1300)[0].t).toBe(1360) // «▽ тишина» — первый кусок после слова
    const fill = packEvents(['anim'], ev).find(e => e.k === 'fill')
    expect(chronLine(fill, t0)).toBe('   +975  заливка: цель 0,21 · экран 0,08 · уровень 0,63')
    const seg = honesty(ev).segs[0]
    expect(topicMetrics('anim', { seg, events: ev, t0 }).lines[0]).toMatch(/^заливка голосом: шла — уровень до 0,69/)
    expect(topicMetrics('ear', { seg, events: ev, t0 }).lines[0]).toContain('голос: +910…+1211 мс (счётчик распознавания: шум 0,0003, пик речи 0,0045)')
    expect(thinTrace(ev).events.filter(e => e.k === 'level' && e.v === 1)[0].t).toBe(1010) // JSON «Всё»: переход «тишина → голос» сохранён
  })
  it('панель слуха, выбор цели и рывки считают голос по той же метке', () => {
    const ear = emptyEar()
    for (const e of quietTrace()) earStep(ear, e)
    expect(ear.voiceStart).toBe(910)
    expect(ear.lastVoice).toBe(1211)
    expect(recentTargets(quietTrace().filter(e => e.k === 'target' || e.k === 'level'))[0].voiced).toBe(true)
    expect(recentTargets(quietTrace({ marks: false }).filter(e => e.k === 'target' || e.k === 'level'))[0].voiced).toBe(false)
    const frames = [{ t: 1180, i: 0, v: 0.1 }, { t: 1200, i: 1, v: 0.3 }]
    expect(jerks(frames, quietTrace())[0].voice).toBe(true)
    expect(jerks(frames, quietTrace({ marks: false }))[0].voice).toBe(false)
  })
})

describe('стенд пилюль: метка голоса куска в трассе (standVoiceTap)', () => {
  it('v — от счётчика слушателя ПОСЛЕ этого куска; n — шум на первом куске голоса; lv / g — уровень и усиление анимации', () => {
    let t = 0
    const voice = createEarVoice({ now: () => t }), fromRms = createVoiceLevel(), level = createRmsLevel({ now: () => t, fromRms }), trace = createStandTrace({ log: () => {}, now: () => t })
    let cb = null
    const listen = (_m, _g, c) => { cb = c; return {} }
    tapListen(trace, listen, voiceMark(() => voice, fromRms.info))('m', '[]', { onLevel: rms => { voice.push(rms); level.push(rms, t, voice) }, onPartial() {}, onResult() {}, onError() {} })
    for (const rms of [...Array.from({ length: 30 }, () => 0.0003), 0.0022, 0.0041, 0.0003]) { t += 43; cb.onLevel(rms) }
    const lv = trace.events().filter(e => e.k === 'level')
    expect(lv.slice(0, 30).every(e => e.v === 0 && e.lv == null && e.g == null)).toBe(true)
    expect(lv[30]).toMatchObject({ rms: 0.0022, v: 1, n: 0.0003, g: 10 })
    expect(lv[30].lv).toBeGreaterThan(0.3)
    expect(lv[31]).toMatchObject({ rms: 0.0041, v: 1 })
    expect(lv[31].g).toBeGreaterThan(9.5) // оценка шума в голосе чуть растёт
    expect(lv[31].n).toBeUndefined()
    expect(lv[32]).toEqual({ t: lv[32].t, k: 'level', rms: 0.0003, v: 0 })
  })
  it('слушатель без счётчика (заглушка) — меток нет: отчёт считает голос запасным порогом', () => {
    const trace = createStandTrace({ log: () => {} })
    let cb = null
    tapListen(trace, (_m, _g, c) => { cb = c; return {} }, voiceMark(() => undefined))('m', '[]', { onPartial() {}, onResult() {}, onError() {} })
    cb.onLevel(0.2)
    expect(trace.events().at(-1)).toMatchObject({ k: 'level', rms: 0.2 })
    expect(trace.events().at(-1).v).toBeUndefined()
  })
})
