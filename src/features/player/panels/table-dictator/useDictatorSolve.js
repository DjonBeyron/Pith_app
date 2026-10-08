import { useEffect, useRef, useState } from 'react'
import { pLog } from '../../../../shared/lib/debug.js'
import { dictatorSolvedState } from './solveCorrect.js'

// Авто-ответ админа в диктанте (SolveCorrectButton → TableDictatorPanel).
// Фразу здесь собирает таймлайн, ученик ничего не нажимает, так что «собрать
// верный ответ» = перемотать прогон в конец: остановить аудио/часы и RAF,
// положить в бокс всё, что к проверке собралось бы само (solveCorrect.js),
// и запустить ту же проверку (checkRef → runDictatorCheck: результат, XP один
// раз, закрытие) — дальше панель уходит обычным путём.
//
// Проверка замыкает assembled/extrasAssembled текущего рендера, поэтому
// зовётся после коммита нового состояния (tick). Флаги rfx* поднимаем, чтобы
// RAF/хвост после аудио не собрали и не проверили второй раз, если успеют
// тикнуть; таймеры прогона гасим. Закрытие: легаси (нет out-point клипа
// проверки) планирует сам runDictatorCheck; с out-point его ставил RAF по
// времени аудио — аудио стоит, ставим сами через checkDelay.
export function useDictatorSolve({
  tokens, shuffledExtras, hasExtras, checkOut, checkDelay, result,
  audioRef, rafRef, timers, assembledRef,
  rfxPhaseRef, rfxChipsRef, rfxAssembRef, rfxCheckRef, rfxCloseRef, closedRef,
  checkRef, closeRef,
  setPlaying, setHudVisible, setHighlighted, setActiveExtraKeys, setPhase, setChipsVisible,
  setAssembled, setExtrasAssembled, setUsedCells,
}) {
  const armed = useRef(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!armed.current) return
    armed.current = false
    checkRef.current?.()
    if (checkOut != null) timers.current.push(setTimeout(() => closeRef.current?.(), checkDelay))
  }, [tick]) // eslint-disable-line react-hooks/exhaustive-deps

  function solve() {
    if (result || closedRef.current || armed.current) return
    const s = dictatorSolvedState({ tokens, shuffledExtras })
    if (!s) { pLog('[td-solve] слово вне таблицы без чипа — автосборка отменена'); return }
    pLog(`[td-solve] админ: прогон останавливаем, в бокс: [${[...s.assembled, ...s.extrasAssembled.map(t => t.value)].join('|')}]`)
    try { audioRef.current?.pause?.() } catch { /* часы/прогретый элемент — пауза может быть пустышкой */ }
    cancelAnimationFrame(rafRef.current)
    timers.current.forEach(clearTimeout) // список не чистим — повторный clearTimeout при анмаунте безвреден
    for (const r of [rfxPhaseRef, rfxChipsRef, rfxAssembRef, rfxCheckRef, rfxCloseRef]) r.current = true
    assembledRef.current = [...s.assembled]
    setPlaying(false)
    setHudVisible(false)
    setHighlighted(new Set())
    setActiveExtraKeys(new Set())
    // Ответа у ноды нет (таблица только показывает подсветку) — проверять
    // нечего, runDictatorCheck такое состояние пропускает; закрываем сразу как
    // верный — ровно так заканчивается и обычный прогон без ответа
    if (s.assembled.length === 0 && s.extrasAssembled.length === 0) { closeRef.current?.(); return }
    if (hasExtras) { setPhase('extras'); setChipsVisible(true) }
    setUsedCells(new Set(s.usedCellIds))
    setAssembled(s.assembled)
    setExtrasAssembled(s.extrasAssembled)
    armed.current = true
    setTick(t => t + 1)
  }

  return solve
}
