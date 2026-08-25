import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { pickPanelNodes } from '../../usePlayerPanelNodes.js'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

const tableNode = (mode) => ({
  id: 't1', seq: 1, type: 'table',
  typeData: { table: { mode, table: { columns: [], rows: [], cells: [], rowCount: 0 } } },
})

describe('таблица в режиме «Показ»', () => {
  it('нижнюю панель не открывает — она приходит сообщением в чат', () => {
    expect(pickPanelNodes([tableNode('demo')]).table).toBe(null)
  })

  it('отвечающие режимы панель открывают как раньше', () => {
    expect(pickPanelNodes([tableNode('dictator')]).table?.id).toBe('t1')
    expect(pickPanelNodes([tableNode('manual')]).table?.id).toBe('t1')
  })

  it('режим не указан — это старая нода, значит диктор', () => {
    const old = { id: 't2', seq: 1, type: 'table', typeData: { table: {} } }
    expect(pickPanelNodes([old]).table?.id).toBe('t2')
  })

  it('в ленте показ рисует пузырь во всю ширину, остальные режимы — ничего', () => {
    const router = read('./TableModule.jsx')
    expect(router).toContain("if (mode === 'demo') return <TableDemoModule {...props} />")
    expect(router).toContain('if (props.tableSent) return <TableChatBubble')
    const demo = read('./TableDemoModule.jsx')
    expect(demo).toContain('<TableChatBubble')
    const bubble = read('./TableChatBubble.jsx')
    expect(bubble).toContain('playerMsgBubble--table')
    expect(bubble).toContain('<TableGrid')
    const css = read('../../../../styles/player/modules/table.css')
    const block = css.slice(css.indexOf('.playerMsgBubble--table'))
    expect(block).toContain('width: 100%')
  })
})

describe('таблица уходит в чат после ответа (галочка у авто/ручного)', () => {
  it('панель сообщает об этом с небольшой задержкой', () => {
    for (const f of ['../../panels/table-dictator/TableDictatorPanel.jsx',
      '../../panels/table-manual/TableManualPanel.jsx']) {
      expect(read(f)).toContain('setTimeout(onSendToChat, 600)')
    }
  })

  it('колбэк даётся панели только когда галочка включена', () => {
    const panels = read('../../PlayerPanels.jsx')
    expect(panels).toContain('tableNode.typeData?.table?.sendToChat ? () => onTableToChat?.(tableNode.id) : undefined')
  })

  it('отправленная таблица переживает шаг назад — состояние сбрасывается', () => {
    expect(read('../../usePlayerAnswers.js')).toContain('setTableSent(drop)')
  })
})

describe('проверка фразы ждёт досборку', () => {
  // Баг из лога: клип слова (1с) короче лид-ина последнего слова (1.32с),
  // слово падало в бокс уже ПОСЛЕ проверки — верный ответ считался ошибкой
  it('проверка сдвигается до конца досборки, закрытие — следом', () => {
    const post = read('../../panels/table-dictator/dictatorPostAudio.js')
    expect(post).toContain('const checkTime  = Math.max(checkAt, pendingEnd + 0.05)')
    expect(post).toContain('const d = Math.max(0, (checkTime - tEnd + hold) * 1000)')
  })

  it('уже собранные ячейки досборку не удлиняют', () => {
    const post = read('../../panels/table-dictator/dictatorPostAudio.js')
    // ключ с номером выстрела: повтор клипа — отдельная сборка (см. layerShots)
    expect(post).toContain('addedCellsRef.current.has(`cell-${l.cellId}#${shotIdx}`)')
  })
})

describe('плейхед совпадает с линейкой и клипами', () => {
  // Полоса дорожек тянется по свободному месту, поэтому её реальная ширина
  // больше stripPx. Линия рисовалась по stripPx — и убегала от курсора
  it('позиция линии считается по измеренной полосе, а не по stripPx', () => {
    const editor = read('../../../canvas/table-editor/TableTimelineEditor.jsx')
    expect(editor).toContain('const cursorLeftPx = strip.width')
    expect(editor).toContain('strip.left + (currentTime / timelineDur) * strip.width')
    expect(editor).toContain('new ResizeObserver(measure)')
  })

  it('волна тянется в процентах — иначе разъедется с линейкой', () => {
    const editor = read('../../../canvas/table-editor/TableTimelineEditor.jsx')
    expect(editor).toContain('const wavePct = localDuration')
    expect(editor).toContain('width: `${wavePct}%`')
  })

  it('у каждой дорожки есть правая колонка — полосы одной ширины', () => {
    const track = read('../../../canvas/table-editor/TableTimelineTrack.jsx')
    const tail = track.slice(track.indexOf('tlRemoveLayer'))
    expect(tail).toContain('tlRemovePlaceholder')
    expect(track).not.toContain('{!layer.isDefault && (')
  })

  it('вход в таймлайн называется «Таймлайн» в любом случае', () => {
    const modal = read('../../../canvas/table-editor/TableEditorModal.jsx')
    expect(modal).toContain('♪ Таймлайн')
    expect(modal).not.toContain('Монтаж')
  })
})

describe('удаление аудио из таблицы', () => {
  it('кнопка есть и в таймлайне, и в самой ноде', () => {
    // Сама функция — в аудио-источнике таймлайна (useTimelineAudioSource.js),
    // кнопка с этим классом — в разметке редактора (TableTimelineEditor.jsx)
    const audioSrc = read('../../../canvas/table-editor/useTimelineAudioSource.js')
    expect(audioSrc).toContain('function removeAudio()')
    const editor = read('../../../canvas/table-editor/TableTimelineEditor.jsx')
    expect(editor).toContain('className="tlRemoveAudio"')
    const node = read('../../../canvas/NodeTablePicker.jsx')
    expect(node).toContain('onDataChange({ file_id: null, waveformData: null, duration: null })')
  })

  it('разметка таймлайна при этом не трогается', () => {
    const audioSrc = read('../../../canvas/table-editor/useTimelineAudioSource.js')
    const fn = audioSrc.slice(audioSrc.indexOf('function removeAudio()'), audioSrc.indexOf('function handleSeek('))
    expect(fn).not.toContain('setTimeline')
    expect(fn).not.toContain('initClips')
  })
})

describe('таймлайн без озвучки', () => {
  it('длина композиции задаётся автором и не зависит от аудио', () => {
    const editor = read('../../../canvas/table-editor/TableTimelineEditor.jsx')
    expect(editor).toContain('const [localLen, setLocalLen]')
    expect(editor).toContain('const timelineDur = Math.max(1, localLen)')
    expect(editor).toContain('className="tlLenField"')
  })

  it('без аудио время крутят часы с тем же интерфейсом', () => {
    const clock = read('../../../../shared/lib/silentClock.js')
    expect(clock).toContain('get paused()')
    expect(clock).toContain("Object.defineProperty(clock, 'currentTime'")
    // Автостарт (часы вместо звука) — в useTableDictatorAutostart.js
    const autostart = read('../../panels/table-dictator/useTableDictatorAutostart.js')
    expect(autostart).toContain('createSilentClock(silentDur')
    expect(autostart).toContain('audioRef.current = clock')
  })

  it('локальный файл (урок не синхронизирован) тоже играет', () => {
    const panel = read('../../panels/table-dictator/TableDictatorPanel.jsx')
    expect(panel).toContain('URL.createObjectURL(file.localFile)')
    expect(panel).toContain('const blobUrl = objectUrl ?? file?.blobUrl ?? file?.r2Url')
  })

  it('длительность прогона есть всегда: длина композиции → аудио → конец клипов', () => {
    const autostart = read('../../panels/table-dictator/useTableDictatorAutostart.js')
    expect(autostart).toContain('timelineEndSec(timeline?.layers)')
  })

  it('анимация идёт в любом случае: нет аудио, отказ автозапуска, ошибка, тишина', () => {
    const autostart = read('../../panels/table-dictator/useTableDictatorAutostart.js')
    // отказ автозапуска
    const rejected = autostart.slice(autostart.indexOf('logAudioPlayRejected(e, audioSrc)'))
    expect(rejected.slice(0, 260)).toContain('runWithClock()')
    // аудио молча не стартовало
    const silence = autostart.slice(autostart.indexOf('if (hasPlayedRef.current) return'))
    expect(silence.slice(0, 300)).toContain('runWithClock()')
    // и вовсе без озвучки
    expect(autostart).toContain('const silentMode  = !audioSrc && canRunClock')
    // крутить есть что только со смонтированным таймлайном
    expect(autostart).toContain("const canRunClock = silentDur > 0 && !!timeline?.layers?.length")
    // ошибка загрузки/декодирования файла — обработчик остался в самой панели
    const panel = read('../../panels/table-dictator/TableDictatorPanel.jsx')
    const onError = panel.slice(panel.indexOf('logAudioError('))
    expect(onError.slice(0, 300)).toContain('runWithClock()')
  })

  it('без озвучки подпись в боксе не зовёт слушать диктора', () => {
    const view = read('../../panels/table-dictator/TableDictatorView.jsx')
    expect(view).toContain("{audioSrc ? 'Слушай диктора…' : 'Смотри на таблицу…'}")
  })

  it('плейхед можно взять за широкую зону и за флажок', () => {
    const css = read('../../../../styles/canvas/table-editor-timeline.css')
    expect(css).toContain('.tlCursorGrab')
    expect(css).toContain('.tlCursorFlag')
    const editor = read('../../../canvas/table-editor/TableTimelineEditor.jsx')
    expect(editor).toContain('onMouseDown={startCursorDrag}')
  })

  it('в редакторе таблицы текст не выделяется, поля ввода — исключение', () => {
    const css = read('../../../../styles/canvas/table-editor-modal.css')
    const block = css.slice(css.indexOf('.tableEditorModal {'))
    expect(block).toContain('user-select: none')
    expect(css.slice(css.indexOf('.tableEditorModal input'))).toContain('user-select: text')
  })

  it('предпросмотр считает состояние теми же функциями, что и плеер', () => {
    const prev = read('../../../canvas/table-editor/TableTimelinePreview.jsx')
    expect(prev).toContain('computeRevealedCellIds')
    expect(prev).toContain('computeHighlightedCellIds')
  })
})

describe('переход у ноды показа — как у обычного сообщения', () => {
  const code = read('../../../canvas/NodeTablePicker.jsx')

  it('с озвучкой — «доиграло», без неё — таймер', () => {
    expect(code).toContain("if: 'played', then: keepThen")
    expect(code).toContain("if: 'timer', ms: 3000, then: keepThen")
  })

  it('пара верно/неверно в режиме показа не навязывается', () => {
    expect(code).toContain('if (isDemo) return')
  })

  it('файл приложили или убрали позже — переход подстраивается', () => {
    expect(code).toContain("const want = tData.file_id ? 'played' : 'timer'")
  })

  it('без озвучки нода отпускает цепочку сама', () => {
    const demo = read('./TableDemoModule.jsx')
    expect(demo).toContain('if (src || adminPreview || pending) return')
    expect(demo).toContain('onDone?.()')
  })
})
