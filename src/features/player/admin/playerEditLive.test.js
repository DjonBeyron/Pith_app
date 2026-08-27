import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('правка ноды из плеера идёт без задержки', () => {
  const panel = read('./PlayerAdminPanel.jsx')

  it('поля читают черновик, а не ноду из ленты (та приходит раз в 500 мс)', () => {
    expect(panel).toContain('const [draft, setDraft] = useState(null)')
    expect(panel).toContain("draft?.id && draft.id === node?.id ? draft.node : node")
    expect(panel).toContain('node={shownNode}')
  })

  it('правка всё так же сразу уходит на холст', () => {
    expect(panel).toContain('onUpdate(shownNode.id, patch)')
  })

  it('черновик привязан к id — при смене сообщения сам перестаёт подходить', () => {
    // отдельный сброс через эффект не нужен и запрещён правилом React Compiler
    expect(panel).not.toContain('useEffect(() => { setDraft(null) }')
  })
})

describe('правка текста не стирает сообщение в чате', () => {
  const typing = read('../PlayerTypingText.jsx')

  it('первый показ печатается по буквам, как раньше', () => {
    expect(typing).toContain('if (!startedRef.current) {')
    expect(typing).toContain('setCount(0)')
  })

  it('правка уже показанного текста выводится целиком', () => {
    expect(typing).toContain('charRef.current = text.length')
    expect(typing).toContain('setCount(text.length)')
  })

  it('в управляемом режиме (реальные тайминги аудио) правка тоже не ждёт revealedCharIdx', () => {
    // до фикса: displayCount = revealedCharIdx+1 — на паузе/до проигрывания
    // (-1) правка оставалась невидимой именно у уже транскрибированных аудио
    expect(typing).toContain('const [edited, setEdited] = useState(false)')
    expect(typing).toContain('setEdited(true)')
    expect(typing).toContain('const displayCount = edited ? text.length')
  })

  it('«правка» — это только изменившийся text, а не isControlled/speed', () => {
    // Регресс: isControlled переключается САМ по себе (транскрипция аудио
    // доезжает асинхронно уже после первого рендера) — без сравнения с
    // prevTextRef это принималось за правку и печать голосовых навсегда
    // становилась мгновенной (целиком), даже без единого live-редактирования
    expect(typing).toContain('const prevTextRef = useRef(text)')
    expect(typing).toContain('if (prevTextRef.current === text) return')
  })
})

describe('правка текста не тормозит из-за пересчёта связей канваса', () => {
  const connections = read('../../canvas/CanvasConnections.jsx')

  it('memo сравнивает только геометрию нод, а не весь typeData', () => {
    // Патч текста создаёт новый объект node на каждую букву — без этого
    // сравнения обход препятствий гонялся заново по всему графу на каждый
    // символ (лаг/подвисание при печати, особенно в плотной части графа)
    expect(connections).toContain('function sameGeometry(a, b)')
    expect(connections).toContain('export default memo(CanvasConnections, areEqual)')
  })
})
