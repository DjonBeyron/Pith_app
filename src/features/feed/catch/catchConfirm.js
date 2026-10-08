// «Ловля слов» — подтверждение для «Раскрыть» и «Подсказать»: первые CONFIRM_TIMES раз
// (на каждую кнопку отдельно) показываем попап, потом нажатие срабатывает сразу.
export const CONFIRM_TIMES = 3
const KEY = 'pithy_catch_confirm_v1'

function read() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    return { reveal: Number(s?.reveal) || 0, hint: Number(s?.hint) || 0 }
  } catch {
    return null // приватный режим / битый JSON
  }
}

// Показывать ли попап для kind ('reveal' | 'hint'). Не смогли прочитать — показываем.
export function shouldConfirm(kind) {
  const s = read()
  return s ? s[kind] < CONFIRM_TIMES : true
}

// Попап показан ещё раз: счётчик этого kind +1
export function noteConfirmShown(kind) {
  const s = read() ?? { reveal: 0, hint: 0 }
  try { localStorage.setItem(KEY, JSON.stringify({ ...s, [kind]: (s[kind] || 0) + 1 })) } catch { /* приватный режим */ }
}

// Тексты попапа. memory — слово своё (уровень ≥2): подсказка сдвинет повтор на завтра.
export function confirmCopy(kind, memory) {
  if (kind === 'reveal') {
    return {
      title: 'Раскрыть фразу?',
      text: 'Фраза откроется целиком. Слова, которые ты не напечатал, в этот раз не засчитаются — но и не пострадают. Если хочешь, послушай ещё раз и попробуй',
      ok: 'Раскрыть',
      cancel: 'Ещё попробую',
    }
  }
  return {
    title: 'Подсказать?',
    text: memory
      ? 'Лишние буквы исчезнут — останутся только буквы слова. Для памяти это знак, что слово пока даётся непросто: мы напомним его завтра. Это нормально — так слова и запоминаются'
      : 'Лишние буквы исчезнут — останутся только буквы слова. На память это не повлияет',
    ok: 'Подсказать',
    cancel: 'Попробую сам',
  }
}
