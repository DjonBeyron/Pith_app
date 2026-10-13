// Проверки голоса, таблиц и мелочей текста: печать голосового, «отправить в чат» у авто-таблиц, опечатки, перенос зелёной фразы.
// Чистые функции на формате обмена ({ ref, type, data, triggers }) после applyMarkup, возвращают строки-замечания.

import { wrongOnlySet } from './lessonLintFlow.js'

const LISTEN_NEXT = new Set(['word_choice', 'type_word', 'phrase_assembly']) // задания «на слух»: текст голоса скрыт
const TYPOS = /сказажи|скажы|праверь|правельно|пожалуста|нармально|ашибк|скозать|щас\b|чтоб\s+бы/i

const nextOf = (nodes, n) => nodes.find(x => x.ref === n.triggers?.[0]?.then)

/** Голосовое не «на слух» (после него не задание на слух) — текст печатается в чате (showText не false) */
function checkAudioShowText(nodes) {
  const out = []
  for (const n of nodes.filter(x => x.type === 'audio')) {
    const nx = nextOf(nodes, n)
    // образец «повтори за мной»: голос равен фразе следующего say_phrase — текст скрыт, ученик слушает
    const sample = nx?.type === 'say_phrase' && String(n.data?.text ?? '').trim().toLowerCase() === String(nx.data?.phrase ?? '').trim().toLowerCase()
    const listen = LISTEN_NEXT.has(nx?.type) || sample
    if (!listen && n.data?.showText === false) out.push(`[R-audio-showtext] ${n.ref} (audio): голосовое не «на слух», а текст скрыт — включи «Печатать текст в чате под голосовым» (showText: true)`)
  }
  return out
}

/** Авто-таблицу (dictator), которую объясняем голосом, всегда отправляем в чат (sendToChat) */
function checkTableChat(nodes) {
  return nodes.filter(n => n.type === 'table' && n.data?.mode === 'dictator' && n.data?.sendToChat !== true)
    .map(n => `[R-table-chat] ${n.ref} (table): авто-таблица без «отправить в чат» — поставь sendToChat: true`)
}

/** Частые опечатки в репликах и подписях */
function checkTypos(nodes) {
  return nodes.filter(n => ['text', 'audio', 'system', 'pin_message', 'photo'].includes(n.type) && TYPOS.test(String(n.data?.content ?? n.data?.text ?? n.data?.caption ?? '')))
    .map(n => `[R-typo] ${n.ref} (${n.type}): похоже на опечатку («${String(n.data?.content ?? n.data?.text ?? n.data?.caption).match(TYPOS)[0]}») — перепиши слово`)
}

/** Фраза-пример после двоеточия в конце сообщения (зелёная, жирная) — на новой строке, с hardWrap */
function checkGreenWrap(nodes) {
  const out = []
  for (const n of nodes.filter(x => x.type === 'text')) {
    const c = String(n.data?.content ?? '')
    const g = (n.data?.highlights ?? []).find(h => h.mode === 'bold' && h.end >= c.trimEnd().length && h.start > 0)
    if (!g || !/:\s*$/.test(c.slice(0, g.start))) continue
    if (!n.data?.hardWrap || !/:[ \t]*\n\s*$/.test(c.slice(0, g.start))) out.push(`[R-green-wrap] ${n.ref} (text): зелёная фраза после двоеточия идёт в той же строке — перенеси её на новую строку («…:\\n{g:фраза}») и включи hardWrap`)
  }
  return out
}

/** Задание «скажи с шаблоном» (pattern с **): подсказка при ошибке мягко говорит, что можно добавить любое слово */
function checkSayAny(nodes) {
  return nodes.filter(n => n.type === 'say_phrase' && String(n.data?.pattern ?? '').includes('**') && !/любо[еой]/i.test(String(n.data?.hintMismatch ?? '')))
    .map(n => `[R-say-any] ${n.ref} (say_phrase): в задании с шаблоном hintMismatch не говорит, что можно добавить любое слово — допиши («начни с … и добавь любое слово»)`)
}

/** Вводные слова веток ошибки («хм)», «не совсем)»…) чередуются: одно слово — не больше четверти веток; «хм»/«эээмм» — не больше двух */
function checkOpeners(nodes) {
  const wrong = wrongOnlySet(nodes, /wrong|skip/)
  const open = nodes.filter(n => n.type === 'text' && wrong.has(n.ref)).map(n => ({ ref: n.ref, w: (String(n.data?.content ?? '').match(/^\s*([а-яёa-z.… ]+?)\)/i)?.[1] ?? '').toLowerCase().replace(/[.…]+$/, '') })).filter(o => o.w)
  if (open.length < 6) return []
  const cnt = new Map()
  for (const o of open) cnt.set(o.w, (cnt.get(o.w) ?? 0) + 1)
  const cap = Math.ceil(open.length / 4)
  return [...cnt].filter(([w, c]) => c > cap || (/^(хм+|э+м+)$/.test(w) && c > 2))
    .map(([w, c]) => `[R-opener] вводное «${w})» в ${c} из ${open.length} веток ошибки — чередуй: «не совсем», «близко», «не то», «неа», «но нет»`)
}

export function checkMedia(nodes) {
  return [...checkSayAny(nodes), ...checkOpeners(nodes), ...checkAudioShowText(nodes), ...checkTableChat(nodes), ...checkTypos(nodes), ...checkGreenWrap(nodes)]
}
