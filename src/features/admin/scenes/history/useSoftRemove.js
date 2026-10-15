import { useState, useEffect } from 'react'
import { createSoftRemover } from './softRemover.js'

// React-обёртка над softRemover: { hidden, pending, schedule, cancel, flush }. commit(id) — настоящее удаление
// (useSceneLibrary: scenesApi.deleteScene). При закрытии окна отложенное удаление выполняется сразу.
export function useSoftRemove({ commit, delay }) {
  const [view, setView] = useState({ hidden: [], pending: null })
  const [remover] = useState(() => createSoftRemover({ commit, onChange: setView, delay }))
  useEffect(() => { remover.setCommit(commit) }, [remover, commit])
  useEffect(() => () => remover.flush(), [remover])
  return { ...view, schedule: remover.schedule, cancel: remover.cancel, flush: remover.flush }
}
