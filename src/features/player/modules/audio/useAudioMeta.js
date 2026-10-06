import { useEffect, useMemo, useRef, useState } from 'react'
import { analyzeWaveform, probeAudioDuration, WAVEFORM_FPS } from '../../../../shared/lib/audioUtils.js'
import { logAudioDurationReady } from './audioDebug.js'
import { getAudioMeta } from '../../../../shared/lib/audioMetaCache.js'

// Откуда у голосового волна и длительность — вынесено из AudioModule.jsx
// (упёрся в потолок 400 строк). Три источника по убыванию приоритета:
//  1. нода (сохранены при генерации/загрузке файла в редакторе);
//  2. прогрев — usePlayerPreload.analyzeAudioMeta считает их сразу после
//     скачивания blob, пузырь монтируется с таймером и волной с первого
//     кадра, без подрастания;
//  3. сами по факту загрузки — только у потокового источника (blob не
//     успел) или если прогрев с метой не справился (metaDone без волны).
// Волна и длительность — свойство ФАЙЛА, а не адреса: при смене src (прямая
// ссылка → blob прогрева и обратно) не сбрасываются и не считаются заново —
// именно этот пересчёт выглядел как «спектр перестраивается».
// waveReady=false — волна ещё считается, AudioWave прозрачный.
const META_WAIT_MS = 4000

export function useAudioMeta(node, file, src) {
  const stored   = node.typeData?.audio ?? {}
  // Третий источник на старте — кэш устройства по id файла (audioMetaCache.js):
  // считали в прошлый раз — спектр и таймер есть ещё до скачивания
  const cached   = useMemo(() => getAudioMeta(file?.id ?? stored.file_id), [file?.id, stored.file_id])
  const initWave = stored.waveformData?.length ? stored.waveformData : (file?.waveformData ?? cached?.waveformData ?? null)
  // Нет сохранённой длительности — из длины волны (кадр = 1/WAVEFORM_FPS с)
  const initDur  = stored.duration || file?.duration || cached?.duration || (initWave?.length ? initWave.length / WAVEFORM_FPS : null)

  const [waveData,  setWaveData]  = useState(initWave)
  const [duration,  setDuration]  = useState(initDur)
  const [waveReady, setWaveReady] = useState(!!initWave)
  const waveDoneRef     = useRef(!!initWave)
  const durationDoneRef = useRef(!!initDur)
  // Срок прозрачности волны — один, от монтирования. Раньше таймер жил в
  // эффекте ниже и перезапускался на каждую смену src (прямая ссылка → blob
  // прогрева), а в ветке «считаем сами» его не было вовсе: на слабой сети
  // пузырь приходил в чат и стоял без волны ещё секунды
  const waveDeadlineRef = useRef(null) // ставится в первом эффекте ниже (не в рендере)

  // Мета из прогрева доехала после монтирования (blob скачался позже пузыря)
  useEffect(() => {
    if (!waveDoneRef.current && file?.waveformData) {
      waveDoneRef.current = true
      setWaveData(file.waveformData)
      setWaveReady(true)
    }
    if (!durationDoneRef.current && file?.duration) {
      durationDoneRef.current = true
      setDuration(file.duration)
      logAudioDurationReady('из прогрева', file.duration)
    }
    // Прогрев отработал, но волны не дал — показываем базовую форму
    if (file?.metaDone && !file?.waveformData && !waveDoneRef.current) setWaveReady(true)
  }, [file?.waveformData, file?.duration, file?.metaDone])

  // Считаем сами — только когда ждать прогрев не от кого: файла нет в очереди
  // прогрева (file == null — редактор/локальный файл/нет записи). Если файл
  // в очереди, мету принесёт прогрев (даже если blob ещё качается) — второе
  // скачивание того же файла ради волны по прямой ссылке на слабой сети
  // удваивало трафик и держало волну прозрачной десятки секунд. Прогрев
  // молчит дольше META_WAIT_MS — показываем базовую форму (длительность
  // придёт из метаданных самого <audio>, adoptElementDuration ниже)
  useEffect(() => {
    if (!src) return
    if (waveDeadlineRef.current == null) waveDeadlineRef.current = Date.now() + META_WAIT_MS
    const metaFromPreload = !!file && !file.metaDone && !file.error && !file.evicted && !file.localFile
    let cancelled = false
    let timer = null
    const run = () => {
    if (!waveDoneRef.current) {
      analyzeWaveform(src).then(wd => {
        if (cancelled) return
        waveDoneRef.current = true
        setWaveData(wd)
        setWaveReady(true)
      }).catch(() => {
        // Файл не отдался — показываем базовую форму, а не пустую дорожку
        if (!cancelled) setWaveReady(true)
      })
    }
    if (!durationDoneRef.current) {
      probeAudioDuration(src).then(d => {
        if (cancelled || !d || !isFinite(d)) return
        durationDoneRef.current = true
        setDuration(d)
        logAudioDurationReady('асинхронно, probeAudioDuration', d)
      }).catch(() => {})
    }
    }
    if (!metaFromPreload) run()
    // Срок один на всё время жизни пузыря (waveDeadlineRef), в обеих ветках:
    // и пока ждём прогрев, и пока считаем сами по прямой ссылке
    if (!waveDoneRef.current) {
      timer = setTimeout(() => { if (!cancelled && !waveDoneRef.current) setWaveReady(true) },
        Math.max(0, waveDeadlineRef.current - Date.now()))
    }
    return () => { cancelled = true; clearTimeout(timer) }
    // file?.metaDone обрабатывает эффект выше; error/evicted — повод
    // перестать ждать прогрев и посчитать самим
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, file?.error, file?.evicted])

  // Длительность из метаданных самого <audio>, как только они есть
  function adoptElementDuration(audio) {
    if (durationDoneRef.current || !Number.isFinite(audio.duration) || audio.duration <= 0) return
    durationDoneRef.current = true
    setDuration(audio.duration)
    logAudioDurationReady('из метаданных элемента', audio.duration)
  }

  return { waveData, duration, waveReady, adoptElementDuration }
}
