import { useState, useCallback } from 'react'
import { SAY_CANT, SAY_WRONG } from '../../shared/lib/speech/sayTriggers.js'
import { pLog } from '../../shared/lib/debug.js'
import { createXpLedger } from './xpLedger.js'

// Практический голосовой модуль не должен стоить ученику XP: ни «Я не могу говорить» (say_cant), ни три неудачи (say_wrong, ветка «неверный») не штрафуются, XP не зависят от успеха произношения,
// итог урока обязан совпасть с «модуль пройден верно» — и у вошедшего, и у гостя, и в чекпойнте. Панель при этих исходах XP не начисляет (SayPhrasePanel.finish — XP только на успехе), поэтому здесь,
// в момент закрытия модуля, тихо (без «+N XP», звука и частиц) в счётчик урока (earnedXpRef — его читают гостевой итог, чекпойнт «Продолжить» и экран итогов) добавляется ровно та доля XP,
// что дал бы успех этой ноды (xpMap). Остальное уже верно само: у залогиненного XP на конце урока начисляет сервер (complete_lesson = lessonXp урока целиком), звёзды/ошибки say_phrase не трогает
// (say_wrong по-прежнему не ошибка), пропускаемое сообщение-успех (текст) XP не даёт. Один раз на ноду — реестр xpLedger.js; say_done этим хуком не меняется (его начисляет панель, реестр не даёт задвоить).
// Возвращает: onNodeDone — обёртка над onNodeDone графа (для всех потребителей вместо него); credit — для handleXpEarned (учёт настоящего начисления,
// возвращает, сколько добавить в счётчик); revoke — для rollbackNode (шаг назад админа).
export function useSayCantXp({ onNodeDone, xpMap, earnedXpRef, setEarnedXp }) {
  const [ledger] = useState(createXpLedger)
  const done = useCallback((nodeId, result, ...rest) => {
    if (result === SAY_CANT || result === SAY_WRONG) {
      const add = ledger.quiet(nodeId, xpMap.get(nodeId) ?? 0)
      if (add > 0) {
        pLog(`[xp] ${result === SAY_CANT ? '«Я не могу говорить»' : 'три неудачи'}: тихо засчитано +${add} XP за ноду ${String(nodeId).slice(0, 8)}`)
        setEarnedXp(prev => { earnedXpRef.current = prev + add; return prev + add })
      }
    }
    return onNodeDone(nodeId, result, ...rest)
  }, [ledger, xpMap, earnedXpRef, setEarnedXp, onNodeDone])
  return { onNodeDone: done, credit: ledger.real, revoke: ledger.revoke }
}
