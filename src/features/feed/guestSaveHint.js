// Мягкая строка Пита гостю после первого лайка/закладки (B7, решение №14):
// «Пит сохранит лайки и закладки, если создашь аккаунт — это полминуты».
// Показывается ОДИН раз на устройстве, через два слайда после первого
// гостевого лайка/закладки, не модально. Тап по строке — форма входа.
// Пометка в localStorage: { at: когда первый лайк, shown: строку уже показали }.
export const GUEST_HINT_KEY = 'pithy_guest_like_hint_v1'
export const GUEST_HINT_SLIDES = 2
export const GUEST_HINT_MS = 4000
export const GUEST_HINT_TEXT = 'Пит сохранит лайки и закладки, если создашь аккаунт — это полминуты'

// likedAt — время первого гостевого лайка (null — лайков не было), slidesSince —
// сколько слайдов пролистано после него, shown — строку уже показывали
export function shouldShowGuestHint({ likedAt, slidesSince, shown }) {
  return !!likedAt && !shown && slidesSince >= GUEST_HINT_SLIDES
}

export function readGuestHint() {
  try {
    const v = JSON.parse(localStorage.getItem(GUEST_HINT_KEY) ?? 'null')
    if (v && typeof v === 'object') return { at: Number(v.at) || null, shown: !!v.shown }
  } catch { /* нет localStorage — как будто лайков не было */ }
  return { at: null, shown: false }
}

function writeGuestHint(v) {
  try { localStorage.setItem(GUEST_HINT_KEY, JSON.stringify(v)) } catch { /* нет localStorage */ }
}

// Первый гостевой лайк/закладка: запомнить момент (повторные ничего не меняют)
export function noteGuestLiked(now = Date.now()) {
  const cur = readGuestHint()
  if (!cur.at) writeGuestHint({ at: now, shown: cur.shown })
}

export function markGuestHintShown() {
  writeGuestHint({ at: readGuestHint().at ?? Date.now(), shown: true })
}
