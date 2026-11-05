import { useState, useCallback } from 'react'
import { readTapMode, writeTapMode } from '../../player/modules/rotate-phone/wordLaneHudSettings.js'
import { readVoiceChoice, writeVoiceChoice, tapFor, createTapGuard } from '../../pitrace/raceAskVoice.js'

// Плашка-вопрос «Говорю / Тапаю» перед стартом гонки в стенде (RaceAsk.jsx, raceAskVoice.js). Тап по «Запустить» (любой кнопки запуска) только открывает плашку: игра и звук ещё не стартуют. Выбор — тап по кнопке плашки, а это
// свежий жест, поэтому launch(round) (нода раунда синхронно + start() модуля → startGameAudio: микрофон, звук, полный экран) вызывается ИЗ ЭТОГО обработчика. «Тапаю» включает режим тапа (pithy_wl_tap_v1) на эту игру, «Говорю» выключает;
// прежнее значение режима запоминается и возвращается, когда игра закончилась (watch(status) от модуля: был phase 'game', потом нет; не запустилась из-за проблемы с микрофоном — тоже). Выбор сохраняется для подсветки по умолчанию.
export default function useRaceAsk({ launch, onTap, store = globalThis.localStorage }) {
  const [ask, setAsk] = useState(null)                       // { round } — плашка открыта и ждёт выбора
  const [choice, setChoice] = useState(() => readVoiceChoice(store))
  const [guard] = useState(createTapGuard)                   // охранник режима тапа (createTapGuard): помнит прежнее значение до конца игры

  const open = useCallback(round => setAsk({ round }), [])
  const cancel = useCallback(() => setAsk(null), [])
  const pick = useCallback(picked => {
    if (!ask) return
    writeVoiceChoice(picked, store); setChoice(picked)
    guard.begin(readTapMode(store))
    writeTapMode(tapFor(picked), store); onTap(tapFor(picked))
    setAsk(null)
    launch(ask.round) // тот же жест: нода раунда и start() модуля
  }, [ask, guard, launch, onTap, store])

  /** Статус модуля игры (onStatus): игра кончилась — прежний режим тапа возвращается */
  const watch = useCallback(status => {
    const back = guard.watch(status)
    if (back == null) return
    writeTapMode(back, store); onTap(back)
  }, [guard, onTap, store])

  return { ask, choice, open, cancel, pick, watch }
}
