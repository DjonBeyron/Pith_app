import { useState, useCallback, useEffect, useRef } from 'react'
import { dbg } from '../../shared/lib/debug.js'
import CanvasBoard from './CanvasBoard.jsx'
import { canvasLsKey } from './canvasStorageKeys.js'
import LessonFilesPanel from './LessonFilesPanel.jsx'
import LessonPlayer from '../player/LessonPlayer.jsx'
import { useLessonFiles } from './useLessonFiles.js'
import { useTeacherSettings } from './useTeacherSettings.js'
import { loadScript, saveLesson } from '../../shared/lib/lessonsApi.js'
import { setLastEditorMode } from '../../shared/lib/lastEditorMode.js'
import BackButton from '../../shared/ui/BackButton.jsx'

export default function CanvasPage({ lessonId, moduleLessons = [], onBack, onOpenProduction }) {
  // Уроки модуля для привязки ответов (анализ знаний) — без урока, который редактируем
  const linkableLessons = moduleLessons.filter(l => l.id !== lessonId)
  // ⚙ в схеме модуля запоминает, каким редактором пользовались последним,
  // и в следующий раз открывает сразу его (см. lastEditorMode.js)
  useEffect(() => { setLastEditorMode('canvas') }, [])
  const [showPanel,   setShowPanel]   = useState(false)
  const [showPlayer,  setShowPlayer]  = useState(false)
  const [title,       setTitle]       = useState('')
  const [loading,     setLoading]     = useState(!!lessonId)
  const [isSaving,    setIsSaving]    = useState(false)
  const [serverNodes, setServerNodes] = useState(null)
  const [panelNodes,  setPanelNodes]  = useState([])
  const [lessonXp,    setLessonXp]    = useState(0)
  // Меняется при «Обновить с сервера» — форсирует remount CanvasBoard (через
  // key), чтобы он заново прочитал initialNodes вместо своего внутреннего
  // localStorage-черновика (см. handleResetToServer)
  const [resetTick,   setResetTick]   = useState(0)
  const nodesRef = useRef([])
  // nodes/offset/scale живут внутри CanvasBoard — «Очистить»/«В начало» дотягиваются
  // туда через imperative handle (см. useImperativeHandle в CanvasBoard.jsx)
  const boardApiRef = useRef(null)

  const { files, syncing, hasUnsynced, pickFile, removeFile, syncToServer, fetchMissingFiles } =
    useLessonFiles(lessonId)

  const {
    teacherName, setTeacherName,
    teacherLogoUrl,
    teacherLogoCrop, setTeacherLogoCrop,
    videoAutoSound, setVideoAutoSound,
    teacherMode, setTeacherMode,
    globalTeacher, effectiveTeacher,
    hasUnsyncedLogo,
    handleLogoPick,
    applyServerData,
    prepareForSave,
  } = useTeacherSettings(lessonId)

  const handleNodesChange = useCallback(n => {
    nodesRef.current = n
    setPanelNodes(n)
    const regular = n.map(nd => nd.typeData?.[nd.type]?.file_id).filter(Boolean)
    const pcPhotos = n
      .filter(nd => nd.type === 'photo_choice')
      .flatMap(nd => (nd.typeData?.photo_choice?.photos ?? []).map(ph => ph.fileId).filter(Boolean))
    const ids = [...new Set([...regular, ...pcPhotos])]
    if (ids.length) fetchMissingFiles(ids)
  }, [fetchMissingFiles])

  useEffect(() => {
    if (!lessonId) return
    loadScript(lessonId)
      .then(data => {
        const nodes = data?.script?.nodes ?? []
        dbg('[CANVAS] loaded lesson', lessonId, nodes.length, 'nodes, title:', data?.title)
        if (nodes.length) dbg('[CANVAS] node types:', nodes.map(n => n.type).join(', '))
        setTitle(data?.title ?? '')
        setLessonXp(data?.script?.lessonXp ?? 0)
        applyServerData(data?.script)
        if (nodes.length) setServerNodes(nodes)
      })
      .catch(e => dbg('[CANVAS ERROR] loadScript', e?.message))
      .finally(() => setLoading(false))
  // applyServerData is stable (defined outside render), safe to omit from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId])

  async function handleSave() {
    setIsSaving(true)
    try {
      // Сначала догружаем в R2 всё, что ещё не синхронизировано (раньше это
      // была ОТДЕЛЬНАЯ кнопка «Синхронизировать» — если её не нажать или не
      // дождаться, Save «запекал» в урок старый/пустой r2Url). syncToServer
      // возвращает АКТУАЛЬНЫЙ список файлов явно — не читаем состояние `files`
      // из closure, оно бы осталось старым до следующего рендера
      const currentFiles = hasUnsynced ? await syncToServer() : files
      const teacherData = await prepareForSave()
      // Inject r2Url into each node's typeData so the player can use it without Supabase lookup
      const nodesForSave = nodesRef.current.map(node => {
        // photo_choice: inject r2Url into each photo object
        if (node.type === 'photo_choice') {
          const photos = (node.typeData?.photo_choice?.photos ?? []).map(ph => {
            if (!ph.fileId) return ph
            const f = currentFiles.find(fl => fl.id === ph.fileId)
            return f?.r2Url ? { ...ph, photoUrl: f.r2Url } : ph
          })
          return { ...node, typeData: { ...node.typeData, photo_choice: { ...node.typeData.photo_choice, photos } } }
        }
        const fileId = node.typeData?.[node.type]?.file_id
        if (!fileId) return node
        const f = currentFiles.find(fl => fl.id === fileId)
        if (!f?.r2Url) return node
        return { ...node, typeData: { ...node.typeData, [node.type]: { ...node.typeData[node.type], r2Url: f.r2Url } } }
      })
      const scriptToSave = { nodes: nodesForSave, lessonXp, ...teacherData }
      dbg('[CANVAS] saving', nodesForSave.length, 'nodes to lesson', lessonId)
      await saveLesson(lessonId, { title, script: scriptToSave })
      // Локальный черновик (CanvasBoard) свою задачу выполнил — он сохранён
      // на сервере. Чистим его: иначе при следующем открытии урока редактор
      // навсегда показывал бы этот черновик вместо настоящих данных сервера
      // (даже если их поменяли откуда-то ещё), см. canvasLsKey/loadSaved()
      localStorage.removeItem(canvasLsKey(lessonId))
      dbg('[CANVAS] save complete — verifying round-trip...')
      // Контрольное чтение сразу после сохранения — не доверяем «раз не было
      // ошибки, значит записалось» (see lessonsApi.saveLesson: .select() уже
      // ловит 0-строк, но это ещё одна независимая проверка того, что именно
      // ЧИТАЕТ сервер после нашей записи — включая реальные r2Url по нодам)
      try {
        const check = await loadScript(lessonId)
        const checkNodes = check?.script?.nodes ?? []
        dbg('[CANVAS] verify: server now has', checkNodes.length, 'nodes (sent', nodesForSave.length, ')')
        const checkFiles = checkNodes
          .filter(n => n.typeData?.[n.type]?.file_id)
          .map(n => `${n.type}#${n.seq}:${(n.typeData[n.type].file_id ?? '').slice(0, 8)}→${n.typeData[n.type].r2Url ? 'r2Url✓' : 'r2Url✗НЕТ'}`)
          .join(', ')
        if (checkFiles) dbg('[CANVAS] verify: server files:', checkFiles)
      } catch (e) {
        dbg('[CANVAS ERROR] post-save verify failed', e?.message)
      }
    } finally {
      setIsSaving(false)
    }
  }

  // Переход в продакшен-список — те же данные, другой вид: сохраняем перед
  // переключением (как по кнопке «Сохранить»), иначе список открыл бы
  // прошлую версию урока с сервера, а несохранённые правки остались бы
  // только в этом (сейчас закрываемом) редакторе
  async function switchToProduction() {
    await handleSave()
    onOpenProduction(lessonId)
  }

  // Кнопка на случай, когда локальный черновик застрял (например, урок
  // поменяли не в этом браузере) — без консоли/DevTools, прямо из интерфейса.
  // Стирает localStorage-черновик CanvasBoard и форсирует его remount, чтобы
  // он заново прочитал initialNodes (уже загруженные с сервера в serverNodes),
  // а не свой internal state
  function handleResetToServer() {
    if (!window.confirm('Отменить несохранённые локальные правки и показать данные с сервера?')) return
    localStorage.removeItem(canvasLsKey(lessonId))
    dbg('[CANVAS] reset to server — dropped local draft', lessonId)
    setResetTick(t => t + 1)
  }

  return (
    <div className="canvasPage">
      <div className="canvasPageHeader">
        <div className="canvasSettingsBtnWrap">
          <button className="canvasSettingsBtn" onClick={() => setShowPanel(s => !s)}>⚙</button>
          {(hasUnsynced || hasUnsyncedLogo) && <span className="canvasSettingsBadge" />}
        </div>
        <input
          className="canvasPageTitle"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Название урока"
        />
        {/* Правая группа целиком: margin-left:auto держит её у правого края
            и на мобильном (где title flex:1 и без того всё выталкивает), и
            на широких экранах (там title уходит в absolute — без этой
            обёртки кнопки съезжали бы к ⚙ левым краем, см. page.css) */}
        <div className="canvasPageActions">
          <BackButton onClick={onBack} />
          <button className="canvasPagePlay" onClick={() => setShowPlayer(true)}>▶</button>
          <button
            className="canvasPageReset"
            onClick={handleResetToServer}
            disabled={loading}
            title="Отменить локальные правки и показать данные с сервера"
          >↻ С сервера</button>
          <button
            className="pageDangerBtn"
            onClick={() => boardApiRef.current?.clearAll()}
            disabled={loading}
            title="Удалить все ноды урока"
          >Очистить</button>
          <button
            className="pageTabBtn"
            onClick={() => boardApiRef.current?.focusStart()}
            disabled={loading}
            title="Прокрутить холст к первой ноде"
          >В начало</button>
          <div className="canvasXpField">
            <input
              className="canvasXpInput"
              type="number"
              min="0"
              step="10"
              value={lessonXp}
              onChange={e => {
                const n = Math.max(0, parseInt(e.target.value) || 0)
                // number-input не чистит ведущий ноль сам («05») — приводим DOM к числу
                e.target.value = String(n)
                setLessonXp(n)
              }}
              onClick={e => e.stopPropagation()}
            />
            <span className="canvasXpLabel">XP</span>
          </div>
          {/* Финальная тройка, всегда в этом порядке: Сохранить → Граф → Продакшен.
              «Граф» — текущая страница (подсвечена, как активная вкладка нижнего
              навбара), клик всё равно работает — просто сохраняет */}
          <button className="canvasPageSave" onClick={handleSave} disabled={isSaving || loading}>
            {isSaving ? 'Сохраняю…' : 'Сохранить'}
          </button>
          <button className="pageTabBtn pageTabBtnActive" onClick={handleSave} disabled={isSaving || loading}>
            Граф
          </button>
          <button className="pageTabBtn" onClick={switchToProduction} disabled={isSaving || loading}>
            Продакшен
          </button>
        </div>
      </div>

      {showPlayer && (
        <LessonPlayer
          nodes={panelNodes}
          files={files}
          lessonTitle={title}
          lessonXp={lessonXp}
          teacherName={effectiveTeacher.name}
          teacherLogo={effectiveTeacher.logo}
          teacherLogoCrop={effectiveTeacher.crop}
          videoAutoSound={videoAutoSound}
          onClose={() => setShowPlayer(false)}
          onSummaryClose={onBack}
        />
      )}

      {showPanel && (
        <LessonFilesPanel
          files={files}
          nodes={panelNodes}
          syncing={syncing}
          hasUnsyncedLogo={hasUnsyncedLogo}
          onRemove={removeFile}
          onClose={() => setShowPanel(false)}
          teacherName={teacherName}
          onNameChange={setTeacherName}
          teacherLogoUrl={teacherLogoUrl}
          onLogoPick={handleLogoPick}
          teacherLogoCrop={teacherLogoCrop}
          onCropChange={setTeacherLogoCrop}
          teacherMode={teacherMode}
          onTeacherModeChange={setTeacherMode}
          globalTeacher={globalTeacher}
          videoAutoSound={videoAutoSound}
          onVideoAutoSoundChange={setVideoAutoSound}
        />
      )}

      {!loading && (
        <CanvasBoard
          key={resetTick}
          ref={boardApiRef}
          lessonId={lessonId}
          lessonFiles={files}
          onPickLessonFile={pickFile}
          onNodesChange={handleNodesChange}
          initialNodes={serverNodes}
          moduleLessons={linkableLessons}
        />
      )}
    </div>
  )
}
