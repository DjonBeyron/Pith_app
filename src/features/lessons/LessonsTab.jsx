import { useState, useEffect, useRef } from 'react'
import { useCurricula } from './useCurricula.js'
import { useCurriculumLessons } from './useCurriculumLessons.js'
import CurriculaList from './CurriculaList.jsx'
import ModuleGraph from './ModuleGraph.jsx'
import LessonLaunchCard from './LessonLaunchCard.jsx'
import LessonPlayer from '../player/LessonPlayer.jsx'
import { isDebugOn } from '../../shared/lib/debug.js'
import { getCompletedLessons, markLessonCompleted } from '../../shared/lib/completedLessons.js'
import { getLocalXp } from '../../shared/lib/localProfile.js'
import { useAdmin } from '../../app/AdminContext.jsx'

function CurriculumView({ curriculumId, curriculumTitle, onBack, onOpenCanvas }) {
  const {
    lessons, loading, creating, error, isDirty,
    bulkCreate, addBeforeFinal, renameLesson, removeLesson, saveStructure, togglePublished,
  } = useCurriculumLessons(curriculumId, curriculumTitle)

  const [launchId,        setLaunchId]        = useState(null)
  const [playerData,      setPlayerData]      = useState(null)
  const [playingLessonId, setPlayingLessonId] = useState(null)
  const [completedIds,    setCompletedIds]    = useState(() => getCompletedLessons())
  const [currentXp,       setCurrentXp]       = useState(() => getLocalXp())
  const [saving,          setSaving]          = useState(false)
  const [saveMsg,         setSaveMsg]         = useState('')
  const didInitRef = useRef(false)
  const { isAdmin } = useAdmin()

  useEffect(() => {
    // Авто-создание уроков в пустом модуле — только у админа (запись в БД).
    if (isAdmin && !loading && !creating && lessons.length === 0 && !didInitRef.current) {
      didInitRef.current = true
      bulkCreate(['Старт', 'Урок', 'Финал'])
    }
  }, [isAdmin, loading, creating, lessons.length]) // eslint-disable-line react-hooks/exhaustive-deps

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
        onClose={() => setPlayerData(null)}
        onSummaryClose={() => {
          if (playingLessonId) {
            markLessonCompleted(playingLessonId)
            setCompletedIds(getCompletedLessons())
            setCurrentXp(getLocalXp())
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
        <button className="lessonBackBtn" onClick={onBack}>← Модули</button>
        <span className="lessonMapTitle">{curriculumTitle}</span>
        {error && <span className="errorText">{error}</span>}
        {saveMsg && <span className="dbSaveMsg">{saveMsg}</span>}
        {isAdmin && (
          <>
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
          currentXp={currentXp}
          onPlay={id => setLaunchId(id)}
          onEdit={onOpenCanvas}
          onDelete={removeLesson}
          onRename={renameLesson}
          onTogglePublished={togglePublished}
        />
      )}

      {isDebugOn() && (
        <DbDebugPanel curriculumId={curriculumId} lessons={lessons} />
      )}

      {launchId && (
        <LessonLaunchCard
          lessonId={launchId}
          onStart={data => { setPlayingLessonId(launchId); setLaunchId(null); setPlayerData(data) }}
          onClose={() => setLaunchId(null)}
        />
      )}
    </div>
  )
}

function DbDebugPanel({ curriculumId, lessons }) {
  return (
    <div className="dbDebugPanel">
      <div className="dbDebugTitle">🗄 DB Debug</div>
      <div className="dbDebugRow"><b>curriculum_id:</b> {curriculumId}</div>
      <div className="dbDebugRow"><b>lessons ({lessons.length}):</b></div>
      {lessons.map((l, i) => (
        <div key={l.id} className="dbDebugRow dbDebugLesson">
          [{i}] {l.id.slice(0, 8)}… — {l.title}
        </div>
      ))}
    </div>
  )
}

const NAV_KEY = 'lessons_nav_v1'
function loadNav() {
  try { return JSON.parse(localStorage.getItem(NAV_KEY) ?? 'null') } catch { return null }
}
function saveNav(val) {
  if (val) localStorage.setItem(NAV_KEY, JSON.stringify(val))
  else localStorage.removeItem(NAV_KEY)
}

export default function LessonsTab({ onOpenCanvas }) {
  const { curricula, syncStatus, syncError, createCurriculum, deleteCurriculum, renameCurriculum, saveCurriculumToServer } = useCurricula()
  const [selected, setSelected] = useState(loadNav)

  function select(c) { setSelected(c); saveNav(c) }
  function deselect() { setSelected(null); saveNav(null) }

  const stillExists = selected && curricula.some(c => c.id === selected.id)
  if (selected && !stillExists && curricula.length > 0) {
    deselect()
    return null
  }

  if (selected && stillExists) {
    return (
      <CurriculumView
        curriculumId={selected.id}
        curriculumTitle={selected.title}
        onBack={deselect}
        onOpenCanvas={onOpenCanvas}
      />
    )
  }

  return (
    <CurriculaList
      curricula={curricula}
      syncStatus={syncStatus}
      syncError={syncError}
      onCreate={() => { const c = createCurriculum(); select({ id: c.id, title: c.title }) }}
      onOpen={c => select({ id: c.id, title: c.title })}
      onDelete={id => { if (selected?.id === id) deselect(); deleteCurriculum(id) }}
      onRename={renameCurriculum}
      onSave={(id, title) => {
        const lessonIds = JSON.parse(localStorage.getItem(`curr_lessons_${id}`) ?? '[]')
        return saveCurriculumToServer(id, title, lessonIds)
      }}
    />
  )
}
