import { useState, useCallback } from 'react'
import { readTapMode, writeTapMode } from '../player/modules/rotate-phone/wordLaneHudSettings.js'
import { readVoiceChoice, writeVoiceChoice, tapFor, createTapGuard } from './raceAskVoice.js'

// Состояние попапа «Говорю / Тапаю» внутри игры (RaceAskPlate.jsx, raceAskVoice.js). pick(choice) зовут ИЗ обработчика тапа по кнопке попапа (свежий жест): выбор запоминается (подсветка по умолчанию), режим тапа
// (pithy_wl_tap_v1) на эту игру выставляется — «Тапаю» включает, «Говорю» выключает, прежнее значение запоминается (createTapGuard), — и onTap сообщает наружу (блок стенда показывает флажок). watch(status) зовут на смене
// фазы модуля: пока виден попап (ask: ждём микрофон или его не дали) и идёт игра (game) — ждём; попап закрыт крестиком или игра кончилась — прежний режим тапа возвращается.
export default function useRaceAsk({ onTap = null, store = globalThis.localStorage } = {}) {
  const [choice, setChoice] = useState(() => readVoiceChoice(store))
  const [guard] = useState(createTapGuard) // помнит прежнее значение режима тапа до конца игры

  const pick = useCallback(picked => {
    writeVoiceChoice(picked, store); setChoice(picked)
    guard.begin(readTapMode(store))
    writeTapMode(tapFor(picked), store); onTap?.(tapFor(picked))
  }, [guard, onTap, store])

  const watch = useCallback(status => {
    const back = guard.watch(status)
    if (back == null) return
    writeTapMode(back, store); onTap?.(back)
  }, [guard, onTap, store])

  return { choice, pick, watch }
}
