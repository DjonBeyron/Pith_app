import { useEffect } from 'react'
import { pLog } from '../../../../shared/lib/debug.js'

// Легаси-режим диктанта: у слов вне таблицы НЕТ своих word-слоёв в таймлайне
// и не задан checkAt. Тогда некому собирать фразу по времени — собираем всё
// разом после появления чипов и через checkDelay запускаем проверку.
//
// Вынесено из TableDictatorPanel.jsx: это отдельная ветка сценария, которая
// к основному (RAF по таймлайну) отношения не имеет и только мешала читать
// панель. Условия выхода те же, что и были, — менять их нельзя: при
// checkAt != null или hasExtraLayers сборкой управляет useTableDictatorRaf,
// и второй источник разом переписывал extrasAssembled поверх него (именно это
// и «дёргало» интерфейс на последнем слове).
export function useDictatorLegacyAssemble({
  chipsVisible, checkAt, hasExtraLayers, checkDelay,
  shuffledExtras, extraFromAnswer, assembledRef, setExtrasAssembled, checkRef, timers,
}) {
  useEffect(() => {
    if (!chipsVisible) return
    if (checkAt != null) return  // RAF управляет сборкой (checkAt-режим)
    if (hasExtraLayers) return   // RAF уже собирает слова поштучно по их word-слоям

    // Ждём окончания анимации чипов, потом собираем слова
    const staggerEnd = shuffledExtras.length * 50 + 350
    pLog(`[td-auto] chipsVisible: staggerEnd=${staggerEnd}ms assembledNow=[${assembledRef.current.join('|')}]`)
    const assembleId = setTimeout(() => {
      pLog(`[td-auto] auto-assemble: assembledRef=[${assembledRef.current.join('|')}] extraFromAnswer=[${extraFromAnswer.join('|')}]`)
      const usedIdx    = new Set()
      const toAssemble = extraFromAnswer.map(word => {
        const idx = shuffledExtras.findIndex((w, i) => w === word && !usedIdx.has(i))
        if (idx === -1) {
          pLog(`[td-auto] WARN: "${word}" не найдено в shuffledExtras=[${shuffledExtras.join('|')}]`)
          return null
        }
        usedIdx.add(idx)
        return { value: word, key: `extra-${idx}` }
      }).filter(Boolean)
      pLog(`[td-auto] toAssemble=[${toAssemble.map(t => t.value).join('|')}]`)
      if (toAssemble.length > 0) setExtrasAssembled(toAssemble)
      const id = setTimeout(() => {
        pLog(`[td-auto] auto-check fired +${checkDelay}ms`)
        checkRef.current?.()
      }, checkDelay)
      timers.current.push(id)
    }, staggerEnd)

    timers.current.push(assembleId)
  }, [chipsVisible]) // eslint-disable-line
}
