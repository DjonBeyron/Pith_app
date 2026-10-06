import { useState, useEffect, useRef } from 'react'
import { dbg } from '../../shared/lib/debug.js'
import { analyzeWaveform, probeAudioDuration } from '../../shared/lib/audioUtils.js'
import { setAudioMeta } from '../../shared/lib/audioMetaCache.js'
import { onLessonSaved } from '../../shared/lib/lessonSavedBus.js'
import { nodesNeedingAudioMeta, buildAudioMetaPatch, hasAudioMeta } from './audioMetaBackfill.js'

// Досчёт недостающей меты голосовых (волна + длительность) прямо в канвасе.
//
// Запускается в фоне, когда у холста появились ноды (первый onNodesChange
// после открытия урока) и файлы, и заново после каждого сохранения
// (lessonSavedBus). Ноды обрабатываются СТРОГО ПОСЛЕДОВАТЕЛЬНО —
// decodeAudioData тяжёлый, параллельный запуск на 30 файлах вешает вкладку.
// Результат пишется в typeData.audio через boardApi.patchNodeTypeData —
// черновик холста обновляется сам, и точка «несохранено» на «Сохранить»
// загорается: автору остаётся нажать сохранить, чтобы плеер получил мету
// без расчёта на устройстве.
//
// triedRef — ноды, которые уже пробовали в этой сессии (успех или ошибка):
// без него нода с битым файлом перезапускала бы досчёт после каждого
// ре-рендера. Сбрасывается после сохранения — ещё одна попытка.
//
// Возвращает { done, total } во время работы и null, когда всё есть.
export function useAudioMetaBackfill({ nodes, files, boardApiRef, lessonId, loading }) {
  const [progress, setProgress] = useState(null)
  const triedRef   = useRef(new Set())
  const runningRef = useRef(false)
  const aliveRef   = useRef(true)
  // Тик — чтобы эффект ниже перепроверил список после сброса triedRef
  const [tick, setTick] = useState(0)

  useEffect(() => {
    aliveRef.current = true
    return () => { aliveRef.current = false }
  }, [])

  useEffect(() => {
    triedRef.current = new Set()
    const off = onLessonSaved(saved => {
      if (saved.id !== lessonId) return
      triedRef.current = new Set()
      setTick(t => t + 1)
    })
    return off
  }, [lessonId])

  useEffect(() => {
    if (loading || runningRef.current || !nodes?.length) return
    const need = nodesNeedingAudioMeta(nodes, files).filter(i => !triedRef.current.has(i.nodeId))
    if (!need.length) return
    runningRef.current = true
    runBackfill(need, { boardApiRef, triedRef, aliveRef, setProgress })
      .finally(() => {
        runningRef.current = false
        if (aliveRef.current) { setProgress(null); setTick(t => t + 1) }
      })
  }, [nodes, files, loading, tick, boardApiRef])

  return progress
}

async function runBackfill(items, { boardApiRef, triedRef, aliveRef, setProgress }) {
  const total = items.length
  let done = 0
  // Первый setProgress — после await: эффект не должен ставить стейт синхронно
  await Promise.resolve()
  if (!aliveRef.current) return
  setProgress({ done, total })
  dbg('[AUDIO META] досчёт:', total, 'нод')
  for (const item of items) {
    if (!aliveRef.current) return
    triedRef.current.add(item.nodeId)
    // Нода могла исчезнуть или получить мету иначе (автор перевыбрал файл)
    const live = boardApiRef.current?.getNodes?.().find(n => n.id === item.nodeId)
    const liveData = live?.typeData?.[live.type]
    if (live && liveData?.file_id === item.fileId && !hasAudioMeta(liveData)) {
      try {
        const meta = await computeAudioMeta(item)
        if (!aliveRef.current) return
        setAudioMeta(item.fileId, meta)
        boardApiRef.current?.patchNodeTypeData(item.nodeId, data => {
          // Пока считали, файл ноды могли заменить — чужую мету не пишем
          if (data.file_id !== item.fileId) return data
          const patch = buildAudioMetaPatch(data, meta)
          return Object.keys(patch).length ? { ...data, ...patch } : data
        })
        dbg('[AUDIO META] нода', item.seq, '✓', meta.waveformData?.length, 'кадров,', meta.duration, 'с')
      } catch (e) {
        // Один битый файл не останавливает остальные
        dbg('[AUDIO META] нода', item.seq, '✗', e?.message)
      }
    }
    done++
    if (aliveRef.current) setProgress({ done, total })
  }
}

// Скачать файл (или взять локальный blob) → blob URL → волна + длительность.
// blob URL отзываем сразу после расчёта, чтобы не копить память на 30 файлах
async function computeAudioMeta({ url, localFile }) {
  let blob = localFile
  if (!blob) {
    const resp = await fetch(url)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    blob = await resp.blob()
  }
  const blobUrl = URL.createObjectURL(blob)
  try {
    const [waveformData, duration] = await Promise.all([
      analyzeWaveform(blobUrl),
      probeAudioDuration(blobUrl),
    ])
    return { waveformData, duration }
  } finally {
    URL.revokeObjectURL(blobUrl)
  }
}
