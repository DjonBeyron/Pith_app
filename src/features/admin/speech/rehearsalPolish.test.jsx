import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import RehearsalPolishBlock from './RehearsalPolishBlock.jsx'
import { REHEARSAL_TEST_KEY, fixtureJson, withSeed, jsonSeed, parsePlanJson } from '../../rehearsal/rehearsalTestForm.js'
import { POLISH_ACTS, POLISH_CARDS } from '../../rehearsal/polish/polishActs.js'
import { OPEN_KEY, readOpen } from './usePolishOpen.js'
import { addComment, makeComment, COMMENTS_KEY } from '../../rehearsal/polish/rehearsalComments.js'

vi.mock('../../../shared/lib/vosk/useVoskReady.js', () => ({ useVoskReady: () => ({ status: 'preparing', download() {}, retry() {} }) })) // фоновая загрузка Vosk не рендерится на сервере

// Админ → «Голос» → «Шлифовка репетиции»: пронумерованные карточки («1. Полная игра» первой), по умолчанию свёрнуты; число комментариев, экспорт, очистка и «Настройки» — в разворотах; блок стоит в самом верху вкладки
const memStore = (init = {}) => { const m = { ...init }; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v) }, removeItem: k => { delete m[k] }, m } }
const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
const lines = rel => read(rel).split('\n').length - 1
afterEach(() => vi.unstubAllGlobals())
const render = (store = memStore()) => { vi.stubGlobal('localStorage', store); return renderToStaticMarkup(createElement(RehearsalPolishBlock)) }
const ALL_IDS = ['settings', ...POLISH_CARDS.map(a => a.id)]
const opened = (ids = ALL_IDS, init = {}) => memStore({ [OPEN_KEY]: JSON.stringify(ids), ...init }) // всё (или перечисленное) развёрнуто — как после тапов владельца
const comment = text => makeComment({ text, snap: { stage: { act: 'build' } }, settings: {}, t: 1000 })

describe('карточки этапов', () => {
  it('девять карточек с номерами: «1. Полная игра» первой, затем Заставка, Разминка, Читка, Сборка с конца, Без текста, Различи, Дубль и зеркало, Итог', () => {
    const out = render()
    expect(POLISH_ACTS.map(a => a.title)).toEqual(['Заставка', 'Разминка', 'Читка', 'Сборка с конца', 'Без текста', 'Различи', 'Дубль и зеркало', 'Итог'])
    expect(POLISH_CARDS.map(a => a.title)).toEqual(['Полная игра', ...POLISH_ACTS.map(a => a.title)])
    const at = POLISH_CARDS.map(a => out.indexOf(`data-testid="rh-polish-${a.id}"`))
    expect(at.every(i => i > 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    POLISH_CARDS.forEach((a, i) => expect(out).toContain(`<strong class="rhpName">${i + 1}. ${a.title}</strong>`))
    expect(out).toContain('>1. Полная игра<'); expect(out).toContain('>2. Заставка<'); expect(out).toContain('>9. Итог<')
  })
  it('по умолчанию все свёрнуты: в карточке только название и «Запустить» — ни подсказки, ни реплик, ни счётчика, ни экспорта', () => {
    const out = render()
    for (const a of POLISH_CARDS) {
      expect(out).toContain(`data-testid="rh-polish-toggle-${a.id}"`); expect(out).toContain(`data-testid="rh-polish-run-${a.id}"`)
      for (const id of [`rh-polish-body-${a.id}`, `rh-polish-lines-${a.id}`, `rh-polish-count-${a.id}`, `rh-polish-export-${a.id}`, `rh-polish-clear-${a.id}`]) expect(out).not.toContain(`data-testid="${id}"`)
    }
    expect(out.match(/aria-expanded="false"/g)).toHaveLength(POLISH_CARDS.length + 1) // девять карточек и «Настройки»
    expect(out.match(/>Запустить</g)).toHaveLength(POLISH_CARDS.length)
    for (const a of POLISH_CARDS) expect(out).not.toContain(a.hint)
    expect(out).not.toContain('Экспорт комментариев'); expect(out).not.toContain('Готовый шаблон')
  })
  it('развёрнутая: подсказка, реплики Пита, число комментариев, «Экспорт комментариев», «Очистить»; можно развернуть несколько сразу', () => {
    const out = render(opened(['intro', 'build']))
    for (const id of ['intro', 'build']) for (const t of [`rh-polish-body-${id}`, `rh-polish-lines-${id}`, `rh-polish-export-${id}`, `rh-polish-clear-${id}`, `rh-polish-count-${id}`]) expect(out).toContain(`data-testid="${t}"`)
    expect(out).toContain(POLISH_ACTS.find(a => a.id === 'build').hint); expect(out).toMatch(/aria-expanded="true"[^>]*data-testid="rh-polish-toggle-build"/)
    expect(out).not.toContain('data-testid="rh-polish-body-read"')
    expect(out.match(/>Экспорт комментариев</g)).toHaveLength(2); expect(out.match(/aria-expanded="true"/g)).toHaveLength(2)
  })
  it('«Полная игра» вместо «Готового шаблона»: первая, запускает всю репетицию; в развороте подсказка и счётчик реплик, без своих комментариев и экспорта', () => {
    const out = render(opened(['all']))
    expect(out).not.toContain('data-testid="rh-polish-template"'); expect(out).not.toContain('Готовый шаблон')
    expect(out.indexOf('data-testid="rh-polish-all"')).toBeLessThan(out.indexOf('data-testid="rh-polish-intro"'))
    expect(out).toContain('Вся репетиция подряд'); expect(out).toContain('data-testid="rh-polish-lines-count-all"'); expect(out).not.toContain('rhpLineList') // compact: без списка
    expect(out).not.toContain('data-testid="rh-polish-export-all"')
    expect(read('./RehearsalPolishBlock.jsx')).toContain('launch(a.id === FULL_ID ? null : a.id)')
  })
  it('развёрнутые карточки и «Настройки» запоминаются в браузере (pithy_rh_polish_open_v1): блок читает их при показе', () => {
    const s = memStore({ [OPEN_KEY]: JSON.stringify(['read', 'settings', 5]) })
    expect(readOpen(s)).toEqual(['read', 'settings']); expect(readOpen(memStore())).toEqual([]); expect(readOpen(memStore({ [OPEN_KEY]: '{не json' }))).toEqual([]); expect(readOpen(null)).toEqual([])
    const out = render(opened(['build', 'read'], { ...s.m }))
    expect(out).toContain('data-testid="rh-polish-body-read"'); expect(out).toContain('data-testid="rh-polish-settings-body"'); expect(out).not.toContain('data-testid="rh-polish-body-build"')
    expect(read('./usePolishOpen.js')).toContain("'pithy_rh_polish_open_v1'")
  })
})

describe('раздел «Настройки»', () => {
  it('свёрнут по умолчанию: заголовок и одна строка сводки (режим звука, озвучено N из M, фикстура); внутри нет ни режима звука, ни озвучки, ни семени', () => {
    const out = render()
    expect(out).toContain('data-testid="rh-polish-settings"'); expect(out).not.toContain('data-testid="rh-polish-settings-body"')
    expect(out).toMatch(/data-testid="rh-polish-settings-summary">звук B · реплики: загружаю… · /)
    for (const id of ['rh-polish-audio', 'rh-polish-voice', 'rh-polish-fixture', 'rh-polish-seed', 'rh-polish-plan']) expect(out).not.toContain(`data-testid="${id}"`)
  })
  it('развёрнут: режим звука, озвучка («Озвучить реплики» в один тап), фикстура, семя и «Фраза» — всё на месте и до списка карточек', () => {
    const out = render(opened(['settings']))
    for (const id of ['rh-polish-audio', 'rh-polish-voice', 'rh-polish-voice-pit', 'rh-polish-fixture', 'rh-polish-seed', 'rh-polish-plan', 'rh-polish-run-modes', 'rh-polish-runs-export']) expect(out).toContain(`data-testid="${id}"`)
    expect(out.indexOf('rh-polish-settings-body')).toBeLessThan(out.indexOf('data-testid="rh-polish-list"'))
  })
})

describe('число комментариев и экспорт', () => {
  it('число читается из браузера по этапу; экспорт и «Очистить» доступны только когда есть что отдавать', () => {
    const s = memStore()
    addComment('build', comment('раз'), s); addComment('build', comment('два'), s)
    const out = render(opened(['build', 'read'], { ...s.m }))
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
    const out = render(opened())
    expect(out).toContain('Фраза: «I&#x27;m | trying | to learn» — Я пытаюсь научиться')
    expect(out).toMatch(/<option value="three" selected/)
    expect(out).not.toContain('такого этапа нет')
  })
  it('правленый JSON и фикстура из «Теста игры» (одно слово) подхватываются; для этапов, которых в плане нет, — подсказка и недоступный запуск', () => {
    const out = render(opened(ALL_IDS, { [REHEARSAL_TEST_KEY]: JSON.stringify({ mode: 'rehearsal', fixture: 'one', json: fixtureJson('one') }) }))
    expect(out).toContain('Фраза: «Remember» — Помнить'); expect(out).toMatch(/<option value="one" selected/)
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*data-testid="rh-polish-run-read"/); expect(out).toMatch(/<button[^>]*disabled=""[^>]*data-testid="rh-polish-run-build"/)
    expect(out).toContain('В этом плане такого этапа нет')
    expect(out.match(/data-off="1"/g)).toHaveLength(2) // читка и сборка; «Полная игра» и остальные доступны
  })
  it('недоступный этап в свёрнутом виде: «Запустить» выключена, название приглушено (data-off), пояснение только в развороте', () => {
    const out = render(memStore({ [REHEARSAL_TEST_KEY]: JSON.stringify({ mode: 'rehearsal', fixture: 'one', json: fixtureJson('one') }) }))
    expect(out).toMatch(/<button[^>]*data-off="1"[^>]*data-testid="rh-polish-toggle-read"/); expect(out).toMatch(/<button[^>]*disabled=""[^>]*data-testid="rh-polish-run-read"/)
    expect(out).not.toMatch(/<button[^>]*data-off[^>]*data-testid="rh-polish-toggle-intro"/); expect(out).not.toContain('такого этапа нет')
  })
  it('сломанный JSON плана: понятная ошибка, запуск недоступен', () => {
    const out = render(memStore({ [REHEARSAL_TEST_KEY]: JSON.stringify({ mode: 'rehearsal', fixture: 'three', json: '{не json' }) }))
    expect(out).toContain('data-testid="rh-polish-error"'); expect(out).toContain('Не JSON')
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*data-testid="rh-polish-run-intro"/); expect(out).toMatch(/<button[^>]*disabled=""[^>]*data-testid="rh-polish-run-all"/)
  })
})

describe('семя случайностей внутри актов (CONCEPT_REHEARSAL.md §8)', () => {
  it('поле «Семя» с кнопкой «Новое»: пусто — по дате, показано семя этой сессии (дата и фраза)', () => {
    const out = render(opened(['settings']))
    expect(out).toContain('data-testid="rh-polish-seed"'); expect(out).toContain('placeholder="по дате"'); expect(out).toMatch(/<button[^>]*data-testid="rh-polish-seed-new"[^>]*>Новое</)
    expect(out).toMatch(/data-testid="rh-polish-seed-now">Семя этой сессии: \d{4}-\d{2}-\d{2}\|I(&#x27;|')m \| trying \| to learn</)
  })
  it('семя из JSON плана (из «Теста игры» или фикстуры) стоит в поле и в плане; сломанный JSON — поле недоступно', () => {
    const json = JSON.stringify({ ...JSON.parse(fixtureJson('three')), seed: 'мой-вариант' })
    const out = render(opened(['settings'], { [REHEARSAL_TEST_KEY]: JSON.stringify({ mode: 'rehearsal', fixture: 'three', json }) }))
    expect(out).toContain('value="мой-вариант"'); expect(out).toContain('Семя этой сессии: мой-вариант')
    const bad = render(opened(['settings'], { [REHEARSAL_TEST_KEY]: JSON.stringify({ mode: 'rehearsal', fixture: 'three', json: '{не json' }) }))
    expect(bad).toMatch(/<input[^>]*disabled=""[^>]*data-testid="rh-polish-seed"/); expect(bad).toMatch(/<button[^>]*disabled=""[^>]*data-testid="rh-polish-seed-new"/)
  })
  it('withSeed / jsonSeed: семя пишется в JSON плана и убирается пустым; остальные поля не трогаются; не JSON — как был', () => {
    const json = fixtureJson('three')
    const seeded = withSeed(json, '  вариант 2 ')
    expect(JSON.parse(seeded)).toEqual({ ...JSON.parse(json), seed: 'вариант 2' }); expect(jsonSeed(seeded)).toBe('вариант 2')
    expect(JSON.parse(withSeed(seeded, ''))).toEqual(JSON.parse(json)); expect(jsonSeed(withSeed(seeded, '  '))).toBeNull(); expect(jsonSeed(json)).toBeNull()
    expect(withSeed('{не json', 'x')).toBe('{не json'); expect(withSeed('[1]', 'x')).toBe('[1]'); expect(jsonSeed('{не json')).toBeNull()
    expect(parsePlanJson(seeded).plan.seed).toBe('вариант 2')
  })
  it('проводка: поле пишет семя в общую форму (saveRehearsalForm) — «Тест игры» видит его в JSON', () => {
    const src = read('./RehearsalPolishBlock.jsx')
    expect(src).toContain('<PolishSeed json={rform.json} plan={plan} disabled={playing} onJson={pickJson} />')
    expect(src).toContain('const pickJson = json => { const next = { ...rform, json }; setRform(next); saveRehearsalForm(next) }')
    expect(read('./PolishSeed.jsx')).toContain('onJson(withSeed(json, value))'); expect(read('./PolishSeed.jsx')).toContain('set(newSeed())')
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
  it('файлы не длиннее 250 строк; карточки в admin-rehearsal-polish.css (подключён из блока), admin-speech.css не разросся', () => {
    for (const f of ['RehearsalPolishBlock.jsx', 'PolishActCard.jsx', 'PolishSettings.jsx', 'usePolishOpen.js']) expect(lines(`./${f}`), f).toBeLessThanOrEqual(250)
    expect(lines('../../../styles/admin-rehearsal-polish.css')).toBeLessThanOrEqual(250); expect(lines('../../../styles/admin-speech.css')).toBeLessThanOrEqual(250)
    expect(read('../../../styles/admin-rehearsal-polish.css')).toContain('.rhpCard'); expect(read('../../../styles/admin-speech.css')).not.toContain('.rhpCard')
    expect(read('./RehearsalPolishBlock.jsx')).toContain("import '../../../styles/admin-rehearsal-polish.css'")
  })
})
