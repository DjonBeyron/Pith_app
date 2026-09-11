import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

// Салют — праздник НАГРАДЫ. Снята галочка «Получить награду» — XP за ноду не
// начисляется (lessonXp.js), значит и салютовать нечему.
describe('салют в «выбери слово» идёт по галочке награды', () => {
  const wc = read('./modules/word-choice/WordChoiceModule.jsx')

  it('правило про галочку берётся общее, а не своё', () => {
    // nodeReward.js — одно правило на редактор холста и на плеер
    expect(wc).toContain("import { isRewardOn } from '../../../../shared/lib/nodeReward.js'")
    expect(wc).toContain("const rewardOn = isRewardOn('word_choice', node?.typeData?.word_choice)")
  })

  it('без награды салюта нет даже на верном ответе', () => {
    expect(wc).toContain('{isCorrect && rewardOn && (')
    // И ранний выход учитывает это же: модуль без пузырей и без салюта пуст
    expect(wc).toContain('if (!pickText && !text && !(isCorrect && rewardOn)) return null')
  })
})

// Лог с iPhone 15:45:43 — вторая таблица (с собранной фразой) при переходе в
// чат моргала самой фразой. Геометрия при этом идеальна («расхождение 0,0»):
// дело не в перелёте, а в том, что клон получает из разметки CSS-анимацию слов
// (tdWordIn) и она стартует заново при вставке копии в документ.
describe('собранная фраза не моргает при переходе таблицы в чат', () => {
  const fly = read('./panels/flyPanelToChat.js')

  it('анимации разметки гаснут в клоне тем же кадром, что и вставка', () => {
    const start = fly.indexOf('document.body.appendChild(ghost)')
    const upTo  = fly.slice(start, fly.indexOf('slimDown(ghost)', start))
    expect(upTo).toContain('ghost.getAnimations({ subtree: true })')
    expect(upTo).toContain('a.cancel()')
  })

  it('панель по-прежнему доигрывают ДО снятия клона', () => {
    // Панель и клон должны совпасть кадр в кадр: панель доигрывается, клон
    // обнуляется — оба показывают конечный вид
    expect(fly.indexOf('panelEl.getAnimations({ subtree: true })'))
      .toBeLessThan(fly.indexOf('const ghost = panelEl.cloneNode(true)'))
    expect(fly).toContain('try { a.finish() } catch')
  })

  it('в логе видно, сколько анимаций сняли — по нему и проверяется', () => {
    expect(fly).toContain('снято анимаций разметки в клоне')
  })

  it('у слов фразы анимация действительно есть — иначе сторож бессмыслен', () => {
    const css = read('../../styles/player/panels/table-dictator.css')
    const rule = css.slice(css.indexOf('.tdAssemblyWord {'))
    expect(rule.slice(0, rule.indexOf('}'))).toContain('animation: tdWordIn')
    // А в чатовой версии её нет — там бокс статический
    expect(read('../../styles/player/modules/table.css')).toContain('.tdAssemblyBox.tdAssemblyBoxStatic .tdAssemblyWord')
  })
})
