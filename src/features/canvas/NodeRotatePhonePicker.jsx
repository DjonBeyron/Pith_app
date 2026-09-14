import { useState } from 'react'
import NodeTableTts from './NodeTableTts.jsx'
import SpeechLaneEditorModal from './speech-lane/SpeechLaneEditorModal.jsx'
import { scriptFromLayers } from '../../shared/lib/speechLanePrepare.js'

// Нода «Переверни телефон» — голосовой тренажёр после поворота: сценарий
// озвучки диктора, «🔊 Озвучить» (тот же генератор, что у таблицы-диктора —
// NodeTableTts, ему всё равно, чья нода) и кнопка монтажного стола
// (SpeechLaneEditorModal): дорожки слов, нарезка озвучки. «⤓ Из дорожек»
// собирает сценарий из уже расставленных слов диктора в порядке их вылетов —
// путь «сначала дорожки, потом озвучка»: расставил → подхватил текст →
// озвучил → «🪄 Смонтировать» положит вылеты по звуку. Текст самой карточки
// «переверни» правится выше, в общем поле content.
export default function NodeRotatePhonePicker({ tData, onDataChange, lessonFiles, onPickFile, onRemoveFile }) {
  const [open, setOpen] = useState(false)
  const layers = tData.timeline?.layers ?? []
  const coach = layers.filter(l => l.role !== 'user' && l.role !== 'translation').length
  const user  = layers.filter(l => l.role === 'user').length
  const fromLayers = scriptFromLayers(layers)

  // Как у таблицы: пикнули файл — сразу сбросили производные поля, настоящие
  // значения придут следом через onAnalyzed. Нарезку тоже сбрасываем: она
  // была под старый файл
  function handleScriptAudioPick(file) {
    const id = onPickFile(file)
    onDataChange({ file_id: id, waveformData: null, wordTimings: null, duration: null, audioClips: null })
  }

  // Сценарий из дорожек: перезаписать чужой текст — только с подтверждением
  function pickFromLayers() {
    if (!fromLayers) return
    const cur = (tData.script ?? '').trim()
    if (cur && cur !== fromLayers && !window.confirm('Заменить сценарий текстом из дорожек диктора?')) return
    onDataChange({ script: fromLayers })
  }

  return (
    <div className="nodeRotateTrainer" onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
      <textarea
        className="nodeTableScript"
        value={tData.script ?? ''}
        onChange={e => onDataChange({ script: e.target.value })}
        placeholder="Сценарий диктора: «I. I. I. Try. Try. Try. I try. I try. I try.» — паузы для ученика нарежете в тренажёре"
      />
      <div className="nodeRotateTrainerRow">
        <NodeTableTts
          fileId={tData.file_id}
          text={tData.script ?? ''}
          onPick={handleScriptAudioPick}
          onAnalyzed={patch => onDataChange(patch)}
          onRemoveOldFile={onRemoveFile}
        />
        <button type="button" className="nodeRotatePickBtn" onClick={pickFromLayers} disabled={!fromLayers}
          title={fromLayers ? `Подхватить текст и порядок слов диктора из дорожек: «${fromLayers}»` : 'Сначала добавьте дорожки диктора в тренажёре'}>
          ⤓ Из дорожек
        </button>
      </div>
      <div className="nodeRotateTrainerRow">
        <button type="button" className="nodeTablePickerBtn" onClick={() => setOpen(true)}>
          🎤 Тренажёр
        </button>
        <span className="nodeRotateTrainerInfo">
          {layers.length
            ? `${coach} диктор · ${user} ученик · ${tData.timelineLen ?? '—'} с`
            : 'дорожек пока нет'}
          {tData.file_id ? '' : ' · без озвучки'}
        </span>
      </div>
      {open && (
        <SpeechLaneEditorModal
          tData={tData}
          lessonFiles={lessonFiles}
          onPickFile={onPickFile}
          onSave={data => onDataChange(data)}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}
