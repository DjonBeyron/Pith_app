// Синтетическая сессия стенда пилюль для тестов отправки по теме (pillStandPacks.test.js, pillStandReport.test.js; только для тестов): две цели, голос, черновики с «додуманным» словом, итог с conf,
// заливка, ложные срабатывания (слово и заливка без голоса), строки журнала модулей игры, кадры записи со снимками пилюли (маска слов, вспышка, nudge) и журнал игры с меткой performance.now.
const lv = (t, rms) => ({ t, k: 'level', rms })
const span = (a, b, rms, step = 50) => { const out = []; for (let t = a; t <= b; t += step) out.push(lv(t, rms)); return out }
const snap = (mask, extra = {}) => ({ a: { 'data-live': '', ...extra.a }, box: {}, fill: '', sp: null, fx: { scale: extra.scale ?? 'none', tf: 'none', op: '1', ol: 'none' }, fl: extra.fl ?? [], mask })

export const JOURNAL_T0 = 50000 // performance.now в момент старта трассы

export function fixtureEvents() {
  return [
    { t: 0, k: 'session', version: '3.3.178' },
    { t: 100, k: 'target', n: 0, mode: 'words', lang: 'en', say: 'Nice to meet you', shown: 'Nice to meet you' },
    { t: 110, k: 'run', mode: 'words', n: 0 },
    { t: 120, k: 'vosk-start', grammar: ['nice', 'to', 'meet', 'you', '[unk]'], gate: true },
    ...span(200, 950, 0.001), ...span(1000, 2000, 0.2), ...span(2050, 6950, 0.001),
    { t: 1000, k: 'gate', open: true, rms: 0.2 },
    { t: 1000, k: 'log', text: '[gate] открыт +880 мс (rms 0,200)' },
    { t: 1300, k: 'vosk-partial', raw: { partial: 'nice' } },
    { t: 1305, k: 'same', raw: { partial: 'nice' } },
    { t: 1310, k: 'word', index: 0, text: 'nice', draft: true },
    { t: 1320, k: 'fill', goal: 0.25, shown: 0.05 },
    { t: 1330, k: 'fill', goal: 0.25, shown: 0.07 },
    { t: 1380, k: 'fill', goal: 0.25, shown: 0.25 },
    { t: 1390, k: 'reach', word: 'nice', ms: 80 },
    { t: 1395, k: 'log', text: '[fill] режим по словам: слово 1 → граница 0,25' },
    { t: 1600, k: 'vosk-partial', raw: { partial: 'nice the' } },
    { t: 1700, k: 'vosk-partial', raw: { partial: 'nice to meet' } },
    { t: 1710, k: 'word', index: 1, text: 'to', draft: true },
    { t: 1711, k: 'word', index: 2, text: 'meet', draft: true },
    { t: 1720, k: 'wl', kind: 'partial', raw: 'nice to meet', seq: [0, 1, 2], misses: 0 },
    { t: 1730, k: 'log', text: '[phrase-ear] черновик «nice to meet» +430 мс' },
    { t: 2000, k: 'log', text: '[fill] неверное слово «the», ждём «to»' },
    { t: 2150, k: 'gate', open: false, rms: 0.001 },
    { t: 2200, k: 'vosk-final', raw: { text: 'nice to meet you', result: [{ word: 'nice', conf: 1, start: 0.1, end: 0.4 }, { word: 'to', conf: 0.8, start: 0.4, end: 0.5 }] }, stopBy: 'endpoint', firstPartialMs: 300 },
    { t: 2210, k: 'log', text: '[phrase-ear] кандидаты nice to meet you · услышал «nice to meet you» · лучший «Nice to meet you» ratio 1.00' },
    { t: 2220, k: 'phrase', ratio: 1, phraseKey: 'Nice to meet you' },
    { t: 2290, k: 'pill', type: 'win', res: { ok: true, ratio: 1, clean: true } },
    { t: 2300, k: 'result', ok: true, ratio: 1, clean: true, afterVoiceMs: 300, say: 'Nice to meet you' },
    { t: 5000, k: 'word', index: 3, text: 'you', draft: false },
    { t: 6800, k: 'fill', goal: 0.9, shown: 0.5 },
    { t: 6900, k: 'prefs', mode: 'word' },
    { t: 7000, k: 'target', n: 1, mode: 'word', lang: 'en', say: 'cat', shown: 'кот' },
    { t: 7010, k: 'run', mode: 'word', n: 1 },
    ...span(7050, 7950, 0.001), ...span(8000, 8400, 0.15), ...span(8450, 9500, 0.001),
    { t: 8100, k: 'vosk-partial', raw: { partial: 'cat' } },
    { t: 8110, k: 'listen', status: 'listening', seq: [0], misses: 0, heard: 'cat', tail: null },
    { t: 8120, k: 'pill', type: 'claim', text: 'cat', ms: 120 },
    { t: 8130, k: 'fill', goal: 1, shown: 0.4 },
    { t: 8200, k: 'fill', goal: 1, shown: 1 },
    { t: 8210, k: 'reach', word: 'cat', ms: 90 },
    { t: 8300, k: 'pill', type: 'win', text: 'cat' },
    { t: 8310, k: 'result', ok: true, ratio: 1, clean: true, say: 'cat' },
    { t: 8800, k: 'vosk-final', raw: { text: 'cat', result: [{ word: 'cat', conf: 0.93 }] }, stopBy: 'manual' },
  ].sort((a, b) => a.t - b.t)
}

/** Кадры записи 1000…3000 и 7000…9000 мс (≈ 60 к/с) */
export function fixtureFrames() {
  const out = []
  const add = t => {
    const said = t < 1310 ? 0 : t < 1711 ? 1 : 3
    const mask = ['Nice', 'to', 'meet', 'you'].map((w, i) => ({ t: i <= said ? w : '▒▒', w: i < said ? 'full' : i === said ? 'peek' : 'hidden', p: i === said ? '0.2' : '' }))
    const nudge = t >= 2000 && t < 2300 ? { 'data-nudge': '' } : {}
    const win = t >= 2290 && t < 2500
    out.push({ t, i: out.length, s: t > 7000 ? snap([]) : snap(mask, { a: nudge, fl: win ? [{ w: 'clip', css: '', op: '1', tf: 'none' }] : [], scale: win ? '1.08' : 'none' }), g: t < 1320 ? 0 : t < 2290 ? 0.25 : 1, v: t < 1320 ? 0 : t < 1380 ? 0.05 : t < 2290 ? 0.25 : 1, e: { p: t >= 1300 && t < 2200 ? 'nice' : '', f: t >= 2200 ? 'nice to meet you' : '', gate: t >= 1000 && t < 2150, rms: 0.2, lv: 0.5 } })
  }
  for (let t = 1000; t <= 3000; t += 16.7) add(Math.round(t * 10) / 10)
  for (let t = 7000; t <= 9000; t += 16.7) add(Math.round(t * 10) / 10)
  return out
}

/** Строки журнала игры (формат gameJournal: «  51500.0 14:03:28.500 текст») */
export function fixtureJournal() {
  const at = (t, text) => `${(JOURNAL_T0 + t).toFixed(1).padStart(9)} 14:03:${String(27 + Math.floor(t / 1000)).padStart(2, '0')}.000 ${text}`
  return [
    at(-5000, '[audio] до стенда'),
    at(1400, '[fill] +1300 мс: слово 1 «nice» черновик → цель 0,25, экран 0,05'),
    at(1401, '[stand] fill {"goal":0.25}'),
    at(1500, '[audio] unlock'),
    at(1730, '[phrase-ear] черновик «nice to meet» +430 мс'),
    at(2205, '[phrase-ear] итог «nice to meet you» (движок сам) +905 мс'),
    at(8150, '[phrases] круг 2 «Скажи»: цель «cat»'),
  ]
}
