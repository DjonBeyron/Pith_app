import * as H from '../draftHistory.js'
import { sameScene } from '../builderModel.js'

// Переходы состояния черновика { scene, saved, hist } — чистые функции для useBuilderDraft (React только хранит
// состояние). Отдельно от хука, чтобы историю проверять тестами без DOM.

export const initialState = (scene, saved) => ({ scene, saved, hist: H.emptyHistory() })

// Правка сцены отдельным шагом истории (или склеенным по key); fn вернула ту же сцену — состояние не меняется
export function editState(st, label, fn, key = null, at = Date.now()) {
  const next = fn(st.scene)
  return next === st.scene ? st : { ...st, scene: next, hist: H.pushStep(st.hist, { before: { scene: st.scene }, label, key, at }) }
}

// Заменить сцену целиком (загрузка, «Новая», JSON). nextSaved — новая привязка к библиотеке (null — не менять):
// шаг истории тогда помнит и прежнюю привязку. Та же сцена — шага нет, только привязка
export function swapState(st, label, next, nextSaved = null, at = Date.now()) {
  if (sameScene(st.scene, next)) return nextSaved ? { ...st, saved: nextSaved } : st
  const before = nextSaved ? { scene: st.scene, saved: st.saved } : { scene: st.scene }
  return { scene: next, saved: nextSaved ?? st.saved, hist: H.pushStep(st.hist, { before, label, key: null, at }) }
}

// Отмена/повтор: op — H.undo | H.redo; пустой стек — состояние то же
export function stepState(st, op) {
  const r = op(st.hist, st)
  return r ? { scene: r.state.scene, saved: r.state.saved ?? st.saved, hist: r.history } : st
}
