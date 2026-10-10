import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

// Проводка Vosk в «Сказать фразу» (читаем исходники): движок выбирается на тапе без ожидания, второго getUserMedia нет, прогрев — только пока панель смонтирована,
// движок и библиотека живут в shared и не попадают в основной бандл, админская настройка — только в админке.
const src = fileURLToPath(new URL('../../../../', import.meta.url))
const read = rel => readFileSync(join(src, rel), 'utf8')
const code = t => t.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(d => (d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]))
const hook = read('features/player/panels/say-phrase/useSayPhrase.js')

describe('useSayPhrase: выбор движка и уровень голоса', () => {
  it('движок выбирается синхронно в тапе ДО старта; отдельный реальный уровень (второй getUserMedia) — только для системного распознавания', () => {
    const begin = hook.slice(hook.indexOf('const begin = useCallback'), hook.indexOf('// Тап по микрофону'))
    expect(begin).toContain('const pick = ctrl.choose(data)')
    expect(begin).toContain("const wantReal = isRealLevelOn() && pick.engine === 'system'")
    expect(begin.indexOf('ctrl.choose(')).toBeLessThan(begin.indexOf('real.open()'))
    expect(begin.indexOf('real.open()')).toBeLessThan(begin.indexOf('ctrl.start('))
    expect(begin).toContain('engine: pick })') // пометка движка в состояние (плашка админа)
    expect(begin).toContain('ctrl.start({ reference: data.phrase, lang: data.lang, data, pick })')
    expect(code(begin)).not.toMatch(/await|\.then\(|setTimeout\([^)]*choose/) // выбор не ждёт ничего
  })
  it('источник уровня: RMS Vosk (ctrl.level), а где его нет — прежний системный', () => {
    expect(hook).toContain('createLevelSource(t => ctrl.level(t) ?? sys.ringLevel(t))')
  })
  it('прогрев Vosk — в эффекте монтирования панели через startPanelWarm (сразу, НЕ за perm.refresh()) и освобождается в cleanup; в запасном режиме не греется', () => {
    const eff = hook.slice(hook.indexOf('useEffect(() => {\n    // Прогрев Vosk сразу'), hook.indexOf('// Начать попытку'))
    expect(eff).toContain('const unwarm = startPanelWarm({ perm, warm: why => ctrl.warm(why)')
    expect(eff).toMatch(/return \(\) => \{\s+unwarm\(\)/)
    expect(eff).toMatch(/ctrl\.reset\(\)/)
    expect(hook.match(/ctrl\.warm\(/g)).toHaveLength(1)
    expect(code(hook)).not.toMatch(/perm\.refresh\(\)\.then/) // регресс: прогрев стоял за Permissions API, на iPhone он может не отвечать
    const warm = code(read('shared/lib/speech/sayPanelWarm.js'))
    expect(warm.indexOf("warm('panel')")).toBeLessThan(warm.indexOf('perm.refresh()'))
  })
  it('в режиме «Только Vosk» тап не уходит на системное: ожидание прогрева до begin-логики (без await в begin), микрофон в ожидании не открывается', () => {
    const begin = hook.slice(hook.indexOf('const begin = useCallback'), hook.indexOf('// Тап по микрофону'))
    expect(begin).toContain('if (waitVosk(data)) return')
    expect(begin.indexOf('waitVosk(data)')).toBeLessThan(begin.indexOf('ctrl.choose('))
    expect(hook).toContain('adminLine: waitNote ?? s.adminLine') // причина — в той же серой плашке админа над панелью
    for (const f of ['shared/lib/speech/sayVoskWait.js', 'features/player/panels/say-phrase/useVoskWait.js']) expect(code(read(f)), f).not.toMatch(/getUserMedia|AudioContext|\.start\(/)
  })
  it('системный контроллер остаётся с прежними настройками (стратегия M, abort после финала, аудиосессия) — он только обёрнут', () => {
    expect(hook).toContain("endOnFinal: 'abort'")
    expect(hook).toContain("getRestart: () => 'M'")
    expect(hook).toContain('audioSession: createAudioSession()')
    expect(hook).toContain('getSession: () => sayAudioSessionType()')
  })
})

describe('границы слоёв и бандл', () => {
  const files = walk(src).filter(p => /\.(js|jsx)$/.test(p) && !/\.test\./.test(p))
  it('библиотека vosk-browser импортируется ТОЛЬКО динамически и ТОЛЬКО из voskEngine.js; движок лежит в shared, а не в features/admin', () => {
    expect(existsSync(join(src, 'features/admin/speech/voskEngine.js'))).toBe(false)
    expect(existsSync(join(src, 'shared/lib/vosk/voskEngine.js'))).toBe(true)
    const lib = /\bimport\b[^\n;]*['"]vosk-browser['"]|import\(\s*['"]vosk-browser['"]\s*\)/
    const users = files.filter(p => lib.test(code(readFileSync(p, 'utf8')))).map(p => p.slice(src.length))
    expect(users).toEqual(['shared/lib/vosk/voskEngine.js'])
    expect(code(read('shared/lib/vosk/voskEngine.js'))).not.toMatch(/^import[^\n]*vosk-browser/m)
  })
  it('прогрев модели (acquire) зовут только распознаватель модуля и ранний прогрев урока (sayLessonWarm.js, подгружается отдельным чанком); панель-обёртка и App не тянут Vosk в основной бандл', () => {
    const acquirers = files.filter(p => /\.acquire\(/.test(code(readFileSync(p, 'utf8')))).map(p => p.slice(src.length)).sort()
    expect(acquirers).toEqual(['shared/lib/speech/sayLessonWarm.js', 'shared/lib/speech/sayRecognizer.js'])
    expect(code(read('features/player/useLessonWarmups.js'))).toContain("import('../../shared/lib/speech/sayLessonWarm.js')") // плеер урока не тянет runtime / движок статически
    expect(code(read('features/player/PlayerPanels.jsx'))).not.toMatch(/voskRuntime|sayLessonWarm|voskEngine/)
    for (const f of ['app/App.jsx', 'features/player/panels/say-phrase/SayPhrasePanelLazy.jsx']) expect(code(read(f))).not.toMatch(/vosk-browser|voskEngine|voskRuntime|voskRecognizer|sayRecognizer/)
  })
  it('shared не импортирует из features (адаптер, runtime и выбор движка — чистый shared)', () => {
    for (const f of ['shared/lib/vosk/voskRecognizer.js', 'shared/lib/vosk/voskRuntime.js', 'shared/lib/vosk/sayVoskGrammar.js', 'shared/lib/speech/sayRecognizer.js', 'shared/lib/speech/sayEnginePick.js']) {
      expect(read(f), f).not.toMatch(/from '[^']*features\//)
    }
  })
  it('микрофон открывает только движок Vosk (один getUserMedia на попытку), файлы панели — нет', () => {
    for (const f of ['voskRecognizer.js', 'voskRuntime.js', 'sayVoskLevel.js', 'sayVoskGrammar.js', 'voskResult.js']) expect(code(read(`shared/lib/vosk/${f}`)), f).not.toMatch(/getUserMedia|AudioContext/)
    expect(code(read('shared/lib/vosk/voskEngine.js')).match(/getUserMedia\(/g)).toHaveLength(1)
    expect(code(read('shared/lib/speech/sayRecognizer.js'))).not.toMatch(/getUserMedia|AudioContext/)
  })
})

describe('админская настройка движка', () => {
  const block = read('features/admin/speech/SpeechSayBlock.jsx')
  const engine = read('features/admin/speech/SpeechSayEngine.jsx')
  it('секция «Сказать фразу: настройки для тестов» включает выбор движка и строку «последняя попытка шла на»', () => {
    expect(block).toContain('<SpeechSayEngine />')
    expect(engine).toContain('Последняя попытка шла на:')
    expect(engine).toContain('data-testid={`say-engine-${m}`}')
    expect(engine).toContain('writeSayEngine(m)')
    expect(read('shared/lib/speech/sayEngineMode.js')).toContain("SAY_ENGINE_KEY = 'pithy_say_engine_v1'")
  })
  it('обычному пользователю ничего не показывается: настройка и подписи движка — только в админке и в плашке админа', () => {
    const player = files => files.filter(p => p.includes('features/player/')).map(p => readFileSync(p, 'utf8'))
    for (const t of player(walk(src).filter(p => /\.(js|jsx)$/.test(p) && !/\.test\./.test(p)))) expect(t).not.toMatch(/SpeechSayEngine|SAY_ENGINE_LABEL|pickLabel/)
    expect(read('features/player/panels/say-phrase/SayPhrasePanel.jsx')).toContain('const adminLine = isAdmin ? sp.adminLine : null')
  })
})
