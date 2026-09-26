import { pLog } from '../../../../shared/lib/debug.js'
import { evaluateDictator } from './dictatorCheck.js'
import { schedulePostAudioCheck } from './dictatorPostAudio.js'
import { rememberTap } from '../../xpAnchor.js'

// Два шага прогона диктанта: конец аудио (дособрать фразу и назначить проверку
// или закрытие) и сама проверка ответа. Вынесено из TableDictatorPanel.jsx
// (тот упирался в потолок 400 строк) без изменения логики: панель зовёт их из
// тонких обёрток и передаёт значения, рефы и сеттеры своего текущего рендера —
// ровно то, что раньше видели вложенные функции handleEnded/check

export function onDictatorEnded({
  rafRef, setHudVisible, setPlaying, prevActiveRef, prevExtraRef, setHighlighted,
  setActiveExtraKeys, assembledRef, hasExtras, checkAt, timeline, cells, shuffledExtras,
  extraFromAnswer, checkOut, audioRef, timers, rfxChipsRef, rfxCheckRef, rfxCloseRef,
  addedCellsRef, setPhase, setChipsVisible, setAssembled, setExtrasAssembled, setUsedCells,
  setRevealedIds, checkRef, closeRef, answer, slideDown,
}) {
    cancelAnimationFrame(rafRef.current)   // сразу глушим RAF — иначе успеет перезаписать highlight
    setHudVisible(false)
    setPlaying(false)
    prevActiveRef.current = new Set()
    prevExtraRef.current  = new Set()
    setHighlighted(new Set())
    setActiveExtraKeys(new Set())
    const assembled_now = assembledRef.current.join(' ').trim()
    pLog(`[td-auto] ended assembled="${assembled_now}" hasExtras=${hasExtras} checkAt=${checkAt}`)

    // checkAt-режим: клипы (слова/ячейки/проверка) могут стоять ПОСЛЕ конца аудио —
    // дособираем их и планируем проверку (in) + закрытие (out) таймерами от конца аудио.
    if (checkAt != null) {
      schedulePostAudioCheck({
        timeline, cells, shuffledExtras, extraFromAnswer, checkAt, checkOut, audioRef, timers,
        rfxChipsRef, rfxCheckRef, rfxCloseRef, addedCellsRef, assembledRef,
        setPhase, setChipsVisible, setAssembled, setExtrasAssembled,
        setHighlighted, setUsedCells, setActiveExtraKeys, setRevealedIds, checkRef, closeRef,
      })
      return
    }

    if (hasExtras) {
      setPhase('extras')
      pLog(`[td-auto] → phase:extras`)
      const id = setTimeout(() => {
        setChipsVisible(true)
        pLog(`[td-auto] chips visible`)
      }, 450)
      timers.current.push(id)
    } else {
      const trigger = (!answer || assembled_now.toLowerCase() === answer.toLowerCase())
        ? 'table_correct' : 'table_wrong'
      pLog(`[td-auto] no extras → trigger=${trigger}`)
      const id = setTimeout(() => slideDown(trigger), 500)
      timers.current.push(id)
    }
}

// Проверка (in-point слоя): только показать результат (зелёный/красный).
// Закрытие модуля запускает out-point слоя (closeModule) — либо задержка для легаси.
export function runDictatorCheck({
  checkOut, timers, answer, assembled, extrasAssembled, tokens, closeTriggerRef, closeVariantRef,
  distractors, setResult, xpAmount, xpFiredRef, panelRef, onXpEarned, checkDelay, closeModule,
}) {
    if (assembled.length === 0 && extrasAssembled.length === 0) {
      pLog(`[td-auto] check SKIPPED — state empty (double-play reset?)`)
      return
    }
    const { isCorrect } = evaluateDictator({ tokens, assembled, extrasAssembled, answer })
    const trigger = isCorrect ? 'table_correct' : 'table_wrong'
    closeTriggerRef.current = trigger
    // Особый переход конкретного слова-ловушки (nodeVariants.js) — если в
    // собранном ответе есть распознанный distractor
    closeVariantRef.current = isCorrect
      ? null
      : distractors.find(d => extrasAssembled.some(t => t.value === d.text))?.id ?? null
    setResult(isCorrect ? 'correct' : 'wrong')
    // XP объявляем здесь же. Тапов в диктанте нет (фразу собирает таймлайн),
    // поэтому запасная точка старта — бокс собранного ответа: единственное
    // место, где ученик свой ответ и видел. Уйдёт ответ в переписку — цифра
    // полетит от пузыря (xpAnchor.js). xpFiredRef: проверку запускают разные
    // пути (RAF, хвост после аудио, легаси-таймер), награда одна на прогон
    if (isCorrect && xpAmount > 0 && !xpFiredRef.current) {
      xpFiredRef.current = true
      const box = panelRef.current?.querySelector('.tdAssemblyBox')
      if (box) rememberTap(box.getBoundingClientRect())
      onXpEarned?.(xpAmount)
    }
    // Легаси (нет out-point у слоя проверки) — закрываем по задержке
    if (checkOut == null) timers.current.push(setTimeout(() => closeModule(), checkDelay))
}
