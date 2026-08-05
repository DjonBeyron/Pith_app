import { useState, useEffect, useCallback, useRef } from 'react'
import { loadScript, saveLesson } from '../../shared/lib/lessonsApi.js'
import { useLessonFiles } from '../canvas/useLessonFiles.js'
import { canvasLsKey } from '../canvas/canvasStorageKeys.js'
import { productionScrollKey } from './productionStorageKeys.js'
import { dbg } from '../../shared/lib/debug.js'
import { setLastEditorMode } from '../../shared/lib/lastEditorMode.js'
import BackButton from '../../shared/ui/BackButton.jsx'
import ProductionList from './ProductionList.jsx'

// Полноэкранный линейный редактор сценария урока («продакшен»): та же модель
// данных (lessons.script.nodes[]), что и canvas-редактор, — просто другой вид
// для быстрого набора большой цепочки сообщений подряд. См. PROJECT.md.
export default function ProductionPage({ lessonId, moduleLessons = [], onBack, onOpenCanvas }) {
  const linkableLessons = moduleLessons.filter(l => l.id !== lessonId)
  // ⚙ в схеме модуля запоминает, каким редактором пользовались последним,
  // и в следующий раз открывает сразу его (см. lastEditorMode.js)
  useEffect(() => { setLastEditorMode('production') }, [])
  const [title,   setTitle]   = useState('')
  const [loading, setLoading] = useState(!!lessonId)
  const [isSaving, setIsSaving] = useState(false)
  const [nodes, setNodes] = useState([])
  // Видимая на любом устройстве строка статуса синхронизации (без включения
  // «Активировать дебаг» — на свежем компьютере без кэша дебаг тоже выключен
  // по умолчанию). Помогает быстро увидеть расхождение id/числа нод между
  // компьютерами прямо в интерфейсе, без консоли разработчика
  const [syncStatus, setSyncStatus] = useState('')
  // Всё, что лежит в script кроме nodes (lessonXp, настройки учителя...) —
  // сохраняем как есть, чтобы «Сохранить» из списка их не стёрло
  const scriptExtraRef = useRef({})
  // Скролл-контейнер списка (ProductionList) — кнопка «В начало» скроллит его наверх
  const scrollRef = useRef(null)

  const { files, pickFile, fetchMissingFiles } = useLessonFiles(lessonId)

  const handleNodesChange = useCallback(n => {
    setNodes(n)
    const ids = n.map(nd => nd.typeData?.[nd.type]?.file_id).filter(Boolean)
    if (ids.length) fetchMissingFiles(ids)
  }, [fetchMissingFiles])

  useEffect(() => {
    if (!lessonId) return
    loadScript(lessonId)
      .then(data => {
        const { nodes: loadedNodes, ...extra } = data?.script ?? {}
        scriptExtraRef.current = extra
        setTitle(data?.title ?? '')
        handleNodesChange(loadedNodes ?? [])
        const stamp = new Date().toTimeString().slice(0, 8)
        setSyncStatus(`Загружено с сервера: ${(loadedNodes ?? []).length} нод · id ${lessonId.slice(0, 8)} · ${stamp}`)
        dbg('[PRODUCTION] loaded', lessonId, (loadedNodes ?? []).length, 'nodes, types:',
          (loadedNodes ?? []).map(n => n.type).join(', '))
      })
      .catch(e => {
        dbg('[PRODUCTION ERROR] loadScript', e?.message)
        setSyncStatus('✗ Ошибка загрузки: ' + (e?.message ?? '?'))
      })
      .finally(() => setLoading(false))
  // handleNodesChange меняется только при смене fetchMissingFiles (стабилен по lessonId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId])

  // Память позиции скролла — независимо от канваса (там своя, по offset/
  // scale холста, см. CanvasBoard.jsx canvasViewKey): список появляется в
  // DOM только после загрузки, поэтому восстанавливаем здесь же, а не в
  // ленивом useState. Сохраняется на каждый скролл (с задержкой)
  useEffect(() => {
    if (loading || !lessonId) return
    const el = scrollRef.current
    if (!el) return
    const saved = Number(localStorage.getItem(productionScrollKey(lessonId)))
    if (saved > 0) el.scrollTop = saved
    let t
    function onScroll() {
      clearTimeout(t)
      t = setTimeout(() => localStorage.setItem(productionScrollKey(lessonId), String(el.scrollTop)), 200)
    }
    el.addEventListener('scroll', onScroll)
    return () => { clearTimeout(t); el.removeEventListener('scroll', onScroll) }
  }, [loading, lessonId])

  async function handleSave() {
    setIsSaving(true)
    try {
      dbg('[PRODUCTION] saving', nodes.length, 'nodes to lesson', lessonId, 'types:',
        nodes.map(n => n.type).join(', '))
      await saveLesson(lessonId, { title, script: { ...scriptExtraRef.current, nodes } })
      // У canvas-редактора свой localStorage-черновик этого урока (canvasLsKey) —
      // при следующем открытии он имеет приоритет над данными сервера (см.
      // CanvasBoard.jsx). Без этой строки canvas показал бы старый черновик
      // вместо только что сохранённого отсюда порядка/правок — независимо от
      // того, каким путём его потом откроют (кнопка «Граф» здесь, либо ⚙ из
      // схемы модуля напрямую)
      localStorage.removeItem(canvasLsKey(lessonId))
      // Контрольное чтение сразу после сохранения — не доверяем «раз не было
      // ошибки, значит записалось» (см. lessonsApi.saveLesson: .select() уже
      // ловит 0 строк, но это независимая проверка того, что СЕРВЕР реально
      // отдаёт по этому id — та самая проблема с другим компьютером). Статус
      // виден в интерфейсе на любом устройстве, без включения дебага
      const stamp = new Date().toTimeString().slice(0, 8)
      try {
        const check = await loadScript(lessonId)
        const checkCount = check?.script?.nodes?.length ?? 0
        dbg('[PRODUCTION] verify: server now has', checkCount, 'nodes (sent', nodes.length, ')')
        if (checkCount !== nodes.length) {
          setSyncStatus(`⚠ Сохранено ${nodes.length}, но сервер вернул ${checkCount} — id ${lessonId.slice(0, 8)} · ${stamp}`)
        } else {
          setSyncStatus(`✓ Сохранено и проверено: ${checkCount} нод · id ${lessonId.slice(0, 8)} · ${stamp}`)
        }
      } catch (e) {
        dbg('[PRODUCTION ERROR] post-save verify failed', e?.message)
        setSyncStatus(`Сохранено (без проверки — ${e?.message ?? '?'}) · ${stamp}`)
      }
    } catch (e) {
      // Раньше ошибка сохранения (RLS, сеть, 0 строк изменено) молча уходила
      // в необработанный reject — кнопка просто возвращалась в норму, админ
      // думал, что сохранил, а на сервере ничего не менялось: с другого
      // компьютера тот же урок выглядел «не синхронизированным». Явно
      // сообщаем и НЕ глотаем ошибку — switchToCanvas ждёт handleSave() и не
      // должен переключать экран, будто всё в порядке
      dbg('[PRODUCTION ERROR] save failed', e?.message)
      setSyncStatus('✗ Ошибка сохранения: ' + (e?.message ?? '?'))
      window.alert('Не удалось сохранить урок: ' + (e?.message ?? 'неизвестная ошибка') +
        '\n\nПравки остались только у вас в браузере — попробуйте сохранить ещё раз.')
      throw e
    } finally {
      setIsSaving(false)
    }
  }

  // Переход в canvas («Граф») — сохраняем перед переключением, как по кнопке
  // «Сохранить»: иначе canvas открыл бы прошлую версию урока с сервера, а
  // правки, сделанные в списке, остались бы только здесь. Если сохранение
  // не удалось — handleSave уже показал алерт, здесь просто не переключаем
  // экран (иначе admin решил бы, что урок сохранён и ушёл дальше)
  async function switchToCanvas() {
    try {
      await handleSave()
    } catch {
      return
    }
    onOpenCanvas(lessonId)
  }

  function clearAll() {
    if (!window.confirm('Удалить ВСЕ ноды урока? Это нельзя отменить.')) return
    handleNodesChange([])
  }

  function scrollToTop() {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="productionPage">
      <div className="productionPageHeader">
        <BackButton onClick={onBack} />
        <input
          className="productionPageTitle"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Название урока"
        />
        <button
          className="pageDangerBtn"
          onClick={clearAll}
          disabled={isSaving || loading}
          title="Удалить все ноды урока"
        >Очистить</button>
        <button
          className="pageTabBtn"
          onClick={scrollToTop}
          disabled={isSaving || loading}
          title="Прокрутить список к первой ноде"
        >В начало</button>
        {/* Тройка всегда в этом порядке: Сохранить → Граф → Продакшен.
            «Продакшен» — текущая страница (подсвечена), клик просто сохраняет */}
        <button className="productionPageSave" onClick={handleSave} disabled={isSaving || loading}>
          {isSaving ? 'Сохраняю…' : 'Сохранить'}
        </button>
        <button className="pageTabBtn" onClick={switchToCanvas} disabled={isSaving || loading}>
          Граф
        </button>
        <button className="pageTabBtn pageTabBtnActive" onClick={handleSave} disabled={isSaving || loading}>
          Продакшен
        </button>
      </div>

      {syncStatus && <div className="productionSyncStatus">{syncStatus}</div>}

      {!loading && (
        <ProductionList
          nodes={nodes}
          onNodesChange={handleNodesChange}
          lessonFiles={files}
          onPickLessonFile={pickFile}
          moduleLessons={linkableLessons}
          scrollRef={scrollRef}
        />
      )}
    </div>
  )
}
