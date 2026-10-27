import { useState } from 'react'
import NodeTableTts from './NodeTableTts.jsx'
import WordLaneEditorModal from './word-lane/WordLaneEditorModal.jsx'
import CatLinesPanel from './word-lane/CatLinesPanel.jsx'
import { defaultScript } from '../player/modules/rotate-phone/wordLaneConfig.js'
import { fillsFromTimings, defaultFills, normalizeFills } from '../player/modules/rotate-phone/wordLanePlan.js'
import { parsePhrase } from '../player/modules/rotate-phone/wordLaneRecipe.js'
import { clipsFromTimings } from '../player/modules/rotate-phone/wordLaneAudio.js'
import { missingChunks } from '../player/modules/rotate-phone/wordLaneLib.js'
import { NO_AUTOCORRECT } from '../../shared/lib/noAutoCorrectProps.js'

// Нода «Переверни телефон» — вертикальная игра «Повтори за диктором»: фраза, перевод, озвучка диктора.
// Фраза — куски через «|» (до трёх, кусок = дорожка): «I'm | trying | to learn». Из неё игра сама собирает раунды: наращивание (кусок ×3 → следующий ×3 → вместе ×3 …), «Порядок» (тап по дорожкам),
// «Вслепую» (без текста). Слово без «|» — одна дорожка-повтор: диктор три раза, ученик три раза (как в первой версии).
// «🔊 Озвучить» — ElevenLabs (тот же генератор, что у таблицы-диктора: NodeTableTts): текст — сценарий диктора (пусто → высказывания рецепта: «I'm. trying. I'm trying. to learn. I'm trying to learn.»;
// можно озвучить и одну фразу целиком «I'm trying to learn» — куски игра вырежет из неё), из ответа берутся тайминги слов. У фразы игра режет файл на клипы кусков сама (wordLaneAudio.clipsFromTimings); у одного слова таймлайн (три клипа) расставляется сразу, «⏱ Таймлайн» — монтажный
// стол таблицы, чтобы поправить руками. Без озвучки куски произносит голос системы / слово из библиотеки озвучки слов. Фраза пустая — игра идёт встроенным словом (DEMO_WORD).
// Звук диктора: куски фразы звучат ОТДЕЛЬНЫМИ файлами из библиотеки озвучки слов (collectLessonWords кладёт куски в список «нужна озвучка»), а запись «Озвучить» — только финал (вся фраза).
// Реплики кота («Пробуй сказать слова раздельно» и др.) — общие для всех нод этого типа: список, озвучка и анимация рта — раскрывающийся блок внизу (CatLinesPanel). Текст карточки в чате правится выше, в общем поле content.
export default function NodeRotatePhonePicker({ tData, onDataChange, lessonFiles, onPickFile, onRemoveFile }) {
  const [open, setOpen] = useState(false)
  const [linesOpen, setLinesOpen] = useState(false)
  const phrase = (tData.phrase ?? tData.word ?? '').trim()
  const chunks = parsePhrase(phrase)
  const single = chunks.length <= 1
  const script = (tData.script ?? '').trim() || (chunks.length ? defaultScript(phrase) : '')
  const fills = normalizeFills(tData.fills)
  const noLib = chunks.length ? missingChunks(chunks) : [] // куски без отдельной озвучки в библиотеке слов
  const clipsOk = tData.file_id && (single ? !!fills : !!clipsFromTimings(tData.wordTimings, chunks, tData.duration))

  // Новый файл — старые производные поля сбрасываются, настоящие придут следом через onAnalyzed (как у таблицы)
  function handlePick(file) {
    const id = onPickFile(file)
    onDataChange({ file_id: id, waveformData: null, duration: null, wordTimings: null })
    return id
  }
  // Озвучка готова: волна, длительность и тайминги слов; у одного слова по таймингам сразу расставляем клипы (не нашлись три слова — равномерные, поправить руками)
  function handleAnalyzed(patch) {
    onDataChange(single ? { ...patch, fills: fillsFromTimings(patch.wordTimings, chunks[0] ?? '', patch.duration) ?? defaultFills(patch.duration) } : patch)
  }
  function handlePhrase(value) {
    // «phrase» — главное поле; «word» держим равным первому куску для обратной совместимости (старые места читают word)
    onDataChange({ phrase: value, word: parsePhrase(value)[0] ?? '' })
  }

  return (
    <div className="nodeRotateTrainer" onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
      <input className="nodeRotateInput" value={tData.phrase ?? tData.word ?? ''} onChange={e => handlePhrase(e.target.value)}
        placeholder="Фраза кусками через |, например: I'm | trying | to learn (или одно слово: try)" {...NO_AUTOCORRECT} />
      <input className="nodeRotateInput" value={tData.translation ?? ''} onChange={e => onDataChange({ translation: e.target.value })}
        placeholder="Перевод фразы — ученик получит его в финале" {...NO_AUTOCORRECT} />
      <input className="nodeRotateInput" value={tData.script ?? ''} onChange={e => onDataChange({ script: e.target.value })}
        placeholder={chunks.length ? `Что скажет диктор (пусто → «${defaultScript(phrase)}»)` : 'Что скажет диктор (пусто → высказывания рецепта)'} {...NO_AUTOCORRECT} />
      <div className="nodeRotateTrainerRow">
        <NodeTableTts fileId={tData.file_id} text={script} onPick={handlePick} onAnalyzed={handleAnalyzed} onRemoveOldFile={onRemoveFile} />
      </div>
      <div className="nodeRotateTrainerRow">
        {single && <button type="button" className="nodeTablePickerBtn" onClick={() => setOpen(true)} disabled={!tData.file_id && !chunks.length}>⏱ Таймлайн</button>}
        <span className="nodeRotateTrainerInfo">
          {chunks.length > 3 && 'Кусков больше трёх — лишние отброшены. '}
          {noLib.length > 0 && `Нет отдельной озвучки (библиотека озвучки слов): ${noLib.map(c => `«${c}»`).join(', ')} — озвучьте куски отдельно, пока их проговорит голос системы. `}
          {tData.file_id
            ? (clipsOk ? `озвучка есть · клипы кусков найдены${single ? ' (таймлайн)' : ' по таймингам слов (достаточно записи фразы целиком)'}` : 'озвучка есть · клипы не найдены (в записи должна звучать фраза целиком — озвучьте заново) — куски проговорит голос системы')
            : 'без озвучки — куски проговорит слово из библиотеки озвучки слов / голос системы'}
        </span>
      </div>
      <details className="catLinesToggle" onToggle={e => setLinesOpen(e.currentTarget.open)}>
        <summary>🐱 Реплики кота (общие для всех таких нод)</summary>
        {linesOpen && <CatLinesPanel />}
      </details>
      {open && (
        <WordLaneEditorModal tData={tData} lessonFiles={lessonFiles} onPickFile={onPickFile}
          onSave={data => onDataChange(data)} onClose={() => setOpen(false)} />
      )}
    </div>
  )
}
