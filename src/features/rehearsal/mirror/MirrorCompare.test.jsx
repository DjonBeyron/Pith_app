import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import MirrorCompare, { AUTO_MS } from './MirrorCompare.jsx'
import { buildMirror } from '../rehearsalMirror.js'
import { noteFor } from './mirrorNotes.js'
import { DECEL_MS } from '../../player/modules/rotate-phone/wordLaneConveyor.js'
import { CHUNKS, DICTOR, STUDENT_CLEAN } from './mirrorFixtures.js'

const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
const html = props => renderToStaticMarkup(createElement(MirrorCompare, { chunks: CHUNKS, onDone() {}, ...props }))
const dictor = { ...DICTOR, leadMs: 0, play() {}, cancel() {} }
const words = STUDENT_CLEAN.words.map(w => ({ ...w, start: w.start * 1000, end: w.end * 1000 }))
const mirror = buildMirror({ chunks: CHUNKS, take: { url: 'blob:take', durationMs: 2600, rms: 0.09 }, words, dictor })
const count = (s, re) => (s.match(re) ?? []).length

describe('MirrorCompare: кнопки, заметка и аудио записи (сами пилюли — на дорожках)', () => {
  it('до прослушивания: «Сравнить» и «Дальше», аудио записи; заметки ещё нет; никаких полос и окон', () => {
    const out = html({ mirror })
    expect(out).toContain('>Сравнить<'); expect(out).toContain('>Дальше<'); expect(out).toContain('<audio src="blob:take"'); expect(out).not.toContain('rh-mirror-note')
    expect(out).not.toMatch(/wlMir|rhScreen|rhMirror|<section/)
    expect(count(out, /<[a-z]/g)).toBeLessThanOrEqual(6) // div + две кнопки + audio: нового слоя на экране нет
  })
  it('запись не получилась: «Послушать», заметка о сбое сразу, аудио нет; «Дальше» всегда доступна', () => {
    const failed = { dictor, student: null, measure: null, note: noteFor(null), tempo: null }
    const out = html({ mirror: failed })
    expect(out).toContain('>Послушать<'); expect(out).toContain('data-key="fail"'); expect(out).toContain('Запись не получилась'); expect(out).not.toContain('<audio'); expect(out).toContain('rh-mirror-done')
  })
  it('нет и диктора, и записи: играть нечего — кнопки «Сравнить» нет, заметка о сбое и «Дальше» есть', () => {
    const out = html({ mirror: { dictor: null, student: null, measure: null, note: noteFor(null) } })
    expect(out).not.toContain('rh-mirror-compare'); expect(out).toContain('data-key="fail"'); expect(out).toContain('rh-mirror-done')
  })
  it('автоматически играет через AUTO_MS после остановки дорожек (DECEL_MS от начала стадии), подсветка идёт в сцену движка через sceneApi', () => {
    expect(AUTO_MS).toBe(400)
    const src = read('./MirrorCompare.jsx')
    expect(src).toContain('Math.max(0, DECEL_MS - (performance.now() - since)) + AUTO_MS')
    expect(DECEL_MS).toBe(700)
    expect(src).toContain("sceneApi?.current?.lit?.(lit.d >= 0 ? 'pit' : lit.s >= 0 ? 'you' : null, lit.d >= 0 ? lit.d : lit.s)")
    expect(src).toContain("heard ? 'Ещё раз' : 'Сравнить'")
  })
})

describe('стиль зеркала на дорожках: 375 px, lite, reduced-motion', () => {
  const css = read('../../../styles/player/modules/rehearsal-mirror.css')
  it('подключён в index.css; нет жёстких ширин больше экрана; кнопки стоят в свободной полосе между нижней пилюлей и котом, а не у края', () => {
    expect(read('../../../index.css')).toContain("@import './styles/player/modules/rehearsal-mirror.css';")
    expect(css).not.toMatch(/[^-]width:\s*(\d{3,})px/)
    expect(css).toMatch(/\.rhCmpBar \{[^}]*top: 71%/); expect(css).not.toMatch(/\.rhCmpBar \{[^}]*bottom:/)
    expect(css).toMatch(/\.rhNote \{[^}]*width: calc\(100% - 32px\)/)
  })
  it('пилюли сравнения появляются плавно (только opacity); подписей на самих пилюлях нет — подпись одна на горизонтальной подложке', () => {
    expect(css).toMatch(/\.wlPill\[data-still\] \{ animation: rhStillIn 0\.6s/)
    expect(css).toMatch(/@keyframes rhStillIn \{ from \{ opacity: 0; \} to \{ opacity: 1; \} \}/)
    expect(css).not.toMatch(/\.wlPill\[data-tag\]::after/)
    expect(css).not.toMatch(/transition:[^;]*(width|left|height|top|box-shadow|background)/)
  })
  it('слабое устройство и reduced-motion: без анимации появления, звучащий кусок — статичный белый контур без filter', () => {
    expect(css).toMatch(/\.wl--lite \.wlPill\[data-still\], \.weak-device \.wlPill\[data-still\] \{ animation: none; \}/)
    expect(css).toMatch(/\.wl--lite \.wlPill\[data-still\]\[data-voice\][^{]*\{ filter: none; transition: none; border-color: #fff; \}/)
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.wlPill\[data-still\] \{ animation: none; \}/)
  })
  it('пул чистит признаки сравнения при возврате пилюли; движок знает сцену mirror', () => {
    const pool = read('../../player/modules/rotate-phone/wordLanePool.js')
    for (const a of ['data-still', 'data-tag', 'data-cmp']) expect(pool).toContain(`'${a}'`)
  })
})

describe('заметка в два слоя: плашка между подложками и вердикт Пита (v3.3.87)', () => {
  const src = read('./MirrorCompare.jsx')
  it('Пит говорит вердикт один раз, когда сравнение прозвучало (или играть нечего): noteLine(shown) → say; «Дальше» сперва гасит Пита', () => {
    expect(src).toContain('const line = problem ? null : noteLine(shown)')
    expect(src).toContain('const open = heard || !canPlay')
    expect(src).toMatch(/if \(open && line && !said\.current\) \{ said\.current = true; say\?\.\(line\) \}/)
    expect(src).toContain('const next = () => { hush?.(); onDone() }')
    expect(src).toContain('onClick={next}')
  })
  it('сбой записи: плашка сразу, а реплика — после диктора (heard); у «ошибки воспроизведения» реплики нет', () => {
    expect(src).toContain('(heard || failed || !canPlay || problem) && <p className=')
    expect(src).toContain('problem ? null : noteLine(shown)')
  })
  it('«чисто» — золотая плашка (классы wlTurn rhNote--gold, слабое устройство без бликов); обычная — без wlTurn', () => {
    expect(src).toContain("const gold = shown.key === 'clean'")
    expect(src).toContain("`rhNote${gold ? ` wlTurn rhNote--gold${lite ? ' wlTurn--lite' : ''}` : ''}`")
  })
  it('стиль: плашка стоит в зазоре между подложками (top 42,4 %, не 11,5 %); золотая — цвет «Памяти», косой блик дважды, transform; lite и reduced-motion без бликов; CSS подключён', () => {
    const mirrorCss = read('../../../styles/player/modules/rehearsal-mirror.css')
    expect(mirrorCss).toMatch(/\.rhNote \{[^}]*top: 42\.4%/); expect(mirrorCss).not.toMatch(/\.rhNote \{[^}]*top: 11\.5%/)
    const gold = read('../../../styles/player/modules/rehearsal-gold.css')
    expect(read('../../../index.css')).toContain("@import './styles/player/modules/rehearsal-gold.css';")
    expect(gold).toMatch(/border: 2px solid var\(--phrase-gold, #ffd257\)/); expect(gold).toMatch(/--wl-plate-tex/)
    expect(gold).toMatch(/animation: rhGoldSweep 1\.3s ease-in-out 0\.55s 2 both/) // два прохода, не бесконечно
    expect(gold).not.toMatch(/infinite/); expect(gold).toMatch(/\.weak-device \.rhNote--gold::before \{ display: none; \}/)
    expect(gold).toMatch(/prefers-reduced-motion: reduce\)[\s\S]*display: none/)
  })
})
