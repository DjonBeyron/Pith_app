import { useState, useEffect, useRef } from 'react'
import { useCurriculumLessons } from './useCurriculumLessons.js'
import { renameCurriculum } from '../../shared/lib/curriculaApi.js'
import ModuleGraph from './ModuleGraph.jsx'
import ProModuleLessons from './ProModuleLessons.jsx'
import LessonLaunchCard from './LessonLaunchCard.jsx'
import LessonPlayer from '../player/LessonPlayer.jsx'
import { getCompletedLessons, markLessonCompleted, unmarkLessons } from '../../shared/lib/completedLessons.js'
import { refreshProfile, getCachedProfile } from '../../shared/api/profileCache.js'
import ProPaywall from '../pro/ProPaywall.jsx'
import { resetLessonProgress, startLesson } from '../../shared/api/profileApi.js'
import EnergyPaywall from './EnergyPaywall.jsx'
import ModuleVideoPanel from './ModuleVideoPanel.jsx'
import { loadAllEvents, clearLocalEvents } from '../../shared/lib/skillStatsStore.js'
import { getLocalStars } from '../../shared/lib/lessonStars.js'
import { fetchMyLessonStars } from '../../shared/api/starsApi.js'
import { markModuleStarted, unmarkModuleStarted } from '../../shared/api/moduleSocialApi.js'
import { dbg } from '../../shared/lib/debug.js'
import PriorityLegend from './PriorityLegend.jsx'
import StreakDailyToast from '../streak/StreakDailyToast.jsx'
import { computeAllPriorities } from '../../shared/lib/skillScore.js'
import { useAdmin } from '../../app/AdminContext.jsx'
import { useAuth } from '../../shared/lib/useAuth.js'
import { weekKey, MODULE_DONE_WEEK_KEY } from '../race/useRaceState.js'

const LEGEND_SEEN_KEY = 'pithy_priority_legend_seen_v1'

// Карта звёзд уроков: максимум локального стора (мгновенно, работает и гостю)
// и сервера (переносится между устройствами). Чистый хелпер без setState —
// компонент подписывает setStars через .then (react-hooks/set-state-in-effect).
async function loadStarsMap(user, lessons) {
  const merged = new Map(getLocalStars())
  if (user && lessons.length > 2) {
    const server = await fetchMyLessonStars(lessons.slice(1, -1).map(l => l.id))
    server.forEach((v, id) => merged.set(id, Math.max(v, merged.get(id) ?? 0)))
  }
  return merged
}

// Экран одного модуля: схема Старт → уроки → Финал, запуск уроков через
// карточку прогрева, плеер, приоритеты анализа знаний. Используется и во
// вкладке «Уроки» (старая оболочка), и из ленты по «Изучить фразу» (ui v2).
// isPro — про-модуль (супер-урок гонки): вместо графа простой список уроков,
// без Старта/Финала, без экзамена и без маркера «модуль пройден».
export default function CurriculumView({ curriculumId, curriculumTitle, isPro = false, onBack, onOpenCanvas }) {
  const {
    lessons, loading, creating, error, isDirty,
    bulkCreate, addBeforeFinal, addLast, renameLesson, removeLesson, saveStructure, togglePublished,
  } = useCurriculumLessons(curriculumId, curriculumTitle)

  // Название модуля наверху схемы: локальная копия (админ может
  // переименовать прямо здесь; родитель перечитает при выходе)
  const [title,        setTitle]        = useState(curriculumTitle)
  const [titleEditing, setTitleEditing] = useState(false)
  const [titleDraft,   setTitleDraft]   = useState('')
  const [launchId,        setLaunchId]        = useState(null)
  const [playerData,      setPlayerData]      = useState(null)
  const [playingLessonId, setPlayingLessonId] = useState(null)
  // Режим пересдачи (RetakeDialog): null — первое прохождение,
  // 'update' — новая диагностика поверх старой, 'silent' — без записи анализа
  const [statsMode,       setStatsMode]       = useState(null)
  const [completedIds,    setCompletedIds]    = useState(() => getCompletedLessons())
  // Только что пройденный урок — для анимации прилёта XP в графе модуля.
  const [justCompleted,   setJustCompleted]   = useState(null)
  const [saving,          setSaving]          = useState(false)
  const [saveMsg,         setSaveMsg]         = useState('')
  // Приоритеты уроков из анализа знаний: Map<lessonId, 'high'|'medium'|'low'>
  const [priorities,      setPriorities]      = useState(null)
  // Легенда «Приоритеты уроков» поверх затемнённой схемы (этап 5)
  const [showLegend,      setShowLegend]      = useState(false)
  // Попап только что закрыт — отложенная анимация графа идёт с половинным офсетом
  const [postLegend,      setPostLegend]      = useState(false)
  // Звёзды уроков модуля: Map<lessonId, 1..3> — максимум из локального стора
  // и сервера (lesson_results.stars), для отображения на карточках схемы
  const [stars,           setStars]           = useState(null)
  // Отказ start_lesson: показать экран «Энергия закончилась» ({ nextAt })
  const [noEnergy,        setNoEnergy]        = useState(null)
  // Мягкое предложение Pro после первого прохождения Финала (момент успеха)
  const [proOffer,        setProOffer]        = useState(false)
  const didInitRef = useRef(false)
  const { isAdmin } = useAdmin()
  const { user } = useAuth()

  // Регистрация посреди урока (нода в плеере): гостевая сессия start_lesson
  // была пустой — без пересоздания под новым пользователем complete_lesson
  // вернёт 0 XP, а модуль не попадёт в «Мои уроки»
  useEffect(() => {
    if (!user || !playingLessonId) return
    startLesson(playingLessonId)
    if (lessons.length > 0 && playingLessonId === lessons[0].id) {
      markModuleStarted(curriculumId)
    }
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Возвращает promise с картой приоритетов — вызывающий может дождаться
  // пересчёта до показа графа и решить, показывать ли легенду
  function refreshPriorities() {
    return loadAllEvents()
      .then(events => {
        const map = computeAllPriorities(events)
        setPriorities(map)
        return map
      })
      .catch(() => null)
  }

  // Звёзды: при загрузке уроков и после каждого прохождения (локальный стор
  // уже обновлён плеером к моменту вызова).
  const refreshStars = (ls = lessons) => loadStarsMap(user, ls).then(setStars)

  useEffect(() => {
    if (!isPro && lessons.length > 0) refreshStars(lessons)
  }, [lessons, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function closeLegend() {
    localStorage.setItem(LEGEND_SEEN_KEY, '1')
    setShowLegend(false)
    setPostLegend(true) // анимация после попапа — с половинным офсетом
  }

  useEffect(() => {
    // Прогрев кэша профиля: вкладка «Профиль» откроется сразу со свежим XP.
    refreshProfile()
    refreshPriorities()
  }, [])

  useEffect(() => {
    // Авто-создание уроков в пустом модуле — только у админа (запись в БД).
    // Про-модуль стартует с одного урока (Старта и Финала у него нет).
    if (isAdmin && !loading && !creating && lessons.length === 0 && !didInitRef.current) {
      didInitRef.current = true
      bulkCreate(isPro ? ['Урок 1'] : ['Старт', 'Урок', 'Финал'])
    }
  }, [isAdmin, loading, creating, lessons.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Полный сброс модуля (тест-кнопка ⟲): снимает «пройдено» локально и на
  // сервере, отнимает начисленный за эти уроки XP и стирает анализ (события).
  async function handleResetProgress() {
    if (!window.confirm('Сбросить прохождение, XP и анализ уроков этого модуля?')) return
    const ids = lessons.map(l => l.id)
    unmarkLessons(ids)
    setCompletedIds(getCompletedLessons())
    clearLocalEvents(ids)
    // Полный сброс = «как новый пользователь»: легенда покажется снова
    localStorage.removeItem(LEGEND_SEEN_KEY)
    // Модуль больше не «начат» — вернётся в рекомендации
    unmarkModuleStarted(curriculumId)
    const { refunded, error } = await resetLessonProgress(ids, true) // true = стереть и анализ
    dbg('[RESET] модуль:', ids.length, 'уроков, XP снято:', refunded, 'ошибка:', error)
    if (error) { setSaveMsg(`Сброс на сервере не сработал: ${error}`); setTimeout(() => setSaveMsg(''), 6000) }
    if (refunded > 0) refreshProfile()
    await refreshPriorities()
  }

  // Сброс одного урока (кнопка ⟲ на уроке): снимает только «пройдено» и его XP,
  // анализ (answers) не трогает.
  async function handleResetLesson(id) {
    unmarkLessons([id])
    setCompletedIds(getCompletedLessons())
    const { refunded, error } = await resetLessonProgress([id], false)
    dbg('[RESET] урок:', id, 'XP снято:', refunded, 'ошибка:', error)
    if (error) { setSaveMsg(`Сброс на сервере не сработал: ${error}`); setTimeout(() => setSaveMsg(''), 6000) }
    if (refunded > 0) refreshProfile()
  }

  async function handleSave() {
    setSaving(true)
    setSaveMsg('')
    const result = await saveStructure()
    setSaving(false)
    setSaveMsg(result.ok ? '✓ Сохранено' : `Ошибка: ${result.error}`)
    setTimeout(() => setSaveMsg(''), 3000)
  }

  async function commitTitle() {
    const v = titleDraft.trim()
    setTitleEditing(false)
    if (!v || v === title) return
    setTitle(v) // оптимистично
    try { await renameCurriculum(curriculumId, v) }
    catch { setSaveMsg('Не удалось переименовать'); setTimeout(() => setSaveMsg(''), 3000) }
  }

  if (playerData) {
    return (
      <LessonPlayer
        nodes={playerData.nodes}
        files={playerData.files}
        lessonTitle={playerData.title}
        lessonXp={playerData.lessonXp ?? 0}
        lessonId={playingLessonId}
        teacherName={playerData.teacherName}
        teacherLogo={playerData.teacherLogo}
        teacherLogoCrop={playerData.teacherLogoCrop}
        videoAutoSound={playerData.videoAutoSound ?? false}
        initialBlobMap={playerData.blobMap}
        recordStats={statsMode !== 'silent'} /* «без записи» — анализ не пишется */
        /* Финал модуля (залогинен, не про-модуль): панель подсказок + золотой билет */
        finalTicket={!isPro && user && lessons.length > 0 &&
          playingLessonId === lessons[lessons.length - 1].id
          ? { moduleId: curriculumId } : null}
        /* Обычный урок (между Стартом и Финалом): звёзды по ошибкам */
        starsEligible={!isPro && lessons.length > 2 &&
          playingLessonId !== lessons[0].id &&
          playingLessonId !== lessons[lessons.length - 1].id}
        onClose={() => setPlayerData(null)}
        onSummaryClose={async () => {
          if (playingLessonId) {
            const wasDone = completedIds.has(playingLessonId)
            markLessonCompleted(playingLessonId)
            setCompletedIds(getCompletedLessons())
            if (!wasDone) {
              const l = lessons.find(x => x.id === playingLessonId)
              if (l) setJustCompleted({ id: l.id, xp: l.lessonXp ?? 0 })
            }
            // Финальный урок = модуль пройден: пометка недели для попапа
            // «доступна супергонка». Про-модуль — не в счёт (он сам про гонку)
            if (!isPro && lessons.length > 0 && playingLessonId === lessons[lessons.length - 1].id) {
              localStorage.setItem(MODULE_DONE_WEEK_KEY, weekKey())
              // Момент успеха: первое прохождение Финала → мягкое предложение
              // Pro (только залогиненным без подписки и не админам)
              const p = getCachedProfile()
              if (!wasDone && p && !p.has_subscription && !p.is_admin) setProOffer(true)
            }
          }
          // Звёзды: локальный стор уже обновлён плеером — пересобрать карту
          refreshStars()
          // Ждём пересчёт приоритетов ДО закрытия плеера — граф отрисуется
          // сразу с готовыми полосками, без скачка UI на глазах пользователя
          const map = await refreshPriorities()
          // Легенда — когда диагностика впервые дала приоритеты, и снова
          // после пересдачи «с обновлением» (карта знаний перезаписана)
          const seen = !!localStorage.getItem(LEGEND_SEEN_KEY)
          dbg('[LEGEND] приоритетов:', map?.size ?? 'null', 'уже видел:', seen, 'режим:', statsMode)
          if (map?.size > 0 && (!seen || statsMode === 'update')) {
            setShowLegend(true)
          }
          setPlayerData(null)
          setPlayingLessonId(null)
        }}
      />
    )
  }

  return (
    <div className="lessonsMapPanel">
      <div className="lessonsMapToolbar">
        <button className="lessonBackBtn" onClick={onBack}>← Назад</button>
        {titleEditing ? (
          <input
            className="lessonMapTitle lessonMapTitleInput" autoFocus value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={e => { if (e.key === 'Enter') commitTitle(); if (e.key === 'Escape') setTitleEditing(false) }}
          />
        ) : (
          <span
            className="lessonMapTitle"
            onClick={isAdmin ? () => { setTitleDraft(title); setTitleEditing(true) } : undefined}
            style={isAdmin ? { cursor: 'pointer' } : undefined}
            title={isAdmin ? 'Переименовать модуль' : undefined}>
            {title}{isAdmin && ' ✎'}
          </span>
        )}
        {error && <span className="errorText">{error}</span>}
        {saveMsg && <span className="dbSaveMsg">{saveMsg}</span>}
        {isAdmin && (
          <>
            <ModuleVideoPanel curriculumId={curriculumId} />
            <button className="saveBtn" onClick={handleResetProgress}
              disabled={loading || !lessons.length} title="Сбросить прохождение уроков модуля (локально)">
              ⟲
            </button>
            <button className={`saveBtn${isDirty ? ' saveBtn--dirty' : ''}`}
              onClick={handleSave} disabled={saving || loading} title="Сохранить структуру на сервер">
              {saving ? '...' : '💾'}
              {isDirty && !saving && <span className="saveDirtyDot" />}
            </button>
            {!isPro && (
              <button className="primaryBtn" onClick={() => addBeforeFinal()} disabled={creating || loading}>
                {creating ? '...' : '+ Урок'}
              </button>
            )}
          </>
        )}
      </div>

      {loading || (creating && lessons.length === 0) ? (
        <div className="lessonsHint">Загрузка...</div>
      ) : isPro ? (
        <ProModuleLessons
          lessons={lessons}
          completedIds={completedIds}
          creating={creating}
          onPlay={id => setLaunchId(id)}
          onEdit={id => onOpenCanvas({
            id,
            moduleLessons: lessons.map(l => ({ id: l.id, title: l.title })),
          })}
          onDelete={removeLesson}
          onRename={renameLesson}
          onAdd={() => addLast(`Урок ${lessons.length + 1}`)}
        />
      ) : (
        <ModuleGraph
          lessons={lessons}
          completedIds={completedIds}
          priorities={priorities}
          stars={stars}
          animHold={showLegend} /* пока попап открыт — вся анимация графа на паузе */
          animShort={postLegend}
          justCompleted={justCompleted}
          onFlightDone={() => { setJustCompleted(null); setPostLegend(false) }}
          onResetLesson={handleResetLesson}
          onPlay={id => setLaunchId(id)}
          onEdit={id => onOpenCanvas({
            id,
            moduleLessons: lessons.map(l => ({ id: l.id, title: l.title })),
          })}
          onDelete={removeLesson}
          onRename={renameLesson}
          onTogglePublished={togglePublished}
        />
      )}

      {launchId && (
        <LessonLaunchCard
          lessonId={launchId}
          retake={completedIds.has(launchId)}
          examIntro={!isPro && lessons.length > 0 && launchId === lessons[lessons.length - 1].id}
          /* Старт и Финал модуля сервер не тарифицирует — надпись о стоимости честная */
          energyFree={lessons.length > 0 &&
            (launchId === lessons[0].id || launchId === lessons[lessons.length - 1].id)}
          onStart={async (data, mode) => {
            // Энергия: сервер решает, бесплатный урок или -1; при нуле —
            // пейволл вместо плеера
            const res = await startLesson(launchId)
            if (res?.ok === false) {
              setLaunchId(null)
              setNoEnergy({ nextAt: res.next_at })
              return
            }
            refreshProfile() // молнии в профиле — свежие
            // «Начал модуль» для «Моих уроков»: только залогиненный и только
            // при запуске стартового урока (первого в схеме)
            if (lessons.length > 0 && launchId === lessons[0].id) {
              markModuleStarted(curriculumId)
            }
            setPlayingLessonId(launchId)
            setLaunchId(null)
            setStatsMode(mode ?? null)
            setPlayerData(data)
          }}
          onClose={() => setLaunchId(null)}
        />
      )}

      {noEnergy && (
        <EnergyPaywall nextAt={noEnergy.nextAt} onClose={() => setNoEnergy(null)} />
      )}

      {proOffer && (
        <ProPaywall heading="Модуль пройден! 🎉" onClose={() => setProOffer(false)} />
      )}

      {showLegend && (
        <PriorityLegend
          lessons={lessons}
          priorities={priorities}
          moduleTitle={curriculumTitle}
          onClose={closeLegend}
        />
      )}

      {/* Плашка «Серия X дней»: раз в день, ждёт конец анимаций графа
          (прилёт XP / легенда приоритетов) — см. StreakDailyToast */}
      <StreakDailyToast waiting={!!justCompleted || showLegend || !!launchId} />

    </div>
  )
}
