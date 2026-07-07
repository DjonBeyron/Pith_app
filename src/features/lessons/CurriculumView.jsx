import { useState, useEffect, useRef } from 'react'
import { useCurriculumLessons } from './useCurriculumLessons.js'
import ModuleGraph from './ModuleGraph.jsx'
import LessonLaunchCard from './LessonLaunchCard.jsx'
import LessonPlayer from '../player/LessonPlayer.jsx'
import { getCompletedLessons, markLessonCompleted, unmarkLessons } from '../../shared/lib/completedLessons.js'
import { refreshProfile } from '../../shared/api/profileCache.js'
import { resetLessonProgress, startLesson } from '../../shared/api/profileApi.js'
import EnergyPaywall from './EnergyPaywall.jsx'
import ModuleVideoPanel from './ModuleVideoPanel.jsx'
import { loadAllEvents, clearLocalEvents } from '../../shared/lib/skillStatsStore.js'
import { markModuleStarted, unmarkModuleStarted } from '../../shared/api/moduleSocialApi.js'
import { dbg } from '../../shared/lib/debug.js'
import PriorityLegend from './PriorityLegend.jsx'
import { computeAllPriorities } from '../../shared/lib/skillScore.js'
import { useAdmin } from '../../app/AdminContext.jsx'
import { useAuth } from '../../shared/lib/useAuth.js'

const LEGEND_SEEN_KEY = 'pithy_priority_legend_seen_v1'

// Экран одного модуля: схема Старт → уроки → Финал, запуск уроков через
// карточку прогрева, плеер, приоритеты анализа знаний. Используется и во
// вкладке «Уроки» (старая оболочка), и из ленты по «Изучить фразу» (ui v2).
export default function CurriculumView({ curriculumId, curriculumTitle, onBack, onOpenCanvas }) {
  const {
    lessons, loading, creating, error, isDirty,
    bulkCreate, addBeforeFinal, renameLesson, removeLesson, saveStructure, togglePublished,
  } = useCurriculumLessons(curriculumId, curriculumTitle)

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
  // Отказ start_lesson: показать экран «Энергия закончилась» ({ nextAt })
  const [noEnergy,        setNoEnergy]        = useState(null)
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
    if (isAdmin && !loading && !creating && lessons.length === 0 && !didInitRef.current) {
      didInitRef.current = true
      bulkCreate(['Старт', 'Урок', 'Финал'])
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
          }
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
        <span className="lessonMapTitle">{curriculumTitle}</span>
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
            <button className="primaryBtn" onClick={() => addBeforeFinal()} disabled={creating || loading}>
              {creating ? '...' : '+ Урок'}
            </button>
          </>
        )}
      </div>

      {loading || (creating && lessons.length === 0) ? (
        <div className="lessonsHint">Загрузка...</div>
      ) : (
        <ModuleGraph
          lessons={lessons}
          completedIds={completedIds}
          priorities={priorities}
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
          examIntro={lessons.length > 0 && launchId === lessons[lessons.length - 1].id}
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

      {showLegend && (
        <PriorityLegend
          lessons={lessons}
          priorities={priorities}
          moduleTitle={curriculumTitle}
          onClose={closeLegend}
        />
      )}
    </div>
  )
}
