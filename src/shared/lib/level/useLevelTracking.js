import { useEffect } from 'react'
import { startLevelTracking, stopLevelTracking, setLevelUser } from './levelFeed.js'

// Хук оболочки (ShellV2): оценка уровня по событиям журнала (levelFeed.js). Слежение живёт всё время работы
// приложения; вход/выход — перечитать профиль и перенести уровень гостя на сервер. Сложность слайдов
// лента отдаёт сама (setModuleLookup в useFeedModules).
export function useLevelTracking(userId) {
  useEffect(() => {
    startLevelTracking({ userId })
    return stopLevelTracking
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setLevelUser(userId) }, [userId])
}
