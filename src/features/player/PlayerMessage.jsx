/* eslint-disable react-hooks/static-components --
   Module берётся из СТАТИЧНОЙ карты modules/index.js по типу ноды: ссылка
   стабильна между рендерами, это не создание компонента в рендере */
import { useEffect } from 'react'
import { resolveModule } from './modules/index.js'

export default function PlayerMessage({ node, file, lessonFiles, lessonNodes, teacherName, photoChoiceState, wordChoiceState, allWordChoiceStates, allPhotoChoiceStates, allPhraseStates, phraseState, regState, tableSent, tableArriving, bottomOffset, videoAutoSound, adminPreview, pending, onDone, onTrReveal, onOpenLessonRef }) {
  const Module = resolveModule(node.type)
  // Тип без модуля (например, удалённый voice_record в старом уроке): не рисуем и сразу «готово», иначе урок встанет на этой ноде
  useEffect(() => { if (!Module) onDone?.() }, [Module, onDone])
  if (!Module) return null
  return <Module node={node} file={file} lessonFiles={lessonFiles} lessonNodes={lessonNodes} teacherName={teacherName} photoChoiceState={photoChoiceState} wordChoiceState={wordChoiceState} allWordChoiceStates={allWordChoiceStates} allPhotoChoiceStates={allPhotoChoiceStates} allPhraseStates={allPhraseStates} phraseState={phraseState} regState={regState} tableSent={tableSent} tableArriving={tableArriving} bottomOffset={bottomOffset} videoAutoSound={videoAutoSound} adminPreview={adminPreview} pending={pending} onDone={onDone} onTrReveal={onTrReveal} onOpenLessonRef={onOpenLessonRef} />
}
