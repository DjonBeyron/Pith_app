// Голос Пита на этапе 2 «Фразы» (CONCEPT_RACE.md, «Этап 2» → «Лента и круги»): что он говорит перед ходом и после итога хода. Директор гонки (useRaceActs) зовёт pre / react, сцена ленты (racePhraseScene.js)
// ждёт, пока Пит договорит (pitLeft: занятость Пита + left() этой цепочки). Цепочка — по одному высказыванию: следующее ждёт, пока Пит освободится (cat.busyLeft), затем STEP_GAP_MS.
//  • перед ходом: круг 1 «Пойми» — СИТУАЦИЯ (scene, контекст без подсказки слов; пусто — смысл ru), круг 2 «Скажи» — прямой смысл ru (sayText(текст, { ru: true }) — озвучка word_audio по transKey);
//    озвучки нет — молча, подпись над лентой (e.show). Журнал: «[phrase-voice] перед ходом «…» (pick): ситуация / смысл «…»»;
//    круг «Узнай» (пальцами) — фраза по-английски: целая запись (racePhraseAudio.js: phrase.audio или app_settings.game2_phrases; буфер прогрева, нет — <audio>); нет записи — по словам из библиотеки
//    sayText(слово, { hold, tight }) ВПРИТЫК: следующее слово стартует, как только у прежнего кончился голос (tight — без хвоста тишины файла), раньше на тишину в начале своего файла (не больше JOIN_OVERLAP_MS),
//    без STEP_GAP_MS и без опроса занятости; буферы начинаются и кончаются тишиной — стык без щелчка. Журнал: «[phrase-voice] фраза «…»: целая запись / по словам (N)»;
//  • верно — фраза (круг 1) и race_phrase_yes «да, это оно»; ошибка — race_phrase_no «нет, это про другое», верная фраза и её смысл; «не успел» — Пит читает верную фразу.
//  • «Скажи», два прохода (racePhrasePasses.js): после прохода 1 «да» не звучит — перед проходом 2 (pre) сразу race_phrase_again «теперь повтори фразу без остановок» (подпись над лентой — только если
//    реплика не озвучена: raceSilentLine.lineCaption по ctx().lines; озвученная — без подписи, владелец: «сабы Пита я не просил»);
//    итог прохода 2: чисто — race_phrase_yes, с паузами — race_phrase_pauses «хорошо, только без пауз», не успел — Пит читает фразу.
// Чистая логика с подставляемыми зависимостями: ctx() → { sayLine, sayText, cat, lines } (или use(c) — директор кладёт свежие после рендера), hasRu(text) — есть ли озвучка смысла, audioOf(p) — целая запись фразы,
// play(p, audio) — сыграть её, lead(word) — тишина в начале файла слова (мс), hasWord(word) — есть ли слово в библиотеке (нет — журнал «[phrase-voice] слово «…» без озвучки»: оно не прозвучит, цепочка идёт по оценке длины).
import { transRow } from './raceTrans.js'
import { phraseWords } from './racePhraseData.js'
import { phraseAudioOf, playPhraseAudio, wordLeadMs } from './racePhraseAudio.js'
import { pLog } from '../../shared/lib/debug.js'
import { RACE_LINES } from './raceLines.js'
import { lineCaption } from './raceSilentLine.js'
import { wordVoiced } from './racePhraseWordVoice.js'

export const AGAIN_LINE = 'race_phrase_again'
export const PAUSES_LINE = 'race_phrase_pauses'
const AGAIN_TEXT = RACE_LINES.find(l => l.id === AGAIN_LINE)?.text ?? ''

export const STEP_GAP_MS = 140 // между высказываниями цепочки
export const POLL_MS = 60      // Пит ещё занят — проверить снова через столько
export const CHAIN_BUSY_MS = 300 // пока цепочка не договорена, Пит «занят» хотя бы на столько (сцена не начнёт ход в паузе между высказываниями)
export const JOIN_OVERLAP_MS = 100 // по словам: следующее слово стартует раньше конца голоса прежнего не больше чем на столько (на тишину в начале своего файла)

export function createPhraseVoice({ ctx = null, hasRu = text => !!transRow(text), audioOf = p => phraseAudioOf(p), play = (p, a) => playPhraseAudio(p, a), lead = word => wordLeadMs(word), hasWord = word => wordVoiced(word), log = pLog, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let queue = [], timer = 0, active = false, cur = null
  const get = () => (ctx ? ctx() : cur)
  const busy = () => get()?.cat?.busyLeft?.() ?? 0
  const run = it => {
    const c = get() ?? {}
    if (it.line) c.sayLine?.(it.line)
    else if (it.ru) c.sayText?.(it.ru, { ru: true })
    else if (it.word) c.sayText?.(it.word, { hold: true, tight: true, onSay: ms => { it.ms = ms } }) // onSay — сколько звучит голос слова (tight: без хвоста тишины файла)
    else if (it.audio) { play(it.p, it.audio); c.cat?.holdBusy?.(Math.round((it.audio.duration || 1.5) * 1000)) }
  }
  const pump = (join = false) => {
    timer = 0
    if (!queue.length) { active = false; return }
    if (!join && busy() > 0) { timer = setTimer(() => pump(), POLL_MS); return }
    const it = queue.shift()
    run(it)
    const nx = queue[0]
    if (it.word && nx?.word && it.ms > 0) { timer = setTimer(() => pump(true), Math.max(0, it.ms - Math.min(JOIN_OVERLAP_MS, lead(nx.word)))); return } // следующее слово фразы — впритык
    timer = setTimer(() => pump(), STEP_GAP_MS)
  }
  const chain = items => { queue.push(...items.filter(Boolean)); if (!active && queue.length) { active = true; pump() } }
  /** Фраза по-английски: целая запись или по словам (впритык) */
  const phrase = p => {
    const a = audioOf(p), words = a ? [] : phraseWords(p?.text)
    const mute = words.filter(w => !hasWord(w))
    try { log(`[phrase-voice] фраза «${p?.text ?? ''}»: ${a ? 'целая запись' : `по словам (${words.length})`}`); mute.forEach(w => log(`[phrase-voice] слово «${w}» без озвучки (нет в библиотеке слов) — не прозвучит`)) } catch { /* журнал не мешает голосу */ }
    return a ? [{ audio: a, p }] : words.map(word => ({ word }))
  }
  /** Смысл по-русски — только если он озвучен (без озвучки голоса системы нет) */
  const meaning = p => (p?.ru && hasRu(p.ru) ? { ru: p.ru } : null)

  return {
    /** Свежие sayLine / sayText / cat директора (эффект после каждого рендера) */
    use: c => { cur = c },
    /** Подписаться на «Пит замолчи» (пауза): цепочка обрывается; → отписка */
    bindStop() { return get()?.cat?.onStop?.(() => { queue = []; if (timer) clearTimer(timer); timer = 0; active = false }) },
    /** Сколько мс цепочка ещё держит Пита (0 — договорил) */
    left: () => (active ? CHAIN_BUSY_MS : 0),
    /** Перед ходом (событие 'pre' сцены): e.show(text) — подпись смысла над лентой */
    pre(rep, e) {
      const t = rep?.target
      if (!t) return
      if (rep.mode === 'hear') { chain(phrase(t)); return }
      if (rep.pass === 2) { try { log(`[phrase-voice] перед ходом «${t.text ?? ''}» (say, проход 2): ${AGAIN_LINE}`) } catch { /* журнал */ } chain([{ line: AGAIN_LINE }]); const cap = lineCaption(get()?.lines, AGAIN_LINE, AGAIN_TEXT); if (cap) e?.show?.(cap); return }
      const scene = rep.mode === 'pick' && t.scene ? t.scene : '' // круг 1 — ситуация (scene), пусто — смысл; круг 2 «Скажи» — всегда смысл
      const text = scene || t.ru
      const voiced = !!text && hasRu(text)
      try { log(`[phrase-voice] перед ходом «${t.text ?? ''}» (${rep.mode}): ${scene ? 'ситуация' : 'смысл'} «${text ?? ''}»${voiced ? '' : ' (подпись, без голоса)'}`) } catch { /* журнал не мешает голосу */ }
      if (voiced) chain([{ ru: text }]); else if (text) e?.show?.(text)
    },
    /** Итог хода: kind — win / miss / fail, rep.res — что вышло */
    react(kind, rep) {
      const t = rep?.target
      if (!t) return
      if (kind === 'win' && rep.pass === 1) return // проход 1 «Скажи»: дальше сразу проход 2 со своей репликой
      if (kind === 'win') chain([...(rep.mode === 'pick' ? phrase(t) : rep.mode === 'hear' ? [meaning(t)] : []), { line: rep.pass === 2 && rep.res?.smooth === false ? PAUSES_LINE : 'race_phrase_yes' }])
      else if (kind === 'miss') chain([{ line: 'race_phrase_no' }, ...phrase(t), meaning(t)])
      else if (kind === 'fail') chain(phrase(t))
    },
    stop() { queue = []; if (timer) clearTimer(timer); timer = 0; active = false },
  }
}
