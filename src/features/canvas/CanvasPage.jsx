import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { dbg } from '../../shared/lib/debug.js'
import CanvasBoard from './CanvasBoard.jsx'
import NodeTypeMenu from './NodeTypeMenu.jsx'
import CanvasToolsMenu from './CanvasToolsMenu.jsx'
import { computeMenuPos } from '../../shared/lib/menuPosition.js'
import { useAdmin } from '../../app/AdminContext.jsx'
import { canvasLsKey } from './canvasStorageKeys.js'
import LessonFilesPanel from './LessonFilesPanel.jsx'
import LessonPlayer from '../player/LessonPlayer.jsx'
import { useLessonFiles } from './useLessonFiles.js'
import { useCanvasFilter } from './useCanvasFilter.js'
import { useTeacherSettings } from './useTeacherSettings.js'
import { loadScript, saveLesson } from '../../shared/lib/lessonsApi.js'
import { setLastEditorMode } from '../../shared/lib/lastEditorMode.js'
import { setLastEditedLesson } from '../../shared/lib/lastEditedLesson.js'
import { notifyLessonSaved } from '../../shared/lib/lessonSavedBus.js'
import BackButton from '../../shared/ui/BackButton.jsx'

export default function CanvasPage({ lessonId, moduleLessons = [], onBack, onOpenProduction }) {
  // Уроки модуля для привязки ответов (анализ знаний) — без урока, который редактируем.
  // useMemo — иначе новый массив на КАЖДЫЙ рендер CanvasPage (клик по XP-полю,
  // обновление syncStatus и т.п.) срывал бы React.memo у всех CanvasNode
  // разом (moduleLessons — их проп), сводя мемоизацию на нет
  const linkableLessons = useMemo(
    () => moduleLessons.filter(l => l.id !== lessonId),
    [moduleLessons, lessonId],
  )
  // ⚙ в схеме модуля запоминает, каким редактором пользовались последним,
  // и в следующий раз открывает сразу его (см. lastEditorMode.js)
  useEffect(() => { setLastEditorMode('canvas') }, [])
  const [showPanel,   setShowPanel]   = useState(false)
  const [showPlayer,  setShowPlayer]  = useState(false)
  // Админский прогон с середины: id ноды, с которой начать сценарий
  const [playFrom,    setPlayFrom]    = useState(null)
  const [filterPos,   setFilterPos]   = useState(null)
  const [toolsPos,    setToolsPos]    = useState(null)
  // Оверлей открытого меню закрывает его по нажатию — в том числе когда
  // нажали по самой кнопке. Без отметки времени следом идущий клик тут же
  // открывал бы меню заново, и повторное нажатие ничего не закрывало
  const menuClosedAt = useRef(0)
  const { isAdmin } = useAdmin()
  const [title,       setTitle]       = useState('')
  const [loading,     setLoading]     = useState(!!lessonId)
  const [isSaving,    setIsSaving]    = useState(false)
  const [serverNodes, setServerNodes] = useState(null)
  const [panelNodes,  setPanelNodes]  = useState([])
  // Фильтр в шапке — инструмент поиска на большом графе, только админу:
  // отмеченные типы плюс особый режим «не загруженные». Что не проходит
  // фильтр — притухает, оставаясь на своём месте со связями
  const filter = useCanvasFilter(panelNodes)
  const [lessonXp,    setLessonXp]    = useState(0)
  // Меняется при «Обновить с сервера» — форсирует remount CanvasBoard (через
  // key), чтобы он заново прочитал initialNodes вместо своего внутреннего
  // localStorage-черновика (см. handleResetToServer)
  const [resetTick,   setResetTick]   = useState(0)
  // Видимая на любом устройстве строка статуса синхронизации (без включения
  // «Активировать дебаг» — на свежем компьютере без кэша дебаг тоже выключен
  // по умолчанию). Помогает увидеть расхождение id/числа нод между
  // компьютерами прямо в интерфейсе, без консоли разработчика
  const [syncStatus,  setSyncStatus]  = useState('')
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
    clearDraft: clearTeacherDraft,
  } = useTeacherSettings(lessonId)

  // Правка ноды из правой панели плеера (только админ, только прогон из
  // канваса): ноды живут внутри CanvasBoard, поэтому идём туда через ref —
  // второго источника правды не заводим. На сервер уходит по «Сохранить»
  const handleEditNode = useCallback(
    (id, patch) => boardApiRef.current?.updateNode(id, patch), [])

  // «К ноде» из правой панели плеера: закрываем прогон и показываем на холсте
  // ту ноду, которую правили
  const handleExitToNode = useCallback(id => {
    setShowPlayer(false)
    setPlayFrom(null)
    boardApiRef.current?.focusNode(id)
  }, [])

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
        // Запоминаем урок для всплывашки «продолжить редактирование» при
        // следующем запуске приложения (ResumeEditingToast.jsx)
        setLastEditedLesson({ id: lessonId, title: data?.title })
        setLessonXp(data?.script?.lessonXp ?? 0)
        applyServerData(data?.script)
        if (nodes.length) setServerNodes(nodes)
        const stamp = new Date().toTimeString().slice(0, 8)
        setSyncStatus(`Загружено с сервера: ${nodes.length} нод · id ${lessonId.slice(0, 8)} · ${stamp}`)
      })
      .catch(e => {
        dbg('[CANVAS ERROR] loadScript', e?.message)
        setSyncStatus('✗ Ошибка загрузки: ' + (e?.message ?? '?'))
      })
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
      // Схема модуля открыта под редактором и сама в базу больше не ходит —
      // сообщаем ей новое название и XP, иначе они обновились бы только после
      // перезагрузки приложения
      notifyLessonSaved({ id: lessonId, title, lessonXp })
      // Локальный черновик (CanvasBoard) свою задачу выполнил — он сохранён
      // на сервере. Чистим его: иначе при следующем открытии урока редактор
      // навсегда показывал бы этот черновик вместо настоящих данных сервера
      // (даже если их поменяли откуда-то ещё), см. canvasLsKey/loadSaved()
      localStorage.removeItem(canvasLsKey(lessonId))
      // Тот же принцип для черновика настроек учителя (useTeacherSettings) —
      // он раньше не чистился вообще и навсегда прятал бы правки учителя,
      // сделанные позже с другого устройства
      clearTeacherDraft()
      dbg('[CANVAS] save complete — verifying round-trip...')
      // Контрольное чтение сразу после сохранения — не доверяем «раз не было
      // ошибки, значит записалось» (see lessonsApi.saveLesson: .select() уже
      // ловит 0-строк, но это ещё одна независимая проверка того, что именно
      // ЧИТАЕТ сервер после нашей записи — включая реальные r2Url по нодам).
      // Статус виден в интерфейсе на любом устройстве, без включения дебага
      const stamp = new Date().toTimeString().slice(0, 8)
      try {
        const check = await loadScript(lessonId)
        const checkNodes = check?.script?.nodes ?? []
        dbg('[CANVAS] verify: server now has', checkNodes.length, 'nodes (sent', nodesForSave.length, ')')
        const checkFiles = checkNodes
          .filter(n => n.typeData?.[n.type]?.file_id)
          .map(n => `${n.type}#${n.seq}:${(n.typeData[n.type].file_id ?? '').slice(0, 8)}→${n.typeData[n.type].r2Url ? 'r2Url✓' : 'r2Url✗НЕТ'}`)
          .join(', ')
        if (checkFiles) dbg('[CANVAS] verify: server files:', checkFiles)
        setSyncStatus(checkNodes.length !== nodesForSave.length
          ? `⚠ Сохранено ${nodesForSave.length}, но сервер вернул ${checkNodes.length} — id ${lessonId.slice(0, 8)} · ${stamp}`
          : `✓ Сохранено и проверено: ${checkNodes.length} нод · id ${lessonId.slice(0, 8)} · ${stamp}`)
      } catch (e) {
        dbg('[CANVAS ERROR] post-save verify failed', e?.message)
        setSyncStatus(`Сохранено (без проверки — ${e?.message ?? '?'}) · ${stamp}`)
      }
    } catch (e) {
      // Раньше ошибка (RLS, сеть, 0 строк изменено) уходила в необработанный
      // reject молча — кнопка просто возвращалась в норму, будто сохранено,
      // хотя на сервере ничего не менялось: с другого компьютера тот же урок
      // выглядел «не синхронизированным». Явно сообщаем и не глотаем ошибку —
      // switchToProduction ждёт handleSave() и не должен переключать экран,
      // будто всё в порядке
      dbg('[CANVAS ERROR] save failed', e?.message)
      setSyncStatus('✗ Ошибка сохранения: ' + (e?.message ?? '?'))
      window.alert('Не удалось сохранить урок: ' + (e?.message ?? 'неизвестная ошибка') +
        '\n\nПравки остались только у вас в браузере — попробуйте сохранить ещё раз.')
      throw e
    } finally {
      setIsSaving(false)
    }
  }

  // Переход в продакшен-список — те же данные, другой вид: сохраняем перед
  // переключением (как по кнопке «Сохранить»), иначе список открыл бы
  // прошлую версию урока с сервера, а несохранённые правки остались бы
  // только в этом (сейчас закрываемом) редакторе. Если сохранение не
  // удалось — handleSave уже показал алерт, просто не переключаем экран
  async function switchToProduction() {
    try {
      await handleSave()
    } catch {
      return
    }
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
          {isAdmin && (
            <button
              className={`canvasPageFilter${filter.activeCount ? ' canvasPageFilterOn' : ''}`}
              title={filter.activeCount
                ? `Фильтр включён (${filter.activeCount}) — нажми, чтобы изменить`
                : 'Фильтр по типам нод и по незагруженным файлам'}
              onClick={e => {
                if (Date.now() - menuClosedAt.current < 250) return
                setFilterPos(computeMenuPos(e.currentTarget.getBoundingClientRect()))
              }}
            >⛃{filter.activeCount ? ` ${filter.activeCount}` : ''}</button>
          )}
          <button className="canvasPagePlay" onClick={() => { setPlayFrom(null); setShowPlayer(true) }}>▶</button>
          <button
            className="canvasPageTools"
            title="Ещё действия с холстом"
            disabled={loading}
            onClick={e => {
              if (Date.now() - menuClosedAt.current < 250) return
              setToolsPos(computeMenuPos(e.currentTarget.getBoundingClientRect()))
            }}
          >⋯</button>
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

      {syncStatus && <div className="canvasSyncStatus">{syncStatus}</div>}

      <CanvasToolsMenu
        pos={toolsPos}
        onClose={() => { menuClosedAt.current = Date.now(); setToolsPos(null) }}
        items={[
          ...(filter.activeCount
            ? [{ label: `Сбросить фильтры (${filter.activeCount})`,
                 title: 'Показать все ноды',
                 onClick: filter.reset }]
            : []),
          { label: 'В начало', title: 'Прокрутить холст к первой ноде',
            onClick: () => boardApiRef.current?.focusStart() },
          { label: 'Раздвинуть', title: 'Развести ноды, если они наехали друг на друга',
            onClick: () => boardApiRef.current?.spreadNodes() },
          { label: '↻ Вернуть данные с сервера', title: 'Отменить несохранённые локальные правки',
            onClick: handleResetToServer },
          { label: 'Очистить все ноды', danger: true, title: 'Удалить все ноды урока',
            onClick: () => boardApiRef.current?.clearAll() },
        ]}
      />

      <NodeTypeMenu
        pos={filterPos}
        multi
        selected={filter.types}
        missingMedia={filter.onlyMissingMedia}
        missingMediaCount={filter.missingCount}
        onToggleMissingMedia={filter.toggleMissingMedia}
        onReset={filter.reset}
        onClose={() => { menuClosedAt.current = Date.now(); setFilterPos(null) }}
        onPick={filter.toggleType}
      />

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
          startNodeId={playFrom}
          edit={isAdmin ? {
            onUpdateNode: handleEditNode,
            onPickLessonFile: pickFile,
            moduleLessons: linkableLessons,
            onExitToNode: handleExitToNode,
          } : null}
          onClose={() => { setShowPlayer(false); setPlayFrom(null) }}
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
          onPlayFrom={id => { setPlayFrom(id); setShowPlayer(true) }}
          visibleTypes={filter.types}
          onlyMissingMedia={filter.onlyMissingMedia}
        />
      )}
    </div>
  )
}
