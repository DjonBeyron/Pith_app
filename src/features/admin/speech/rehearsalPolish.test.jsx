import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import RehearsalPolishBlock from './RehearsalPolishBlock.jsx'
import { REHEARSAL_TEST_KEY, fixtureJson } from '../../rehearsal/rehearsalTestForm.js'
import { POLISH_ACTS } from '../../rehearsal/polish/polishActs.js'
import { addComment, makeComment, COMMENTS_KEY } from '../../rehearsal/polish/rehearsalComments.js'

vi.mock('../../../shared/lib/vosk/useVoskReady.js', () => ({ useVoskReady: () => ({ status: 'preparing', download() {}, retry() {} }) })) // фоновая загрузка Vosk не рендерится на сервере

// Админ → «Голос» → «Шлифовка репетиции»: карточка на каждый этап, число комментариев, экспорт, очистка, «Готовый шаблон»; блок стоит в самом верху вкладки
const memStore = (init = {}) => { const m = { ...init }; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v) }, removeItem: k => { delete m[k] }, m } }
const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
const lines = rel => read(rel).split('\n').length - 1
afterEach(() => vi.unstubAllGlobals())
const render = (store = memStore()) => { vi.stubGlobal('localStorage', store); return renderToStaticMarkup(createElement(RehearsalPolishBlock)) }
const comment = text => makeComment({ text, snap: { stage: { act: 'build' } }, settings: {}, t: 1000 })

describe('карточки этапов', () => {
  it('восемь карточек по порядку сценария: Заставка, Разминка, Читка, Сборка с конца, Без текста, Различи, Дубль и зеркало, Итог', () => {
    const out = render()
    expect(POLISH_ACTS.map(a => a.title)).toEqual(['Заставка', 'Разминка', 'Читка', 'Сборка с конца', 'Без текста', 'Различи', 'Дубль и зеркало', 'Итог'])
    const at = POLISH_ACTS.map(a => out.indexOf(`data-testid="rh-polish-${a.id}"`))
    expect(at.every(i => i > 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    for (const a of POLISH_ACTS) expect(out).toContain(`<strong>${a.title}</strong>`)
  })
  it('у каждой: «Запустить», «Экспорт комментариев», «Очистить», число комментариев', () => {
    const out = render()
    for (const a of POLISH_ACTS) for (const id of [`rh-polish-run-${a.id}`, `rh-polish-export-${a.id}`, `rh-polish-clear-${a.id}`, `rh-polish-count-${a.id}`]) expect(out).toContain(`data-testid="${id}"`)
    expect(out.match(/>Запустить</g)).toHaveLength(8); expect(out.match(/>Экспорт комментариев</g)).toHaveLength(8); expect(out.match(/>Очистить</g)).toHaveLength(9) // 8 карточек + «Очистить» у журналов прогона
  })
  it('«Готовый шаблон (все этапы)» внизу списка, с пометкой «собираем в конце»', () => {
    const out = render()
    expect(out).toContain('data-testid="rh-polish-template"'); expect(out).toContain('Готовый шаблон (все этапы)')
    expect(out.indexOf('rh-polish-template')).toBeGreaterThan(out.indexOf('rh-polish-summary'))
    expect(out).toContain('соберём в конце')
  })
})

describe('число комментариев и экспорт', () => {
  it('число читается из браузера по этапу; экспорт и «Очистить» доступны только когда есть что отдавать', () => {
    const s = memStore()
    addComment('build', comment('раз'), s); addComment('build', comment('два'), s)
    const out = render(s)
    expect(out).toMatch(/data-testid="rh-polish-count-build">комментариев: 2</); expect(out).toMatch(/data-testid="rh-polish-count-read">комментариев: 0</)
    expect(out).toMatch(/<button[^>]*data-testid="rh-polish-export-build"/); expect(out).not.toMatch(/<button[^>]*disabled=""[^>]*data-testid="rh-polish-export-build"/)
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*data-testid="rh-polish-export-read"/)
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*data-testid="rh-polish-clear-read"/)
    expect(Object.keys(s.m)).toContain(`${COMMENTS_KEY}:build`)
  })
  it('«Запустить» недоступна, пока модель Vosk не готова (кнопка запускает игру в том же тапе)', () => {
    expect(render()).toMatch(/<button[^>]*disabled=""[^>]*data-testid="rh-polish-run-build"/)
  })
})

describe('план: общая форма с «Тестом игры»', () => {
  it('по умолчанию фикстура «три куска»; фраза и перевод показаны; все этапы доступны', () => {
    const out = render()
    expect(out).toContain('Фраза: «I&#x27;m | trying | to learn» — Я пытаюсь научиться')
    expect(out).toMatch(/<option value="three" selected/)
    expect(out).not.toMatch(/Запустить<\/button>.{0,200}?такого этапа нет/)
  })
  it('правленый JSON и фикстура из «Теста игры» (одно слово) подхватываются; для этапов, которых в плане нет, — подсказка и недоступный запуск', () => {
    const out = render(memStore({ [REHEARSAL_TEST_KEY]: JSON.stringify({ mode: 'rehearsal', fixture: 'one', json: fixtureJson('one') }) }))
    expect(out).toContain('Фраза: «Remember» — Помнить'); expect(out).toMatch(/<option value="one" selected/)
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*data-testid="rh-polish-run-read"/); expect(out).toMatch(/<button[^>]*disabled=""[^>]*data-testid="rh-polish-run-build"/)
    expect(out).toContain('В этом плане такого этапа нет')
  })
  it('сломанный JSON плана: понятная ошибка, запуск недоступен', () => {
    const out = render(memStore({ [REHEARSAL_TEST_KEY]: JSON.stringify({ mode: 'rehearsal', fixture: 'three', json: '{не json' }) }))
    expect(out).toContain('data-testid="rh-polish-error"'); expect(out).toContain('Не JSON')
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*data-testid="rh-polish-run-intro"/); expect(out).toMatch(/<button[^>]*disabled=""[^>]*data-testid="rh-polish-template"/)
  })
})

describe('проводка', () => {
  it('блок стоит в самом верху вкладки «Голос» — до проб и «Теста игры»', () => {
    const tab = read('./AdminSpeechTab.jsx')
    expect(tab).toContain("import RehearsalPolishBlock from './RehearsalPolishBlock.jsx'")
    const i = tab.indexOf('<RehearsalPolishBlock />')
    expect(i).toBeGreaterThan(0)
    for (const other of ['<SpeechCapsBlock', '<SoundDiagBlock', '<GameMicBlock', '<GameTestBlock', '<SpeechSayBlock']) expect(i, other).toBeLessThan(tab.indexOf(other))
  })
  it('запуск — жест: нода обновляется синхронно (flushSync), start() модуля зовётся из того же тапа; экспорт — тот же путь, что «Скачать отладку» (saveDebugFile), файл собирается до await', () => {
    const src = read('./RehearsalPolishBlock.jsx')
    expect(src).toContain('flushSync(() => setOnly(id)); startRef.current?.()')
    expect(src).toContain("import { saveDebugFile, SAVE_HOW } from '../../player/modules/rotate-phone/wordLaneDebugExport.js'")
    expect(src).toContain('const how = await save(commentsFile(id, listComments(id)')
    expect(src.match(/await /g)).toHaveLength(2) // два await — оба сам save (комментарии и журналы прогона): файл собирается синхронно, в тапе
    expect(src).toContain('const how = await save(audio.runsFile())')
    expect(src).toContain('<RotatePhoneModule key={voice.rev} node={node} bare forceDebug startRef={startRef}')
    expect(src).toContain('const launch = id => { audio.beforeLaunch(id); flushSync(() => setOnly(id)); startRef.current?.() }') // режим звука применяется до start() игры, в том же тапе
  })
  it('«Тест игры» слушает ту же форму (фикстуру из «Шлифовки») и сохраняет её через общий saveRehearsalForm', () => {
    const t = read('./GameTestBlock.jsx')
    expect(t).toContain('useEffect(() => subscribeRehearsalForm(setRform), [])')
    expect(t).toContain('setRform(next); saveRehearsalForm(next)')
  })
  it('файлы не длиннее 250 строк; карточки в админском стиле (admin-speech.css)', () => {
    expect(lines('./RehearsalPolishBlock.jsx')).toBeLessThanOrEqual(250)
    expect(read('../../../styles/admin-speech.css')).toContain('.rhpCard')
  })
})
