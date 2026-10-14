import { useState, useEffect, useRef } from 'react'
import { uploadToR2, deleteFromR2 } from '../../shared/lib/r2.js'
import { updateCurriculumVideo, updateCurriculumPosterCrop, loadCurriculumMedia } from '../../shared/lib/curriculaApi.js'
import ModulePosterCrop from './ModulePosterCrop.jsx'
import ModuleScenePanel from './ModuleScenePanel.jsx'
import { mediaButtonMeta } from './moduleSceneModel.js'
import { capturePosterFrame } from '../../shared/lib/videoFrame.js'
import { checkMp4Faststart } from '../../shared/lib/videoCheck.js'
import { fdbg } from '../../shared/lib/feedDebug.js'

const MAX_FEED_VIDEO_MB = 8
const MODES = [['video', 'Видео'], ['scene', 'Сцена']]

// Кнопка «🎬» (со сценой — «🎭») в тулбаре схемы модуля (только админ): медиа фразы
// для ленты. Режим «Видео» — загрузка видео: постер-кадр захватывается автоматически,
// оба файла уходят в R2, ссылки — в curricula.video_url / poster_url. Режим «Сцена» —
// привязка сцены библиотеки (ModuleScenePanel, curricula.scene_id); сцена в ленте
// заменяет видео. Стартовый режим — по тому, что уже есть у модуля.
export default function ModuleVideoPanel({ curriculumId }) {
  const [open, setOpen] = useState(false)
  const [row,  setRow]  = useState(null) // { video_url, poster_url, poster_crop, scene_id? }
  const [mode, setMode] = useState(null) // null — выбрать по данным при загрузке
  const [busy, setBusy] = useState('')
  const [err,  setErr]  = useState('')
  const fileRef = useRef(null)

  useEffect(() => {
    loadCurriculumMedia(curriculumId)
      .then(data => { setRow(data); setMode(m => m ?? (data.scene_id ? 'scene' : 'video')) })
      .catch(e => { setRow({}); setErr(e?.message || 'Не удалось загрузить') })
  }, [curriculumId])

  async function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setErr('')

    // Проверка оптимизации: вес и faststart. Не блокируем — предупреждаем.
    const warns = []
    const sizeMb = file.size / (1024 * 1024)
    if (sizeMb > MAX_FEED_VIDEO_MB) {
      warns.push(`вес ${sizeMb.toFixed(1)} МБ (для ленты рекомендуется до ${MAX_FEED_VIDEO_MB} МБ)`)
    }
    if (await checkMp4Faststart(file) === false) {
      warns.push('moov-атом в конце файла — видео будет стартовать медленно')
    }
    if (warns.length) {
      const ok = window.confirm(
        `Видео не оптимизировано:\n— ${warns.join('\n— ')}\n\n` +
        'Прогони файл через tools/prepare-video.bat (перетащить видео на него) ' +
        'и загрузи результат.\n\nВсё равно загрузить как есть?',
      )
      if (!ok) return
    }

    try {
      fdbg('[video] файл:', file.name, `${(file.size / 1048576).toFixed(1)}МБ`, file.type || '(нет типа)')
      setBusy('Готовим постер...')
      const objUrl = URL.createObjectURL(file)
      const posterObjUrl = await capturePosterFrame(objUrl, 6000, 0.6)
      URL.revokeObjectURL(objUrl)
      fdbg('[video] захват постера:', posterObjUrl ? 'ok' : 'НЕ УДАЛСЯ (таймаут/декодер)')

      setBusy('Загружаем видео...')
      const videoUrl = await uploadToR2(file)
      fdbg('[video] видео в R2:', videoUrl)

      let posterUrl = null
      if (posterObjUrl) {
        setBusy('Загружаем постер...')
        const blob = await (await fetch(posterObjUrl)).blob()
        URL.revokeObjectURL(posterObjUrl)
        fdbg('[video] постер-blob:', `${(blob.size / 1024).toFixed(0)}КБ`, blob.type)
        posterUrl = await uploadToR2(
          new File([blob], `module-poster-${curriculumId}.jpg`, { type: 'image/jpeg' }),
        )
        fdbg('[video] постер в R2:', posterUrl)
      }

      // Старые файлы больше не нужны — чистим в фоне
      if (row?.video_url)  deleteFromR2(row.video_url).catch(() => {})
      if (row?.poster_url) deleteFromR2(row.poster_url).catch(() => {})

      await updateCurriculumVideo(curriculumId, videoUrl, posterUrl)
      fdbg('[video] БД обновлена: poster =', posterUrl ? 'есть' : 'NULL')
      setRow(r => ({ ...r, video_url: videoUrl, poster_url: posterUrl, poster_crop: null }))
      setBusy('')
    } catch (e2) {
      fdbg('[video] ОШИБКА:', e2.message)
      setBusy('')
      setErr(e2.message)
    }
  }

  async function handleDelete() {
    if (!window.confirm('Удалить видео модуля из ленты?')) return
    setErr('')
    setBusy('Удаляем...')
    try {
      if (row?.video_url)  await deleteFromR2(row.video_url)
      if (row?.poster_url) deleteFromR2(row.poster_url).catch(() => {})
      await updateCurriculumVideo(curriculumId, null, null)
      setRow(r => ({ ...r, video_url: null, poster_url: null, poster_crop: null }))
      setBusy('')
    } catch (e2) {
      setBusy('')
      setErr(e2.message)
    }
  }

  const has = !!row?.video_url
  const sceneId = row?.scene_id ?? null
  const meta = mediaButtonMeta({ sceneId, videoUrl: row?.video_url })
  return (
    <div className="mvWrap">
      <button
        className={meta.on ? 'saveBtn mvBtn mvBtnOn' : 'saveBtn mvBtn'}
        onClick={() => setOpen(o => !o)}
        title={meta.title}>
        {meta.icon}
      </button>

      {open && (
        <div className={mode === 'scene' ? 'mvPanel mvPanelWide' : 'mvPanel'}>
          <div className="mvTitle">Медиа фразы для ленты</div>
          <div className="mvSeg" role="radiogroup" aria-label="Что показывать в ленте">
            {MODES.map(([id, label]) => (
              <button
                key={id} type="button" role="radio" aria-checked={mode === id}
                className={mode === id ? 'mvSegBtn mvSegBtnOn' : 'mvSegBtn'}
                onClick={() => setMode(id)}
              >{label}{id === 'scene' && sceneId ? ' 🎭' : ''}{id === 'video' && has ? ' ●' : ''}</button>
            ))}
          </div>
          {row === null ? (
            <div className="mvHint">Загрузка...</div>
          ) : mode === 'scene' ? (
            <ModuleScenePanel
              curriculumId={curriculumId} sceneId={sceneId} hasVideo={has}
              onChange={id => setRow(r => ({ ...r, scene_id: id }))}
            />
          ) : has ? (
            <>
              {row.poster_url && <img className="mvPoster" src={row.poster_url} alt="постер видео" />}
              <div className="mvRowBtns">
                <button className="mvAction" onClick={() => fileRef.current?.click()} disabled={!!busy}>Заменить</button>
                <button className="mvAction mvDanger" onClick={handleDelete} disabled={!!busy}>Удалить</button>
              </div>
              {row.poster_url && (
                <ModulePosterCrop
                  key={row.poster_url}
                  posterUrl={row.poster_url}
                  crop={row.poster_crop}
                  onSave={async crop => {
                    await updateCurriculumPosterCrop(curriculumId, crop)
                    setRow(r => ({ ...r, poster_crop: crop }))
                  }}
                />
              )}
            </>
          ) : (
            <button className="mvAction" onClick={() => fileRef.current?.click()} disabled={!!busy}>
              Выбрать видео…
            </button>
          )}
          {mode === 'video' && sceneId && <div className="mvHint">К модулю привязана сцена — в ленте она показывается вместо видео</div>}
          {busy && <div className="mvHint">{busy}</div>}
          {err && <div className="mvErr">{err}</div>}
          <input ref={fileRef} type="file" accept="video/*" hidden onChange={handleFile} />
        </div>
      )}
    </div>
  )
}
