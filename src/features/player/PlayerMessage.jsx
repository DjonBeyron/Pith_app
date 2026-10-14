/* eslint-disable react-hooks/static-components --
   Module берётся из СТАТИЧНОЙ карты modules/index.js по типу ноды: ссылка
   стабильна между рендерами, это не создание компонента в рендере */
import { useEffect } from 'react'
import { resolveModule } from './modules/index.js'
import UnknownNodeFallback from './modules/UnknownNodeFallback.jsx'

// Типы, вырезанные из приложения намеренно (нода могла остаться в старом уроке): не рисуем и сразу «готово», иначе урок встанет.
// Показывать для них «требует обновления» нельзя — обновление не поможет
const REMOVED_NODE_TYPES = new Set(['voice_record'])

export default function PlayerMessage({ node, file, lessonFiles, lessonNodes, teacherName, photoChoiceState, wordChoiceState, allWordChoiceStates, allPhotoChoiceStates, allPhraseStates, phraseState, regState, tableSent, tableArriving, bottomOffset, videoAutoSound, adminPreview, pending, onDone, onTrReveal, onOpenLessonRef }) {
  const Module = resolveModule(node.type)
  const removed = !Module && REMOVED_NODE_TYPES.has(node.type)
  useEffect(() => { if (removed) onDone?.() }, [removed, onDone])
  if (removed) return null
  // Тип без модуля, которого нет в ЭТОЙ сборке (ученик на устаревшей версии): фолбэк «Обновить» / «Пропустить» — урок не зависает
  if (!Module) return <UnknownNodeFallback node={node} pending={pending} onDone={onDone} />
  return <Module node={node} file={file} lessonFiles={lessonFiles} lessonNodes={lessonNodes} teacherName={teacherName} photoChoiceState={photoChoiceState} wordChoiceState={wordChoiceState} allWordChoiceStates={allWordChoiceStates} allPhotoChoiceStates={allPhotoChoiceStates} allPhraseStates={allPhraseStates} phraseState={phraseState} regState={regState} tableSent={tableSent} tableArriving={tableArriving} bottomOffset={bottomOffset} videoAutoSound={videoAutoSound} adminPreview={adminPreview} pending={pending} onDone={onDone} onTrReveal={onTrReveal} onOpenLessonRef={onOpenLessonRef} />
}
