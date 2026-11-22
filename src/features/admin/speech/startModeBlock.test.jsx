import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import StartModeBlock from './StartModeBlock.jsx'
import { START_MODES, START_MODE_KEY, AUDIO_SESSION_KEY } from '../../../shared/lib/gameAudioSettings.js'

// Админ → «Голос»: блок «Режим запуска звука на iPhone». v3.3.344 (владелец: «режимы запуска звука закинь тоже в олд, встряхни память в самом верху»): блок переехал в свёрнутый раздел «Старое»,
// первым во вкладке стоит «Встряхни память» (полный порядок вкладки — speechTabOrder.test.jsx).
const memStore = (init = {}) => { const m = { ...init }; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v) }, removeItem: k => { delete m[k] } } }
afterEach(() => vi.unstubAllGlobals())

describe('блок «Режим запуска звука на iPhone»', () => {
  it('показывает рабочие режимы (А и Г), выбран режим из настройки; умолчание — «А · как сейчас»; сломанные «direct» / «late» / «direct-wait» читаются как «А» (v3.3.337)', () => {
    vi.stubGlobal('localStorage', memStore())
    const html = renderToStaticMarkup(<StartModeBlock />)
    for (const m of START_MODES) expect(html).toContain(`data-value="${m}"`)
    expect(html).toMatch(/aria-checked="true"[^>]*data-value="default"/); expect(html).not.toContain('audio-start-warn')
    vi.stubGlobal('localStorage', memStore({ [START_MODE_KEY]: 'wait' }))
    expect(renderToStaticMarkup(<StartModeBlock />)).toMatch(/aria-checked="true"[^>]*data-value="wait"/)
    for (const dead of ['direct', 'late', 'direct-wait']) {
      vi.stubGlobal('localStorage', memStore({ [START_MODE_KEY]: dead }))
      const h = renderToStaticMarkup(<StartModeBlock />)
      expect(h, dead).toMatch(/aria-checked="true"[^>]*data-value="default"/); expect(h, dead).not.toContain(`data-value="${dead}"`)
    }
  })
  it('тип аудиосессии игры не «Playback весь сеанс» — предупреждение, что режимы не действуют, и кнопка вернуть', () => {
    vi.stubGlobal('localStorage', memStore({ [AUDIO_SESSION_KEY]: 'auto' }))
    const html = renderToStaticMarkup(<StartModeBlock />)
    expect(html).toContain('audio-start-warn'); expect(html).toContain('Вернуть Playback')
  })
  it('v3.3.336: в блоке есть кнопка отправки журнала в GitHub (общая SendLogButton), подсказка и итог последнего старта', () => {
    vi.stubGlobal('localStorage', memStore())
    const html = renderToStaticMarkup(<StartModeBlock />)
    expect(html).toMatch(/<button[^>]*class="sendLogBtn"[^>]*data-testid="audio-start-send"[^>]*>📤 Отправить логи в GitHub<\/button>/)
    expect(html).toContain('Сыграй в выбранном режиме, вернись сюда и нажми — в журнале будет хроника режима')
    expect(html).toMatch(/data-testid="audio-start-last"[^>]*>Последний старт: /)
    expect(readFileSync(new URL('./StartModeBlock.jsx', import.meta.url), 'utf8')).toContain("from '../../../shared/ui/SendLogButton.jsx'")
  })
})

describe('вкладка «Голос»: порядок блоков', () => {
  it('сначала «Встряхни память» (RaceBlock); режим запуска и всё остальное — внутри <details> «Старое»; в «Микрофон игры» дубля режима запуска нет', () => {
    const src = readFileSync(new URL('./AdminSpeechTab.jsx', import.meta.url), 'utf8')
    const at = s => { const i = src.indexOf(s); expect(i, s).toBeGreaterThan(-1); return i }
    const start = at('<StartModeBlock />'), race = at('<RaceBlock />'), old = at('<details className="aspOld"'), end = at('</details>')
    expect(race).toBeLessThan(old); expect(start).toBeGreaterThan(old); expect(start).toBeLessThan(end) // было: режим запуска первым, над «Встряхни память»
    for (const b of ['GameVolumeBlock', 'RehearsalPolishBlock', 'Game2Block', 'SpeechCapsBlock', 'SoundDiagBlock', 'GameMicBlock', 'GameSoundsBlock', 'GameTestBlock', 'SpeechSayBlock', 'SimpleTestsBlock', 'SpeechTestBlock', 'SpeechLogBlock', 'SpeechCaptureMemo', 'SpeechMemo']) {
      const i = at(`<${b}`, old); expect(src.indexOf(`<${b}`, old), b).toBeGreaterThan(old); expect(src.indexOf(`<${b}`, old), b).toBeLessThan(end); expect(i).toBeGreaterThan(0)
    }
    expect(readFileSync(new URL('./GameMicBlock.jsx', import.meta.url), 'utf8')).not.toContain('audio-start-mode')
  })
})
