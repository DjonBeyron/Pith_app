import { useState } from 'react'
import NodeTableTts from './NodeTableTts.jsx'
import WordLaneEditorModal from './word-lane/WordLaneEditorModal.jsx'
import { defaultScript } from '../player/modules/rotate-phone/wordLaneConfig.js'
import { fillsFromTimings, defaultFills, normalizeFills } from '../player/modules/rotate-phone/wordLanePlan.js'
import { NO_AUTOCORRECT } from '../../shared/lib/noAutoCorrectProps.js'

// Нода «Переверни телефон» — вертикальная игра «Повтори за диктором»: слово (латиница), перевод, озвучка диктора и таймлайн.
// «🔊 Озвучить» — ElevenLabs (тот же генератор, что у таблицы-диктора: NodeTableTts): текст — сценарий диктора (пусто → слово трижды), из ответа берутся тайминги слов, и таймлайн
// (три клипа — слова диктора, по пилюле на каждое) расставляется сам. «⏱ Таймлайн» — монтажный стол таблицы: поправить клипы руками. Без озвучки слово звучит из библиотеки озвучки слов (collectLessonWords)
// или голосом системы. Слово пустое — игра идёт встроенным словом (wordLaneConfig.DEMO_WORD). Текст карточки в чате правится выше, в общем поле content.
export default function NodeRotatePhonePicker({ tData, onDataChange, lessonFiles, onPickFile, onRemoveFile }) {
  const [open, setOpen] = useState(false)
  const word = (tData.word ?? '').trim()
  const script = (tData.script ?? '').trim() || (word ? defaultScript(word) : '')
  const fills = normalizeFills(tData.fills)

  // Новый файл — старые производные поля сбрасываются, настоящие придут следом через onAnalyzed (как у таблицы)
  function handlePick(file) {
    const id = onPickFile(file)
    onDataChange({ file_id: id, waveformData: null, duration: null, wordTimings: null })
    return id
  }
  // Озвучка готова: волна, длительность и тайминги слов; по таймингам сразу расставляем клипы (не нашлись три слова — равномерные, поправить руками)
  function handleAnalyzed(patch) {
    onDataChange({ ...patch, fills: fillsFromTimings(patch.wordTimings, word, patch.duration) ?? defaultFills(patch.duration) })
  }

  return (
    <div className="nodeRotateTrainer" onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
      <input className="nodeRotateInput" value={tData.word ?? ''} onChange={e => onDataChange({ word: e.target.value })}
        placeholder="Слово для повтора, например: try" {...NO_AUTOCORRECT} />
      <input className="nodeRotateInput" value={tData.translation ?? ''} onChange={e => onDataChange({ translation: e.target.value })}
        placeholder="Перевод — ученик получит его в финале" {...NO_AUTOCORRECT} />
      <input className="nodeRotateInput" value={tData.script ?? ''} onChange={e => onDataChange({ script: e.target.value })}
        placeholder={word ? `Что скажет диктор (пусто → «${defaultScript(word)}»)` : 'Что скажет диктор (пусто → слово трижды)'} {...NO_AUTOCORRECT} />
      <div className="nodeRotateTrainerRow">
        <NodeTableTts fileId={tData.file_id} text={script} onPick={handlePick} onAnalyzed={handleAnalyzed} onRemoveOldFile={onRemoveFile} />
      </div>
      <div className="nodeRotateTrainerRow">
        <button type="button" className="nodeTablePickerBtn" onClick={() => setOpen(true)} disabled={!tData.file_id && !word}>⏱ Таймлайн</button>
        <span className="nodeRotateTrainerInfo">
          {tData.file_id ? (fills ? 'озвучка есть · пилюли по таймлайну' : 'озвучка есть · таймлайн не расставлен') : 'без озвучки — слово из библиотеки озвучки слов / голос системы'}
        </span>
      </div>
      {open && (
        <WordLaneEditorModal tData={tData} lessonFiles={lessonFiles} onPickFile={onPickFile}
          onSave={data => onDataChange(data)} onClose={() => setOpen(false)} />
      )}
    </div>
  )
}
