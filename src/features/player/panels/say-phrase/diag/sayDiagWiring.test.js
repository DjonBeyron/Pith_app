import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToString } from 'react-dom/server'
import { createElement } from 'react'
import { fileURLToPath } from 'node:url'
import SayAdminDiag from './SayAdminDiag.jsx'

// Проводка админской диагностики «Сказать фразу» (читаем исходники): только админам, ничего не весит в закрытом состоянии, поверх раскладки, ≤250 строк
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const code = t => t.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
const strip = c => c.replace(/\/\*[\s\S]*?\*\//g, '')
const panel = read('../SayPhrasePanel.jsx')
const css = read('../../../../../styles/player/panels/say-phrase-diag.css')
const lines = t => t.split('\n').length

describe('SayAdminDiag: только админам и ничего не весит закрытой', () => {
  it('обычному пользователю (isAdmin = false по умолчанию) не рендерится вовсе', () => {
    expect(renderToString(createElement(SayAdminDiag, { phrase: 'Hello' }))).toBe('')
  })
  it('в панели одна строка импорта и одна строка монтирования; компонент решает по тому же признаку isAdmin, что и плашка', () => {
    expect(panel.split('\n').filter(l => l.includes('SayAdminDiag'))).toHaveLength(2)
    expect(panel).toContain("import SayAdminDiag from './diag/SayAdminDiag.jsx'")
    expect(panel).toContain('<SayAdminDiag phrase={data.phrase} />')
    const comp = read('./SayAdminDiag.jsx')
    expect(comp).toContain('useAdmin()'); expect(comp).toContain('return isAdmin ?')
  })
  it('закрытое окно: эффект сбора выходит сразу (нет setInterval / подписок); слушатели тапа мимо и Esc — только пока открыто; интервал снимается', () => {
    const hook = code(read('./useSayDiag.js'))
    expect(hook).toMatch(/if \(!open\) return undefined\s+let alive/)
    expect(hook.match(/setInterval\(/g)).toHaveLength(1)
    expect(hook).toContain('clearInterval(id)')
    const comp = code(read('./SayAdminDiag.jsx'))
    expect(comp).toMatch(/if \(!open\) return undefined\s+const onDown/)
    expect(comp).toContain("removeEventListener('pointerdown'")
    expect(comp).toContain('setOpen(o => !o)') // повторное нажатие закрывает
    expect(comp).toContain("e.key === 'Escape'")
  })
  it('источник данных не запускает ничего лишнего: нет acquire / getUserMedia / start', () => {
    const shared = ['sayDiagContext.js', 'sayDiagRows.js', 'sayDiagExplain.js', 'sayDiagEnv.js']
    for (const f of shared) expect(code(read(`../../../../../shared/lib/speech/${f}`)), f).not.toMatch(/\.acquire\(|getUserMedia|\.start\(/)
    // компоненты в features/player не знают админских подписей движка (их проверяет sayPhraseVoskWiring.test.js)
    for (const f of ['./useSayDiag.js', './SayDiagPanel.jsx', './SayAdminDiag.jsx']) expect(code(read(f)), f).not.toMatch(/\.acquire\(|getUserMedia|\.start\(|pickLabel|SAY_ENGINE_LABEL|SpeechSayEngine/)
  })
  it('«Загрузить модель сейчас» ведёт в voskBackground.forceBackground; «Скопировать отчёт» — в diagReport', () => {
    const p = read('./SayDiagPanel.jsx')
    expect(p).toContain('forceBackground()'); expect(p).toContain('diagReport(')
    expect(p).toContain('Скопировать отчёт'); expect(p).toContain('Загрузить модель сейчас')
  })
})

describe('вёрстка: поверх, не двигает модуль, влезает в 320 px', () => {
  it('кнопка и окно абсолютные; окно прокручивается; ширина = экран минус края; нет filter / blur / box-shadow; CSS ≤ 250 строк', () => {
    const c = strip(css)
    expect(c).toMatch(/\.sayDiagBtn \{[^}]*position: absolute[^}]*width: 26px[^}]*height: 26px/)
    expect(c).toMatch(/\.sayDiagPop \{[^}]*position: absolute[^}]*left: 8px[^}]*right: 8px[^}]*max-width: 380px[^}]*overflow-y: auto/)
    expect(c).toMatch(/\.sayDiag \{ display: contents; \}/) // обёртка не создаёт коробки и не меняет раскладку
    expect(c).not.toMatch(/filter\s*:|blur\(|box-shadow\s*:|backdrop-filter/)
    expect(lines(css)).toBeLessThanOrEqual(250)
    expect(read('../../../../../index.css')).toContain("@import './styles/player/panels/say-phrase-diag.css';")
  })
  it('файлы диагностики ≤ 250 строк', () => {
    for (const f of ['./useSayDiag.js', './SayDiagPanel.jsx', './SayAdminDiag.jsx']) expect(lines(read(f)), f).toBeLessThanOrEqual(250)
  })
})
