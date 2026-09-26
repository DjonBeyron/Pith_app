import { useState, useEffect, useRef } from 'react'
import { usePlayerPreload } from '../player/usePlayerPreload.js'
import { preloadSounds, unlockAudio } from '../../shared/lib/sounds.js'
import { primeAudio } from '../../shared/lib/primedAudio.js'
import { motionNeedsAsk } from '../../shared/lib/motionPermission.js'
import LaunchMotionAsk from './LaunchMotionAsk.jsx'
import { useAdmin } from '../../app/AdminContext.jsx'
import ExamIntroDialog from './ExamIntroDialog.jsx'
import LaunchCtaSlot from './LaunchCtaSlot.jsx'
import LaunchDebugPanel from './LaunchDebugPanel.jsx'
import LaunchSkeleton from './LaunchSkeleton.jsx'
import LaunchEnergyRow from './LaunchEnergyRow.jsx'
import { isWeakDevice } from './launchHelpers.js'
import useSmoothPct from './useSmoothPct.js'

// Прогрев урока внутри карточки запуска: сценарий уже загружен
// (LessonLaunchCard), здесь — предзагрузка медиа до точки входа (начало урока
// или чекпойнт «Продолжить»), кнопки старта/пересдачи/экзамена и анимация
// списания энергии. Вынесено из LessonLaunchCard.jsx (тот упирался в потолок
// 400 строк).
const WARMUP_TARGET = 5

export default function LaunchPreloader({
  lessonData, title, info, dissolving, onDissolve, examIntro = false,
  resumeOffer = null, mayResume = false, visible = false, onRestartProgress, onStart,
}) {
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

  // Точка входа — начало урока по умолчанию, а если есть чекпойнт (resumeOffer)
  // — точка возобновления: прогрев (usePlayerPreload) целится именно туда,
  // а не всегда в начало (тот же приоритет по nodeIdx, что чинили в
  // самом плеере — см. PROJECT.md, «гейт предзагрузки не открывался до
  // точки возобновления»). Если студент всё же нажмёт «Начать заново» —
  // прогрев для начала урока НЕ был готов заранее, это осознанный компромисс:
  // «Продолжить» — основная, зелёная кнопка, более вероятный выбор
  const resumeEntryNode = resumeOffer?.nodeId ? nodes.find(n => n.id === resumeOffer.nodeId) : null
  const { blobMap, readyNodeIds, warmupNodeIds, warmupPct, initialized, debugItems, releaseBlobs } = usePlayerPreload(
    nodes, files, resumeEntryNode ? [resumeEntryNode] : [], { initialLookahead: WARMUP_TARGET, bufferSize }
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
  const loaded      = initialized && logoReady && (nodeReady >= nodeTotal || nodeTotal === 0)
  // Показанный процент — плавный (не быстрее 1 с на всю шкалу, useSmoothPct)
  // и крутится только когда карточка видна (visible), не за каркасом.
  // Кнопка открывается вместе с ним: «Начать урок» при баре на 40 % — тот
  // же «мгновенный» скачок, только другой стороной
  const { barRef, textRef, reached } = useSmoothPct(loaded ? 100 : Math.min(warmupPct, 99), visible)
  const canStart    = loaded && reached

  // Стиль обычной кнопки старта — общий для LaunchCtaSlot (mayResume) и для
  // простой <button> (когда «Продолжить» в принципе невозможно)
  const startBtnStyle = {
    padding: '14px 0', borderRadius: 12, border: 'none',
    fontSize: 16, fontWeight: 600, cursor: canStart && !dissolving ? 'pointer' : 'default',
    // До готовности — без подложки, просто серый текст, как «Загрузка...» в
    // каркасе: серая плашка появлялась на полпути и читалась как отдельный
    // этап перед зелёной кнопкой. Ключ 'transparent', не 'none' — иначе
    // transition фона к зелёному не анимируется
    background: canStart ? '#b6fe3b' : 'transparent',
    color: canStart ? '#0d1500' : '#666',
    // До готовности кнопки не видно: загрузку показывает полоса выше (см. LaunchSkeleton)
    opacity: canStart ? 1 : 0,
    transition: 'background 0.3s ease, color 0.3s ease, opacity 0.3s ease',
  }

  // resume=true — жмут «Продолжить» в LaunchCtaSlot: payload несёт точку
  // входа и историю чата выше нее, LessonPlayer.jsx берёт их напрямую и не
  // гоняет свою собственную проверку чекпойнта (см. useLessonResume.js).
  // Выбора режима пересдачи больше нет: ответы только добавляются (PROJECT.md
  // → «Анализ знаний»), пересдача — обычное прохождение
  function handleStart(resume = false) {
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
    const payload = {
      nodes, files, blobMap, title: chatTitle, teacherName, teacherLogo: logoForPlayer, teacherLogoCrop, videoAutoSound, lessonXp,
      startNodeId: resume ? resumeOffer.nodeId : null,
      historyIds:  resume ? (resumeOffer.visitedIds ?? []).slice(0, -1) : null,
      resumedXp:   resume ? (resumeOffer.xp ?? 0) : 0,
    }

    if (payingCase) {
      // Платный случай: сперва показываем растворение мигающей ячейки —
      // пользователь видит, что энергия израсходована — и только потом
      // запускаем плеер. Реальное списание всё равно решает сервер (onStart→startLesson)
      onDissolve()
      setTimeout(() => onStart(payload), 600)
    } else {
      onStart(payload)
    }
  }

  return (
    <>
      <h2 style={{ margin: 0, color: '#fff', fontSize: 18, fontWeight: 600 }}>{title || name}</h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ height: 6, borderRadius: 3, background: '#333', overflow: 'hidden' }}>
          {/* Ширину и цифру ниже ведёт useSmoothPct прямо в DOM (ref),
              покадрово и без ре-рендеров; в JSX — только стартовые «0%»,
              React их не перезаписывает (значение в JSX не меняется).
              Без transition: покадровая запись сама и есть анимация */}
          <div ref={barRef} style={{ height: '100%', borderRadius: 3, width: '0%', background: '#b6fe3b' }} />
        </div>
        <span style={{ color: '#888', fontSize: 12 }}>
          {/* Слово то же, что в каркасе до загрузки сценария («Загрузка
              урока…»): подмена «Загрузка» → «Подготовка» на полпути читалась
              как смена этапа, хотя это одна и та же загрузка */}
          {canStart
            ? 'Урок готов к запуску'
            : <>Загрузка урока: <span ref={textRef}>0%</span></>}
        </span>
      </div>

      <LaunchEnergyRow info={info} dissolving={dissolving} />

      {/* Датчик движения — только уроку с нодой «переверни телефон» и только
          там, где его выдают по диалогу (iOS). Своим шагом, а не молча в
          handleStart: системный запрос без объяснения получает отказ, а
          отказ iOS помнит */}
      {nodes.some(n => n.type === 'rotate_phone') && motionNeedsAsk() && <LaunchMotionAsk />}

      {isAdmin && (
        <LaunchDebugPanel
          weak={weak}
          bufferSize={bufferSize}
          warmupNodeIds={warmupNodeIds}
          files={files}
          debugItems={debugItems}
        />
      )}

      {/* LaunchCtaSlot — одна и та же вёрстка для «Продолжить» и для обычного
          старта (showSecondRow включает вторую строку/кнопку), поэтому не
          нужно подгонять высоту числом (CTA_MIN_HEIGHT раньше расходился с
          реальным рендером шрифта) — см. LaunchCtaSlot.jsx. mayResume — та
          же синхронная проверка, что ушла в каркас (LaunchSkeleton): пока
          есть шанс на чекпойнт, даже обычная кнопка «Начать урок» держит то
          же место под вторую кнопку, что и каркас до неё — а когда его нет
          (пересдача/уже пройден/гонка), второй кнопки не будет никогда,
          и обычная кнопка не резервирует под неё пустое место */}
      {resumeOffer ? (
        <LaunchCtaSlot
          showSecondRow
          pctLabel={`Дошёл примерно до ${Math.round(resumeOffer.pct ?? 0)}%`}
          pct={Math.round(resumeOffer.pct ?? 0)}
          primaryClassName="resumeLessonBtnPrimary"
          // Тот же принцип, что у startBtnStyle: до готовности — серый текст без
          // зелёной плашки (раньше зелёная на 50% — та же «плашка до кнопки»)
          primaryStyle={canStart ? undefined : { background: 'transparent', color: '#666', cursor: 'default', opacity: 0 }}
          primaryLabel={canStart ? 'Продолжить' : 'Загрузка...'}
          primaryDisabled={!canStart}
          onPrimary={() => handleStart(true)}
          onGhost={() => { onRestartProgress(); handleStart() }}
        />
      ) : examIntro ? (
        <ExamIntroDialog canStart={canStart} onStart={() => handleStart()} />
      ) : mayResume ? (
        <LaunchCtaSlot
          // pctLabel — см. LaunchSkeleton.jsx: пустая строка в скрытом <span>
          // даёт высоту 0, а не высоту строки текста, и блок оказывается на
          // ~17px ниже, чем у showSecondRow — та самая «растяжка» на глаз
          pctLabel="Загрузка..."
          primaryLabel={canStart ? '▶ Начать урок' : 'Загрузка...'}
          primaryDisabled={!canStart || dissolving}
          primaryStyle={startBtnStyle}
          onPrimary={() => handleStart()}
        />
      ) : (
        <button onClick={() => handleStart()} disabled={!canStart || dissolving} style={startBtnStyle}>
          {canStart ? '▶ Начать урок' : 'Загрузка...'}
        </button>
      )}
    </>
  )
}
