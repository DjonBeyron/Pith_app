import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import NodeSayPhrasePicker from './NodeSayPhrasePicker.jsx'
import NodeSayHints from './NodeSayHints.jsx'
import NodeSayCantSpeakNote from './NodeSayCantSpeakNote.jsx'
import NodeSayVoiceReply from './NodeSayVoiceReply.jsx'

// Пояснения в редакторе ноды say_phrase живут в попапах «i» (shared/ui/InfoPopup.jsx), а не абзацами в панели.
// Закрытый InfoPopup в разметку текст не кладёт — значит ВСЁ, что видно в отрисованной панели, это короткие метки/значения.
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const noop = () => {}
const MAX_VISIBLE = 64 // самый длинный видимый кусок текста в панели, симв. (метка «Порог: 70% слов», превью «нужно сказать N из M слов…»)

const texts = html => html.replace(/<[^>]+>/g, '\u0000').split('\u0000').map(t => t.trim()).filter(Boolean)
const attrs = (html, name) => [...html.matchAll(new RegExp(`${name}="([^"]*)"`, 'g'))].map(m => m[1])
const panel = (extra = {}) => renderToStaticMarkup(createElement(NodeSayPhrasePicker, {
  phrase: 'I am trying to please both', keywords: 'please, both, missing', onChange: noop, onTriggersChange: noop,
  allNodes: [{ id: 'n2', seq: 2, type: 'text' }], nodeId: 'n1', ...extra,
}))

describe('say_phrase в редакторе — пояснения только через InfoPopup', () => {
  it('в панели нет длинных кусков текста: все видимые тексты и placeholder/aria-label короткие', () => {
    const html = panel()
    for (const t of texts(html)) expect(t.length, t).toBeLessThanOrEqual(MAX_VISIBLE)
    for (const a of [...attrs(html, 'placeholder'), ...attrs(html, 'aria-label')]) expect(a.length, a).toBeLessThanOrEqual(MAX_VISIBLE)
  })

  it('в панели есть кнопки «Пояснение»: фраза, ключевые слова, порог, «Строго», «Послушать», «Голосовое с текстом», подсказки (+3 поля), два выхода', () => {
    const html = panel()
    expect((html.match(/aria-label="Пояснение"/g) ?? []).length).toBe(11)
    for (const id of ['phrase', 'keywords', 'threshold', 'strict', 'listen', 'voice', 'hints', 'hintSilence', 'hintMismatch', 'hintPartial', 'exits']) {
      expect(html, id).toContain(`data-testid="say-info-${id}"`)
    }
    expect(html).toContain('data-testid="say-cant-speak-note"')
  })

  it('ни один попап не раскрыт сам: текстов пояснений в разметке нет', () => {
    const html = panel()
    for (const w of ['Порядок слов не важен', 'после третьей неудачной попытки', 'подставляются автоматически', 'домыслил', 'Vosk', 'role="dialog"']) {
      expect(html, w).not.toContain(w)
    }
  })

  it('короткие метки на месте: поля, чекбоксы и красная/жёлтая строка про ключевые слова не во фразе', () => {
    const t = texts(panel())
    for (const w of ['Фраза-эталон', 'Ключевые слова (через запятую)', 'Строго', 'Кнопка «Послушать»', 'Голосовое с текстом', 'Подсказки в чате', '✓ Верно →', '✗ Неверно →']) expect(t, w).toContain(w)
    expect(t.some(x => x.startsWith('Нет в фразе (проверка их не учтёт): missing'))).toBe(true)
  })

  it('подсказки выключены — три поля и их значки скрыты, остаётся строка «Подсказки в чате» + «i»', () => {
    const html = renderToStaticMarkup(createElement(NodeSayHints, { hintsOn: false, onChange: noop }))
    expect(html).not.toContain('<textarea')
    expect((html.match(/aria-label="Пояснение"/g) ?? []).length).toBe(1)
  })

  it('NodeSayHints: каждое текстовое поле подписано (aria-label), стандартный текст — placeholder', () => {
    const html = renderToStaticMarkup(createElement(NodeSayHints, { onChange: noop }))
    expect((html.match(/<textarea/g) ?? []).length).toBe(3)
    expect(attrs(html, 'aria-label').filter(a => /^\d\. /.test(a)).length).toBe(3)
    expect((html.match(/placeholder="[^"]+"/g) ?? []).length).toBe(3)
  })

  it('NodeSayVoiceReply: только метка-чекбокс и «i»; галка шлёт voiceReply', () => {
    const html = renderToStaticMarkup(createElement(NodeSayVoiceReply, { voiceReply: true, onChange: noop }))
    expect(texts(html)).toEqual(['Голосовое с текстом'])
    expect(html).toContain('checked=""')
    expect((html.match(/aria-label="Пояснение"/g) ?? []).length).toBe(1)
    expect(read('./NodeSayVoiceReply.jsx')).toContain('onChange({ voiceReply: e.target.checked })')
    expect(read('./NodeAnswerFields.jsx')).toContain('voiceReply={tData.voiceReply === true}')
  })

  it('NodeSayCantSpeakNote: только метка и «i»', () => {
    const html = renderToStaticMarkup(createElement(NodeSayCantSpeakNote))
    expect(texts(html)).toEqual(['Два выхода и «Я не могу говорить»'])
    expect(html).toContain('aria-label="Пояснение"')
  })

  it('сторож по исходнику: вне <InfoPopup> нет абзацев-пояснений (nodeTwHint) и строк-литералов длиннее порога (комментарии не считаются)', () => {
    for (const f of ['NodeSayPhrasePicker.jsx', 'NodeSayHints.jsx', 'NodeSayCantSpeakNote.jsx', 'NodeSayVoiceReply.jsx']) {
      const outside = read(`./${f}`).replace(/\/\/.*$/gm, '').replace(/<InfoPopup[\s\S]*?<\/InfoPopup>/g, '<InfoPopup/>')
      expect(outside, f).not.toContain('nodeTwHint') // абзац-пояснение; короткие <p> предупреждения/превью остаются
      for (const m of outside.matchAll(/'([^'\n]{40,})'|"([^"\n]{40,})"|`([^`\n]{40,})`/g)) {
        const lit = m[1] ?? m[2] ?? m[3]
        if (/^(\.\.?\/|[\w-]+(\s[\w-]+)*$)/.test(lit)) continue // пути импортов и className
        expect.soft(lit.length, `${f}: «${lit}»`).toBeLessThanOrEqual(MAX_VISIBLE)
      }
    }
  })
})

describe('say_phrase в редакторе — тексты пояснений сохранены в попапах', () => {
  it('смысл прежних абзацев на месте (попапы в исходниках)', () => {
    const all = ['NodeSayPhrasePicker.jsx', 'NodeSayHints.jsx', 'NodeSayCantSpeakNote.jsx', 'NodeSayVoiceReply.jsx'].map(f => read(`./${f}`)).join('\n')
    for (const w of ['Порядок слов не важен', 'Штрафов нет', 'ПЕРЕД модулем', 'Консенсус interim+final', 'домыслил', 'тишина попытку не тратит',
      'всегда ведёт по «Верно»', 'Пропуск разовый', 'микрофон выключен', 'подставляются автоматически', 'нигде не сохраняется', 'не восстанавливаются']) {
      expect(all, w).toContain(w)
    }
  })
})
