// Голос Пита на этапе 2 «Фразы» (CONCEPT_RACE.md, «Этап 2» → «Лента и круги»): что он говорит перед ходом и после итога хода. Директор гонки (useRaceActs) зовёт pre / react, сцена ленты (racePhraseScene.js)
// ждёт, пока Пит договорит (pitLeft: занятость Пита + left() этой цепочки). Цепочка — по одному высказыванию: следующее ждёт, пока Пит освободится (cat.busyLeft), затем STEP_GAP_MS.
//  • перед ходом: круги «Пойми» и «Скажи» — смысл по-русски (sayText(ru, { ru: true }) — озвучка word_audio по transKey); озвучки смысла нет — молча, подпись над лентой (e.show);
//    круг «Узнай» (пальцами) — фраза по-английски (целая озвучка phrase.audio; нет — по словам из библиотеки, sayText(слово, { hold: true }));
//  • верно — фраза (круг 1) и race_phrase_yes «да, это оно»; ошибка — race_phrase_no «нет, это про другое», верная фраза и её смысл; «не успел» — Пит читает верную фразу.
// Чистая логика с подставляемыми зависимостями: ctx() → { sayLine, sayText, cat } (или use(c) — директор кладёт свежие после рендера), hasRu(text) — есть ли озвучка смысла, play(url) — целая фраза.
import { transRow } from './raceTrans.js'
import { playTrack } from '../player/modules/rotate-phone/wordLaneVoice.js'
import { phraseWords } from './racePhraseData.js'

export const STEP_GAP_MS = 140 // между высказываниями цепочки
export const POLL_MS = 60      // Пит ещё занят — проверить снова через столько
export const CHAIN_BUSY_MS = 300 // пока цепочка не договорена, Пит «занят» хотя бы на столько (сцена не начнёт ход в паузе между высказываниями)

export function createPhraseVoice({ ctx = null, hasRu = text => !!transRow(text), play = url => playTrack(url), setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let queue = [], timer = 0, active = false, cur = null
  const get = () => (ctx ? ctx() : cur)
  const busy = () => get()?.cat?.busyLeft?.() ?? 0
  const run = it => {
    const c = get() ?? {}
    if (it.line) c.sayLine?.(it.line)
    else if (it.ru) c.sayText?.(it.ru, { ru: true })
    else if (it.word) c.sayText?.(it.word, { hold: true })
    else if (it.audio) { play(it.audio.url); c.cat?.holdBusy?.(Math.round((it.audio.duration || 1.5) * 1000)) }
  }
  const pump = () => {
    timer = 0
    if (!queue.length) { active = false; return }
    if (busy() > 0) { timer = setTimer(pump, POLL_MS); return }
    run(queue.shift())
    timer = setTimer(pump, STEP_GAP_MS)
  }
  const chain = items => { queue.push(...items.filter(Boolean)); if (!active && queue.length) { active = true; pump() } }
  /** Фраза по-английски: целая озвучка или по словам */
  const phrase = p => (p?.audio?.url ? [{ audio: p.audio }] : phraseWords(p?.text).map(word => ({ word })))
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
      const m = meaning(t)
      if (m) chain([m]); else if (t.ru) e?.show?.(t.ru)
    },
    /** Итог хода: kind — win / miss / fail, rep.res — что вышло */
    react(kind, rep) {
      const t = rep?.target
      if (!t) return
      if (kind === 'win') chain([...(rep.mode === 'pick' ? phrase(t) : rep.mode === 'hear' ? [meaning(t)] : []), { line: 'race_phrase_yes' }])
      else if (kind === 'miss') chain([{ line: 'race_phrase_no' }, ...phrase(t), meaning(t)])
      else if (kind === 'fail') chain(phrase(t))
    },
    stop() { queue = []; if (timer) clearTimer(timer); timer = 0; active = false },
  }
}
