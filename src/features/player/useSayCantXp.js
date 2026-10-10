import { useState, useCallback } from 'react'
import { SAY_CANT } from '../../shared/lib/speech/sayTriggers.js'
import { pLog } from '../../shared/lib/debug.js'
import { createXpLedger } from './xpLedger.js'

// «Я не могу говорить» (итог say_cant модуля «Сказать фразу») не должен стоить ученику XP: пропуск не штрафуется, итог урока обязан совпасть с «модуль пройден верно».
// Панель при say_cant XP не начисляет (SayPhrasePanel.finish — XP только на успехе), поэтому здесь, в момент закрытия модуля, тихо (без «+N XP», звука и частиц)
// в счётчик урока (earnedXpRef — его читают гостевой итог, чекпойнт «Продолжить» и экран итогов) добавляется ровно та доля XP, что дал бы успех этой ноды (xpMap).
// Остальное уже верно само: у залогиненного XP на конце урока начисляет сервер (complete_lesson = lessonXp урока целиком), звёзды/ошибки say_phrase не трогает,
// пропускаемое сообщение-успех (текст) XP не даёт. Один раз на ноду — реестр xpLedger.js; say_wrong (три неудачи) и say_done этим хуком не меняются.
// Возвращает: onNodeDone — обёртка над onNodeDone графа (для всех потребителей вместо него); credit — для handleXpEarned (учёт настоящего начисления,
// возвращает, сколько добавить в счётчик); revoke — для rollbackNode (шаг назад админа).
export function useSayCantXp({ onNodeDone, xpMap, earnedXpRef, setEarnedXp }) {
  const [ledger] = useState(createXpLedger)
  const done = useCallback((nodeId, result, ...rest) => {
    if (result === SAY_CANT) {
      const add = ledger.quiet(nodeId, xpMap.get(nodeId) ?? 0)
      if (add > 0) {
        pLog(`[xp] «Я не могу говорить»: тихо засчитано +${add} XP за ноду ${String(nodeId).slice(0, 8)}`)
        setEarnedXp(prev => { earnedXpRef.current = prev + add; return prev + add })
      }
    }
    return onNodeDone(nodeId, result, ...rest)
  }, [ledger, xpMap, earnedXpRef, setEarnedXp, onNodeDone])
  return { onNodeDone: done, credit: ledger.real, revoke: ledger.revoke }
}
