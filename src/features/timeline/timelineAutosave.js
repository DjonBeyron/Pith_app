// Автосохранение «Таймлайна игры» на сервер (CONCEPT_TIMELINE.md, «Последние игры на сервере»): игра кончилась (событие end трассы) → прохождение уходит в строку app_settings (shared/api/timelineApi.js),
// чтобы сыграть на телефоне, а смотреть на ПК. Игровой код об этом не знает: подписка на трассу (sceneTrace.onEnd), а не вызов из игры.
// Правила: только у админа (setAdmin — из App.jsx, настоящий статус админа; не админ — подписки нет, ничего не читаем и не пишем); только доигранная игра (isFinished: дошла до итога; вышел раньше —
// остаётся кнопка «☁ Сохранить на сервер» на экране таймлайна); не чаще одного раза на прохождение; «выстрелил и забыл» — подписчик возвращается сразу, упаковка и сеть отложены (defer),
// ответа никто не ждёт, отказ — только строка журнала (её пишет saveTimeline). Игра от сервера не зависит.
import { useEffect } from 'react'
import { sceneTrace } from '../../shared/lib/sceneTrace.js'
import { saveTimeline } from '../../shared/api/timelineApi.js'
import { pLog } from '../../shared/lib/debug.js'
import { packRun, isFinished } from './timelineStore.js'

export function createAutosave({ trace = sceneTrace, save = saveTimeline, pack = packRun, log = pLog, defer = fn => setTimeout(fn, 0) } = {}) {
  let off = null
  const done = new WeakSet() // прохождения, которые уже отправлены
  const onEnd = run => {
    if (!run || done.has(run)) return
    if (!isFinished(run)) { log('[timeline] игра закрыта до итога — автосохранения на сервер нет (на экране таймлайна есть кнопка «☁ Сохранить на сервер»)'); return }
    done.add(run)
    defer(() => { try { Promise.resolve(save(pack(run))).catch(() => { /* saveTimeline не бросает; чужая подмена — молчим */ }) } catch (e) { log(`[timeline] автосохранение не запустилось: ${e?.message ?? e}`) } })
  }
  return {
    /** Включить (админ) или выключить подписку на конец прохождения */
    setAdmin(on) {
      if (on && !off) off = trace.onEnd(onEnd)
      else if (!on && off) { off(); off = null }
    },
    active: () => !!off,
  }
}

/** Общее автосохранение страницы */
export const timelineAutosave = createAutosave()

/** Хук для App.jsx: автосохранение работает, пока пользователь — админ */
export function useTimelineAutosave(isAdmin) {
  useEffect(() => { timelineAutosave.setAdmin(!!isAdmin); return () => timelineAutosave.setAdmin(false) }, [isAdmin])
}
