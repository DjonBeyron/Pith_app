import { useState, useEffect } from 'react'
import { pLog } from '../../shared/lib/debug.js'
import { createRaceSpeech } from './raceSpeech.js'

// Адаптер секвенсора речи гонки (raceSpeech.js) к React и к Питу (useCatLines, useWordLaneFlow). Команда «сказать похвалу» = sayLine(id, null, { pause: 0, onSpeak, onEnd }): onEnd — РЕАЛЬНЫЙ конец звука (ended источника),
// «занят» после неё не держится (отступ ведёт секвенсор). Команда «сказать перевод» = разрешение (holdMs() → 0): движок шлёт 'pre', директор (useRaceActs.pre) говорит перевод через speakTranslation: sayText получает onSay
// (звук пошёл, длина в мс) и onEnd (перевод доиграл). Паузу и выход (cat.stop, размонтирование) секвенсор переживает сбросом. Вне гонки (on = false) всё это не используется — репетиция работает по-старому
// (sayLineLater / praiseTakeoff).
const makeSpeech = live => createRaceSpeech({ log: pLog, say: { praise: (id, h) => live.sayLine?.(id, null, { onSpeak: h.onSpeak, onEnd: h.onEnd, pause: 0 }) } }) // live — коробка со свежим sayLine (put) (настройки реплик могут догрузиться)

const put = (live, v) => { live.sayLine = v.sayLine; live.cat = v.cat }

export function useRaceSpeech({ on, cat, sayLine }) {
  const [live] = useState(() => ({ cat, sayLine }))
  useEffect(() => { put(live, { cat, sayLine }) })
  const [speech] = useState(() => makeSpeech(live))
  useEffect(() => {
    if (!on) return undefined
    const off = live.cat?.onStop?.(() => speech.reset('пауза'))
    return () => { off?.(); speech.reset('выход') }
  }, [on, speech, live])
  return speech
}

/** Перевод / слово перед выездом пилюли: say(opts) — вызвать sayText с этими opts. Не зазвучало (нет озвучки) — секвенсору «перевода нет» (пилюля выезжает сразу) */
export function speakTranslation(speech, say) {
  let sound = false
  say({ onSay: ms => { sound = true; speech.translation(ms) }, onEnd: () => speech.speechEnd('trans') })
  if (!sound) speech.translation(0)
}
