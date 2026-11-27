// Диагностика голоса Мии в журнале (владелец 2026-11-27, повторная жалоба: «слышу „жжж“, тишина, потом „жёлтая зона“»): по ОДНОЙ строке на реплику, журнал игры пишется всегда, строка дешёвая (2 с звука = 20 окон); отключается флагом enabled. Строка отвечает на вопрос «файл или игра»:
//  • профиль самого файла — громкость окнами по 100 мс первых 2 с буфера, где звук начался и самая долгая тишина внутри (если в файле «всплеск — пауза — слово», это видно ещё ДО воспроизведения);
//  • что делала игра — источник стартовал с offset 0 (игра начало не срезает), длина буфера, часы игрового контекста через 100 мс после старта (идут ли они с реальным временем: прерванный контекст дал бы «заикание»).
// Всё внешнее приходит аргументами (тесты): профиль, часы, таймер, журнал.
export const PROBE_AFTER_MS = 100

/** Строка профиля: «…: окна 100 мс, дБ: −60 −14 …; звук с 100 мс; самая долгая тишина внутри: с 300 мс на 400 мс» */
export function profileLine({ id, ms, profile, offset = 0 }) {
  if (!profile) return `[audio] профиль начала ${id}: буфера нет (играет <audio>-слот), offset ${offset}`
  const quiet = profile.quiet ? `; тишина (< −55 дБ) внутри первых 2 с: с ${profile.quiet.from} мс на ${profile.quiet.ms} мс` : '; тишины внутри первых 2 с нет'
  return `[audio] профиль начала ${id}: буфер ${Math.round(ms)} мс, offset ${offset}; окна ${profile.winMs} мс, дБ: ${profile.db.join(' ')}; звук с ${profile.first ?? 'нет'} мс${quiet}`
}

/** Проба старта реплики Мии: one-shot, пишет профиль сразу и положение часов контекста через PROBE_AFTER_MS. enabled() — отладочный интерфейс включён. → probe({ id, key, ms }) */
export function createMiaProbe({ enabled = () => false, profileOf = () => null, ctxTime = () => null, now = () => performance.now(), setTimer = setTimeout, log = () => {} } = {}) {
  return ({ id, key, ms }) => {
    if (!enabled()) return
    log(profileLine({ id, ms, profile: profileOf(key) }))
    const c0 = ctxTime(), t0 = now()
    setTimer(() => {
      const c1 = ctxTime(), real = Math.round(now() - t0)
      log(`[audio] старт источника ${id}: через ${real} мс часы игры прошли ${c0 == null || c1 == null ? 'нет данных' : `${Math.round((c1 - c0) * 1000)} мс`} (должны ≈ ${real}), контекст ${c1 == null ? '—' : 'есть'}`)
    }, PROBE_AFTER_MS)
  }
}
