import { useState } from 'react'
import { generateImage } from '../../shared/lib/imageGenApi.js'
import { StatusTag } from './NodeAudioPicker.jsx'

// Кнопка «Сгенерировать»: делает картинку из текстового промпта (Cloudflare/
// Gemini, см. ImageProviderSettings.jsx) и заводит её в ноду ровно так же,
// как ручную загрузку файла (onPick) — дальше файл живёт по общим правилам:
// локальный кэш → синк урока → R2. Промпт — отдельное поле
// (typeData.<type>.imagePrompt), не подпись под фото (caption): подпись —
// то, что видит ученик, промпт — только для генерации.
// По умолчанию видна только кнопка — поле промпта только загромождало бы
// ноду, если фото уже выбрано вручную и генерация не нужна вовсе. Первый
// клик раскрывает поле, второй (когда есть текст) — генерирует.
export default function NodeImageGen({ fileId, prompt = '', onPromptChange, onPick, onRemoveOldFile }) {
  const [expanded, setExpanded] = useState(false)
  const [status, setStatus] = useState('idle') // 'idle' | 'loading' | 'done' | 'error'
  const [errorMsg, setErrorMsg] = useState('')

  async function handleClick(e) {
    e.stopPropagation()
    if (!expanded) { setExpanded(true); return }

    const trimmed = prompt.trim()
    if (!trimmed || status === 'loading') return
    setStatus('loading')
    setErrorMsg('')
    const prevFileId = fileId

    try {
      const file = await generateImage(trimmed)
      onPick(file)
      if (prevFileId) onRemoveOldFile?.(prevFileId)
      setStatus('done')
    } catch (err) {
      console.error('[NodeImageGen] generate failed', err)
      setErrorMsg(err?.message ?? 'Неизвестная ошибка')
      setStatus('error')
    }
  }

  return (
    <div className={`nodeImageGenWrap${expanded ? ' nodeImageGenWrapOpen' : ''}`} onClick={e => e.stopPropagation()}>
      {expanded && (
        <textarea
          className="nodeImageGenPrompt"
          value={prompt}
          onChange={e => onPromptChange(e.target.value)}
          placeholder="Промпт для генерации картинки (что нарисовать)…"
          autoFocus
          onClick={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
        />
      )}
      <div className="nodeImageGenRow">
        <button
          type="button"
          className="nodeImageGenBtn"
          onClick={handleClick}
          disabled={expanded && (!prompt.trim() || status === 'loading')}
          title={expanded ? 'Сгенерировать картинку из промпта выше' : 'Показать поле промпта'}
        >
          🎨 Сгенерировать
        </button>
        {expanded && <StatusTag label="AI" status={status} />}
      </div>
      {status === 'error' && errorMsg && (
        <div className="nodeImageGenError">{errorMsg}</div>
      )}
    </div>
  )
}
