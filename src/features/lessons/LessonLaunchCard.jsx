import { useState, useEffect, useRef } from 'react'
import { loadScript } from '../../shared/lib/lessonsApi.js'
import { getFilesByIds } from '../../shared/lib/filesApi.js'
import { getDefaultTeacher } from '../../shared/api/appSettingsApi.js'
import { resolveTeacher } from '../../shared/lib/teacherResolve.js'
import { usePlayerPreload } from '../player/usePlayerPreload.js'
import { preloadSounds, unlockAudio } from '../../shared/lib/sounds.js'
import { primeAudio } from '../../shared/lib/primedAudio.js'
import { useAdmin } from '../../app/AdminContext.jsx'
import RetakeDialog from './RetakeDialog.jsx'
import ExamIntroDialog from './ExamIntroDialog.jsx'
import LaunchDebugPanel from './LaunchDebugPanel.jsx'
import LaunchSkeleton from './LaunchSkeleton.jsx'
import LaunchEnergyRow from './LaunchEnergyRow.jsx'
import { launchEnergyInfo } from './launchEnergy.js'
import { hasStatBindings } from '../player/useAnswerStats.js'

const WARMUP_TARGET = 5

function extractFileIds(nodes) {
  const single = nodes.map(n => n.typeData?.[n.type]?.file_id).filter(Boolean)
  const photos  = nodes
    .filter(n => n.type === 'photo_choice')
    .flatMap(n => (n.typeData?.photo_choice?.photos ?? []).map(p => p.fileId).filter(Boolean))
  return [...new Set([...single, ...photos])]
}

// Detect slow/low-memory devices to use a smaller in-memory buffer.
// Falls back to false on browsers that don't expose these APIs (e.g. iOS Safari).
function isWeakDevice() {
  const mem  = navigator.deviceMemory          // GB, Chrome/Android only
  const cpu  = navigator.hardwareConcurrency
  const conn = navigator.connection?.effectiveType  // '2g' | 'slow-3g' | '3g' | '4g'
  if (mem  && mem  < 2)                        return true
  if (cpu  && cpu  < 4)                        return true
  if (conn && (conn === '2g' || conn === 'slow-3g')) return true
  return false
}

// retake=true (урок уже пройден): если в сценарии есть привязки «→ Урок»,
// вместо кнопки старта — выбор режима пересдачи (RetakeDialog).
// examIntro=true (финальный урок): вместо кнопки старта — интро экзамена
// (правила, 3 подсказки, ключ); имеет приоритет над retake.
// energyFree=true — сервер не спишет энергию (Старт/Финал модуля); клиенту
// нужно только для честной надписи о стоимости, решает всё равно сервер.
export default function LessonLaunchCard({ lessonId, lessonTitle = '', retake = false, examIntro = false, energyFree = false, onStart, onClose }) {
  const [lessonData, setLessonData] = useState(null)
  const [error, setError]           = useState(null)
  // Момент открытия карточки: по нему считается энергия. Ленивый инициализатор —
  // Date.now() импьюрный, а живой таймер тут не нужен, карточка живёт секунды
  const [openedAt] = useState(() => Date.now())
  // Растворение последней ячейки энергии при старте. Живёт здесь, а не в
  // предзагрузчике: сама строка энергии рисуется с первого кадра, ещё до него
  const [dissolving, setDissolving] = useState(false)
  // Не зависит от сценария — профиль уже в кэше, остальное пропсы
  const info = launchEnergyInfo({ retake, energyFree, openedAt })

  useEffect(() => {
    loadScript(lessonId)
      .then(async raw => {
        // Сервер не отдал урок — его сняли с публикации (или удалили), пока
        // приложение было открыто: RLS такой урок ученику не показывает.
        // Список на экране мог остаться старым, поэтому говорим прямо, а не
        // прячем это под «не удалось загрузить» (похоже на сбой сети)
        if (!raw) { setError('Этот урок сейчас закрыт'); return }
        const nodes = raw?.script?.nodes ?? []
        const ids   = extractFileIds(nodes)
        const files = ids.length ? await getFilesByIds(ids) : []
        // Учитель: свой у урока либо общий из app_settings (кэш на сессию)
        const teacher = resolveTeacher(raw?.script, await getDefaultTeacher())
        setLessonData({
          nodes,
          files,
          // Надпись в шапке чата: своя из настроек урока, иначе его название.
          // Отсюда её получают все три запуска — модуль, отдельный урок и
          // гонка: playerData у них общий, собирается здесь
          title:           (raw?.script?.chatTitle || '').trim() || raw?.title || '',
          // Название самого урока — на случай, когда его не передали пропсом
          // (запуск не из схемы модуля): иначе заголовок карточки был бы пуст
          name:            raw?.title ?? '',
          teacherName:     teacher.name,
          teacherLogo:     teacher.logo,
          teacherLogoCrop: teacher.crop,
          videoAutoSound:  raw?.script?.videoAutoSound ?? false,
          lessonXp:        raw?.script?.lessonXp ?? 0,
        })
      })
      .catch(() => setError('Не удалось загрузить урок'))
  }, [lessonId])  

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div className="launchCard" style={{
        borderRadius: 16, padding: 32,
        minWidth: 300, maxWidth: 420, width: '90%',
        display: 'flex', flexDirection: 'column', gap: 20,
        position: 'relative',
      }}>
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 12, right: 16,
            background: 'none', border: 'none', color: '#888',
            fontSize: 20, cursor: 'pointer', lineHeight: 1,
          }}
        >×</button>

        {error && <p style={{ color: '#ff7070', margin: 0 }}>{error}</p>}

        {!error && !lessonData && <LaunchSkeleton title={lessonTitle} info={info} />}

        {lessonData && (
          <LaunchPreloader
            lessonData={lessonData}
            retakeChoice={retake && hasStatBindings(lessonData.nodes)}
            retake={retake}
            examIntro={examIntro}
            energyFree={energyFree}
            title={lessonTitle}
            info={info}
            dissolving={dissolving}
            onDissolve={() => setDissolving(true)}
            onStart={onStart}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  )
}

function LaunchPreloader({ lessonData, title, info, dissolving, onDissolve, retakeChoice = false, examIntro = false, onStart, onClose }) {
  // title приходит из схемы модуля и уже нарисован скелетоном — берём его, а не
  // lessonData.title: тот может оказаться своей надписью для шапки чата, и
  // заголовок карточки на полпути подменился бы
  const { nodes, files, title: chatTitle, name, teacherName, teacherLogo, teacherLogoCrop, videoAutoSound, lessonXp } = lessonData
  // Через контекст, а не useIsAdmin напрямую: иначе дебаг-панель предзагрузки
  // пережила бы «режим пользователя» (и это был лишний запрос getProfile)
  const { isAdmin } = useAdmin()

  // Энергия и стоимость посчитаны в LessonLaunchCard и уже показаны — здесь
  // только флаг, нужна ли анимация списания при старте
  const { payingCase } = info

  // Weak device → smaller in-memory buffer during lesson (2 past + 2 ahead vs 5 + 3)
  const weak       = isWeakDevice()
  const bufferSize = weak ? 3 : 5

  const { blobMap, readyNodeIds, warmupNodeIds, warmupPct, initialized, debugItems, releaseBlobs } = usePlayerPreload(
    nodes, files, [], { initialLookahead: WARMUP_TARGET, bufferSize }
  )

  // Start decoding UI sounds while lesson files are loading — no gesture needed for decode.
  // By the time the user taps "Start", AudioBuffers are ready and AudioContext just needs resume().
  useEffect(() => { preloadSounds() }, [])

  // Preload teacher logo separately (not part of the node graph)
  const logoBlobRef             = useRef(null) // holds blob URL so cleanup can revoke it
  const [, setLogoBlobUrl] = useState(null) // ре-рендер, когда лого докачалось
  const [logoReady,   setLogoReady]   = useState(!teacherLogo) // no logo → already "ready"

  useEffect(() => {
    // Нет лого → сразу «готово»; осознанный setState в эффекте загрузки
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!teacherLogo) { setLogoReady(true); return }
    let cancelled = false
    const controller = new AbortController()
    fetch(teacherLogo, { signal: controller.signal })
      .then(r => r.blob())
      .then(blob => {
        if (cancelled) return
        const url = URL.createObjectURL(blob)
        logoBlobRef.current = url
        setLogoBlobUrl(url)
        setLogoReady(true)
      })
      .catch(() => { if (!cancelled) setLogoReady(true) }) // skip logo on error, don't block
    return () => {
      cancelled = true
      controller.abort()
      // revoke only if not yet handed off to the player (releaseLogo clears the ref)
      if (logoBlobRef.current) { URL.revokeObjectURL(logoBlobRef.current); logoBlobRef.current = null }
    }
  }, [teacherLogo])  

  // Готовность — по нодам; бар — по скачанным байтам warmup-файлов (честный и плавный).
  // initialized=false until the hook has built its queue — prevents false "ready" flash.
  const nodeTotal   = warmupNodeIds.length
  const nodeReady   = warmupNodeIds.filter(id => readyNodeIds.has(id)).length
  const canStart    = initialized && logoReady && (nodeReady >= nodeTotal || nodeTotal === 0)
  const pct         = canStart ? 100 : Math.min(warmupPct, 99)

  // statsMode: null (первое прохождение) | 'update' | 'silent' (выбор пересдачи)
  function handleStart(statsMode = null) {
    // Preload + unlock in the same gesture context so iOS Safari decodes audio immediately.
    // preloadSounds() creates Audio objects; unlockAudio() does play+pause on them.
    // Both must run here (not in useEffect) — iOS only allows audio decode within a gesture.
    preloadSounds()
    unlockAudio()
    // И прогреваем элемент под автозапуск таблиц: разрешение Safari даёт
    // конкретному <audio>, а у панели диктанта он рождается уже без жеста
    primeAudio()
    releaseBlobs()
    // Transfer logo blob ownership to player — clear ref so cleanup won't revoke it
    const logoForPlayer = logoBlobRef.current ?? teacherLogo
    logoBlobRef.current = null
    const payload = { nodes, files, blobMap, title: chatTitle, teacherName, teacherLogo: logoForPlayer, teacherLogoCrop, videoAutoSound, lessonXp }

    if (payingCase) {
      // Платный случай: сперва показываем растворение мигающей ячейки —
      // пользователь видит, что энергия израсходована — и только потом
      // запускаем плеер. Реальное списание всё равно решает сервер (onStart→startLesson)
      onDissolve()
      setTimeout(() => onStart(payload, statsMode), 600)
    } else {
      onStart(payload, statsMode)
    }
  }

  return (
    <>
      <h2 style={{ margin: 0, color: '#fff', fontSize: 18, fontWeight: 600 }}>{title || name}</h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ height: 6, borderRadius: 3, background: '#333', overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 3,
            width: pct + '%',
            background: '#b6fe3b',
            transition: 'width 0.3s ease',
          }} />
        </div>
        <span style={{ color: '#888', fontSize: 12 }}>
          {/* Слово то же, что в каркасе до загрузки сценария («Загрузка
              урока…»): подмена «Загрузка» → «Подготовка» на полпути читалась
              как смена этапа, хотя это одна и та же загрузка */}
          {canStart
            ? 'Урок готов к запуску'
            : `Загрузка урока: ${pct}%`}
        </span>
      </div>

      <LaunchEnergyRow info={info} dissolving={dissolving} />

      {isAdmin && (
        <LaunchDebugPanel
          weak={weak}
          bufferSize={bufferSize}
          warmupNodeIds={warmupNodeIds}
          files={files}
          debugItems={debugItems}
        />
      )}

      {examIntro ? (
        <ExamIntroDialog canStart={canStart} onStart={() => handleStart()} />
      ) : retakeChoice ? (
        <RetakeDialog canStart={canStart} onPick={handleStart} onCancel={onClose} />
      ) : (
        <button
          onClick={() => handleStart()}
          disabled={!canStart || dissolving}
          style={{
            padding: '14px 0', borderRadius: 12, border: 'none',
            fontSize: 16, fontWeight: 600, cursor: canStart && !dissolving ? 'pointer' : 'default',
            background: canStart ? '#b6fe3b' : '#333',
            color: canStart ? '#0d1500' : '#666',
            transition: 'background 0.3s ease, color 0.3s ease',
          }}
        >
          {canStart ? '▶ Начать урок' : 'Загрузка...'}
        </button>
      )}
    </>
  )
}
