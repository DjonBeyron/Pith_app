import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Проводка режима «голосовое с текстом» (читаем исходники): запись только из потока Vosk, клип только в памяти сессии (никаких хранилищ/сети), чекпойнт и LessonPlayer не затронуты.
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const code = t => t.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
const lines = t => t.split('\n').length - (t.endsWith('\n') ? 1 : 0)

const VOICE_FILES = [
  '../../../../shared/lib/vosk/voskRecord.js',
  '../../../../shared/lib/speech/sayVoiceStore.js',
  '../../../../shared/lib/speech/sayVoicePlan.js',
  '../../../../shared/lib/speech/sayVoiceLast.js',
  '../../../../shared/lib/speech/sayVoicePause.js',
  '../../modules/say-phrase/useSayVoicePlayer.js',
  '../../modules/say-phrase/SayVoiceReply.jsx',
  '../../modules/say-phrase/useSayVoiceVersion.js',
]

describe('голосовой ответ: звук только в памяти', () => {
  it('в коде записи/реестра/плеера нет IndexedDB, localStorage, sessionStorage, fetch, XHR, sendBeacon, Cache API, Supabase и загрузки', () => {
    for (const f of VOICE_FILES) {
      const src = code(read(f))
      expect(src, f).not.toMatch(/indexedDB|localStorage|sessionStorage|\bfetch\(|XMLHttpRequest|sendBeacon|caches\.|supabase|\bupload|FormData|saveLessonProgress|\.from\(['"]storage/i)
    }
  })

  it('освобождение: реестр отзывает blob-URL (revokeObjectURL), плеер при размонтировании ставит audio на паузу', () => {
    expect(code(read(VOICE_FILES[1]))).toContain('URL.revokeObjectURL(url)')
    expect(code(read(VOICE_FILES[5]))).toMatch(/return \(\) => \{[\s\S]*a\.pause\(\)/)
  })

  it('чекпойнт урока (id нод) и LessonPlayer без голосовых; LessonPlayer.jsx и useGraphPlayer.js ≤ 400 строк', () => {
    const player = read('../../LessonPlayer.jsx')
    const graph = read('../../useGraphPlayer.js')
    expect(lines(player)).toBeLessThanOrEqual(400)
    expect(lines(graph)).toBeLessThanOrEqual(400)
    expect(player).toContain('onCheckpoint: (nodeId, vIds) => resumeState.checkpoint(nodeId,')
    expect(code(player)).not.toMatch(/voiceId|sayVoice|SayVoice/)
    expect(code(graph)).not.toMatch(/voiceId|sayVoice|phraseStates/)
    const api = code(read('../../../../shared/lib/lessonProgressApi.js'))
    expect(api).toContain('visited_ids: visitedIds') // в чекпойнте — только id нод
    expect(api).not.toMatch(/voice|phrase|blob|reply/i)
  })
})

describe('голосовой ответ: проводка в модуле', () => {
  const panel = read('./SayPhrasePanel.jsx')
  const hook = read('./useSayPhrase.js')

  it('режим — data.voiceReply === true; клип берёт takeVoice по движку и записи попытки; настоящие попытки (верная/неверная) голосом, админская палочка и пропуск — нет', () => {
    expect(panel).toContain('const voiceOn = data.voiceReply === true')
    expect(panel).toContain('takeVoice({ voiceOn, engine: sp.engine, audio: sp.view?.audio })')
    expect(panel).toContain("const voiceId = kind === 'passed' ? takeVoiceId() : null")
    expect(panel).toContain("onAnswered?.(reply, 'wrong_final', false, voiceId)")
    expect(panel).toContain('<SayMicPopup kind={sp.explainKind} voice={voiceOn}')
    expect(panel).toContain('<SayAdminDiag phrase={data.phrase} voice={voiceOn} />')
  })

  it('реплика не ушла в чат (панель закрыта раньше) — её клип освобождается, а не висит до конца урока', () => {
    expect(panel).toContain('revokeSayVoice(pendingVoice.current)')
    expect(panel).toContain('if (!reply) revokeSayVoice(voiceId)')
  })

  it('запись просим ТОЛЬКО у Vosk: recordAudio = режим вкл И движок vosk; второго getUserMedia нет; перед записью свои голосовые в чате останавливаются', () => {
    const begin = hook.slice(hook.indexOf('const begin = useCallback'), hook.indexOf('// Тап по микрофону'))
    expect(begin).toContain("recordAudio: data.voiceReply === true && pick.engine === 'vosk'")
    expect(begin.indexOf('pauseSayVoices()')).toBeLessThan(begin.indexOf('quiet.open()'))
    expect(code(hook)).not.toMatch(/getUserMedia/)
    const rec = code(read('../../../../shared/lib/speech/sayRecognizer.js'))
    expect(rec).toContain('vosk.start({ reference, lang, data, record: recordAudio })')
    expect(rec).toContain('system.start({ reference, lang })') // системное распознавание записи не получает
    const vosk = code(read('../../../../shared/lib/vosk/voskRecognizer.js'))
    expect(vosk).toContain('record: !!record')
    expect(vosk).toContain('audio: stats?.audio ?? null')
  })

  it('движок создаёт рекордер ТОЛЬКО по opts.record и записывает куски ДО затвора тишины; освобождение сбрасывает буфер', () => {
    const eng = code(read('../../../../shared/lib/vosk/voskEngine.js'))
    expect(eng).toContain('const recorder = opts.record ? createRecorder(')
    expect(eng.indexOf('recorder.push(')).toBeLessThan(eng.indexOf('gate.push('))
    expect(eng).toContain('recorder?.reset()')
    expect(eng).toContain('audio: recorder ? recorder.finish() : null')
  })

  it('цепочка пузыря: PlayerPanels → handlePhraseAnswer(…, voiceId) → phraseStates → AnswerBubbles (оба исхода) → SayVoiceReply', () => {
    expect(read('../../PlayerPanels.jsx')).toContain('onAnswered={(text, result, arriving, voiceId) => handlePhraseAnswer(spNode.id, text, result, arriving, voiceId)}')
    const answers = read('../../usePlayerAnswers.js')
    expect(answers).toContain('useEffect(() => clearSayVoices, [])')
    expect(answers).toContain('revokeSayVoices((prev[nodeId] ?? []).map(b => b.voiceId))')
    const bubbles = read('../../modules/AnswerBubbles.jsx')
    expect((bubbles.match(/\{body\(b\)\}/g) ?? []).length).toBe(2) // correct и wrong_final
    expect(bubbles).toContain('<SayVoiceReply voiceId={b.voiceId}')
    expect(bubbles).toContain('useSayVoiceVersion()')
  })

  it('воспроизведение: обычный <audio> в ленте (useSoloMedia глушит соседей), data-voice, muted урока, не играет во время записи, слова озвучки глушатся', () => {
    const player = read('../../modules/say-phrase/useSayVoicePlayer.js')
    const view = read('../../modules/say-phrase/SayVoiceReply.jsx')
    expect(view).toContain('data-voice=""')
    expect(view).toContain('data-say-voice=""')
    expect(view).toContain('muted={muted}')
    expect(view).toContain('usePlayerMuted()')
    expect(view).toContain("aria-label={playing ? 'Пауза' : 'Прослушать свой ответ'}")
    expect(player).toContain('if (isMicBusy()) return')
    expect(player).toContain('stopWord()')
    expect(player).toContain('prefers-reduced-motion: reduce')
  })

  it('стили: бейдж ✓/✕ у голосового пузыря на тексте, ::after самого пузыря скрыт; reduced-motion; CSS ≤ 250 строк', () => {
    const css = read('../../../../styles/player/modules/say-voice.css')
    expect(css).toMatch(/\.playerMsgBubble--voice\.playerMsgBubble--response::after \{ content: none !important; display: none !important; \}/)
    expect(css).toContain(".sayVoiceText--ok::after  { content: '✓'")
    expect(css).toContain(".sayVoiceText--err::after { content: '✕'")
    expect(css).toContain('prefers-reduced-motion')
    expect(lines(css)).toBeLessThanOrEqual(250)
    expect(read('../../../../index.css')).toContain("@import './styles/player/modules/say-voice.css';")
  })
})
