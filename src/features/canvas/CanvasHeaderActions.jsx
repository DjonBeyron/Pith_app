import CanvasXpField from './CanvasXpField.jsx'
import { computeMenuPos } from '../../shared/lib/menuPosition.js'

// Правая группа кнопок шапки канваса — вынесена из CanvasPage.jsx (тот упирался
// в потолок 400 строк). Сама логика (что открывается по клику) остаётся в
// CanvasPage — сюда пробрасываются уже готовые сеттеры/колбэки, здесь только
// разметка кнопок в ряд.
export default function CanvasHeaderActions({
  unsaved, isSaving, loading, handleSave,
  isAdmin, filter, menuClosedAt, setFilterPos, setToolsPos,
  setPlayFrom, setShowPlayer, setIoNodes, setShowBatchGen,
  boardApiRef, lessonXp, setLessonXp, markDirty,
  switchToProduction, hasUnsynced, hasUnsyncedLogo, setShowPanel,
}) {
  return (
    <div className="canvasPageActions">
      {/* Мигающая точка — есть несохранённые правки */}
      <button
        className="canvasPageSave"
        title={unsaved ? 'Есть несохранённые изменения' : 'Сохранить урок'}
        onClick={handleSave}
        disabled={isSaving || loading}
      >
        {isSaving ? '…' : '💾'}
        {unsaved && !isSaving && <span className="canvasPageSaveDot" />}
      </button>
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
        className="canvasPageShare"
        title="Поделиться уроком в JSON и импортировать готовый сценарий"
        disabled={loading}
        onClick={() => setIoNodes(boardApiRef.current?.getNodes() ?? [])}
      >⇄</button>
      {/* Очистка урока — прямо в шапке: после неудачного импорта нужна
          сразу, а не через меню «ещё действия» */}
      <button
        className="canvasPageShare canvasPageClear"
        title="Очистить урок: удалить все ноды"
        disabled={loading}
        onClick={() => boardApiRef.current?.clearAll()}
      >🗑</button>
      {isAdmin && (
        <button
          className="canvasPageBatchGen"
          title="Массовая генерация озвучки и фото по всему уроку разом"
          disabled={loading}
          onClick={() => setShowBatchGen(true)}
        >⚡</button>
      )}
      <button
        className="canvasPageTools"
        title="Ещё действия с холстом"
        disabled={loading}
        onClick={e => {
          if (Date.now() - menuClosedAt.current < 250) return
          setToolsPos(computeMenuPos(e.currentTarget.getBoundingClientRect()))
        }}
      >⋯</button>
      <CanvasXpField
        value={lessonXp}
        onChange={n => { setLessonXp(n); markDirty() }}
      />
      {/* «Граф» — текущая страница (подсвечена, как активная вкладка
          нижнего навбара), клик всё равно работает — просто сохраняет */}
      <button className="pageTabBtn pageTabBtnActive" onClick={handleSave} disabled={isSaving || loading}>
        Граф
      </button>
      <button className="pageTabBtn" onClick={switchToProduction} disabled={isSaving || loading}>
        Продакшен
      </button>
      {/* Настройки урока — в самом правом краю шапки: заходят туда редко,
          а слева их место занял «назад» */}
      <div className="canvasSettingsBtnWrap">
        <button className="canvasSettingsBtn" onClick={() => setShowPanel(s => !s)}>⚙</button>
        {(hasUnsynced || hasUnsyncedLogo) && <span className="canvasSettingsBadge" />}
      </div>
    </div>
  )
}
