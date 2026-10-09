// Подсказка «Зажми, чтобы замедлить» в режиме «Ловли слов»: правая полоса видео над накрытием (FeedSlowStrip) тоже
// замедляет видео, и новичку об этом говорим — НЕЗАВИСИМО от обычной подсказки ленты (useSlowMotionHint.js: свой
// счётчик, свой ключ localStorage, не трогает ни её «видел», ни игноры). Чистые правила; состояние и таймер — в
// useCatchSlowHint.js.
//   — показывается, пока накрытие открыто и звук включён (замедление со звуком), первые CATCH_HINT_MAX раз;
//   — «раз» считается, только когда подсказка реально появилась на экране (после выезда накрытия, CATCH_HINT_DELAY_MS);
//   — замедлением в полосе воспользовались — больше не показываем (retiredShows).
export const CATCH_HINT_KEY = 'pithy_catch_slowmo_hint_v1'
export const CATCH_HINT_MAX = 3
export const CATCH_HINT_DELAY_MS = 350 // накрытие выезжает 260мс — подсказка появляется следом, не в кадрах выезда

// Сколько раз подсказку уже показали (мусор в хранилище — как ноль)
export const parseShows = raw => {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), CATCH_HINT_MAX) : 0
}

// Можно ли показать подсказку сейчас
export const canShowCatchHint = ({ shows, open, soundOn }) => !!open && !!soundOn && parseShows(shows) < CATCH_HINT_MAX

// Счётчик после очередного реального показа
export const nextShows = shows => Math.min(CATCH_HINT_MAX, parseShows(shows) + 1)

// Значение счётчика «воспользовался — больше не показывать»
export const retiredShows = () => CATCH_HINT_MAX
