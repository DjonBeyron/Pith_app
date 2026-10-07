import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

// Source-text тесты (как replyWiring.test.js): админская кнопка «собрать
// верный ответ» подключена в КАЖДОЙ панели ответа и нигде не торчит обычному
// пользователю. Семь панелей — семь мест, где легко забыть одно.
const PANELS = {
  'choose-word/ChooseWordPanel.jsx':         "import { pickCorrectOption } from './solveCorrect.js'",
  'photo-choice/PhotoChoicePanel.jsx':       "import { correctPhotoIndex } from './solveCorrect.js'",
  'phrase-assembly/PhraseAssemblyPanel.jsx': "import { correctPlacement } from './solveCorrect.js'",
  'fill-blanks/FillBlanksPanel.jsx':         "import { correctPicks } from './solveCorrect.js'",
  'type-word/TypeWordPanel.jsx':             "import { typeWholeWord } from './solveCorrect.js'",
  'table-manual/TableManualPanel.jsx':       "import { solveManualAssembly } from './solveCorrect.js'",
  'table-dictator/TableDictatorPanel.jsx':   "import { useDictatorSolve } from './useDictatorSolve.js'",
}

describe('SolveCorrectButton — только админу', () => {
  const btn = read('./SolveCorrectButton.jsx')
  it('читает эффективный isAdmin из AdminContext и без него не рендерит ничего', () => {
    expect(btn).toContain("import { useAdmin } from '../../../app/AdminContext.jsx'")
    expect(btn).toContain('const { isAdmin } = useAdmin()')
    expect(btn).toContain('if (!isAdmin) return null')
  })
  it('подписана для скринридера и не ломает тап по панели (stopPropagation)', () => {
    expect(btn).toContain('Собрать верный ответ (админ)')
    expect(btn).toContain('aria-label={label}')
    expect(btn).toContain('e.stopPropagation(); onSolve?.(e.currentTarget.getBoundingClientRect())')
  })
})

describe('кнопка подключена в каждой панели ответа', () => {
  for (const [file, solveImport] of Object.entries(PANELS)) {
    it(file, () => {
      const src = read(`../panels/${file}`)
      expect(src).toContain("import SolveCorrectButton from '../../admin/SolveCorrectButton.jsx'")
      expect(src).toContain('<SolveCorrectButton')
      expect(src).toContain(solveImport)
    })
  }

  it('панели, где ответ ставится целиком, зовут проверку после коммита (useSolveAfterRender)', () => {
    for (const file of ['phrase-assembly/PhraseAssemblyPanel.jsx', 'fill-blanks/FillBlanksPanel.jsx',
      'type-word/TypeWordPanel.jsx', 'table-manual/TableManualPanel.jsx']) {
      const src = read(`../panels/${file}`)
      expect(src, file).toContain("import { useSolveAfterRender } from '../useSolveAfterRender.js'")
      expect(src, file).toContain('armSolve()')
    }
  })

  it('«выбери слово»: тап по варианту и авто-ответ идут одним путём (tapOption)', () => {
    const src = read('../panels/choose-word/ChooseWordPanel.jsx')
    expect(src).toContain('function tapOption(opt, rect)')
    expect(src).toContain('onClick={e => tapOption(opt, e.currentTarget.getBoundingClientRect())}')
    expect(src).toContain('if (opt && !isAnswered) tapOption(opt, rect)')
  })

  it('диктант: кнопка уходит в TableDictatorView детьми и рендерится внутри .tdPanel', () => {
    const view = read('../panels/table-dictator/TableDictatorView.jsx')
    expect(view).toContain('children = null')
    expect(view.indexOf('{children}')).toBeGreaterThan(view.indexOf("className={`tdPanel"))
    expect(view.indexOf('{children}')).toBeLessThan(view.indexOf('<div className="tdPanelInner">'))
  })

  it('стили подключены', () => {
    expect(read('../../../index.css')).toContain("@import './styles/player/admin-solve.css';")
    expect(read('../../../styles/player/admin-solve.css')).toContain('.solveCorrectBtn {')
  })
})
