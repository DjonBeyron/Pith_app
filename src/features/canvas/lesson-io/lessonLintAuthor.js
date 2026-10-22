// Проверки из замечаний автора по урокам (разбор «At», 2026-10-22): то, что автор пометил руками и что можно поймать кодом.
// BANNED — обороты, которые автор счёл неестественными/устаревшими/детскими («но нет», «ухо востро», «послушай-ка»): пополняется из разборов.
// Остальное: «дай послушать» не чаще двух раз за урок; два соседних по ленте ответа на ошибку с одним и тем же вводным («не то)» → «не то)»);
// у фразы со временем среди ловушек должна быть ещё одна цифра; в озвучке dictator-таблицы «да»/«нет» не читаются как ячейки
import { wrongOnlySet } from './lessonLintFlow.js'

export const BANNED = ['но нет', 'ухо востро', 'послушай-ка', 'включаю твою запись', 'ритм тот самый', 'звучит как надо', 'и сразу вслух', 'ну как сказать', 'без лишнего, вот так']
const LISTEN = /дай(те)? послушать|дай-ка послушаю/i
const LISTEN_MAX = 2
const NUMBERS = new Set(['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'noon', 'midnight'])
const SPEECH = new Set(['text', 'audio', 'photo', 'pin_message', 'system'])

const textOf = n => String(n.data?.content ?? n.data?.text ?? n.data?.caption ?? '')
const opener = n => (textOf(n).match(/^\s*([а-яёa-z.… ]+?)\)/i)?.[1] ?? '').toLowerCase().replace(/[.…]+$/, '').trim()

function checkBanned(nodes) {
  const out = []
  for (const n of nodes) {
    if (!SPEECH.has(n.type) && n.type !== 'scene') continue
    const texts = n.type === 'scene' ? (n.data?.scene?.timeline ?? []).map(l => String(l.text ?? '')) : [textOf(n)]
    for (const t of texts) {
      const hit = BANNED.find(b => t.toLowerCase().includes(b))
      if (hit) { out.push(`[R-banned] ${n.ref} (${n.type}): «${hit}» — автор пометил как неестественное, скажи иначе (список: lessonLintAuthor.js BANNED)`); break }
    }
  }
  return out
}

function checkListenCap(nodes) {
  const hits = nodes.filter(n => SPEECH.has(n.type) && LISTEN.test(textOf(n)))
  return hits.length > LISTEN_MAX ? [`[R-listen-cap] «дай послушать» ${hits.length} раз (${hits.map(n => n.ref).join(', ')}) — не больше ${LISTEN_MAX} за урок, остальные скажи иначе («включаю запись», «ну-ка, что вышло»)`] : []
}

/** Два подряд (по seq) ответа на ошибку с одним вводным словом */
function checkAdjacentOpeners(nodes) {
  const wrong = wrongOnlySet(nodes, /wrong|skip/)
  const list = nodes.filter(n => n.type === 'text' && wrong.has(n.ref) && opener(n)).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
  const out = []
  for (let i = 1; i < list.length; i++) if (opener(list[i]) === opener(list[i - 1])) out.push(`[R-opener-adjacent] ${list[i - 1].ref} и ${list[i].ref}: соседние ответы на ошибку начинаются одинаково («${opener(list[i])})») — не подряд`)
  return out
}

function checkNumberTraps(nodes) {
  return nodes.filter(n => n.type === 'phrase_assembly' && (n.data?.words ?? []).some(w => NUMBERS.has(String(w).toLowerCase())))
    .filter(n => !(n.data?.distractors ?? []).some(d => NUMBERS.has(String(d?.text ?? d).toLowerCase())))
    .map(n => `[R-number-trap] ${n.ref} (phrase_assembly): во фразе время («${(n.data.words ?? []).find(w => NUMBERS.has(String(w).toLowerCase()))}»), а среди ловушек нет другой цифры — добавь, иначе время угадывается без выбора`)
}

function checkYesNoScript(nodes) {
  return nodes.filter(n => n.type === 'table' && n.data?.mode === 'dictator' && /(^|[,.] )(да|нет)[,.]/i.test(String(n.data?.script ?? '')))
    .map(n => `[R-yes-no-script] ${n.ref} (table): в озвучке «да»/«нет» читаются как ячейки — робот; проговори строку фразой («go home, иди домой, это движение»)`)
}

export function checkAuthorRules(nodes) {
  return [...checkBanned(nodes), ...checkListenCap(nodes), ...checkAdjacentOpeners(nodes), ...checkNumberTraps(nodes), ...checkYesNoScript(nodes)]
}
