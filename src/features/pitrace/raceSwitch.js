// Переключение слуха в игре «Встряхни память» (CONCEPT_RACE.md, «Русская модель»): проход A слушает английская модель Vosk, проход B — русская. Две модели в памяти iPhone вместе держать рискованно (≈40–50 МБ архивов,
// после распаковки в воркере в разы больше), поэтому ПЕРЕД проходом B английская выгружается, потом загружается русская; в «Полной гонке» перед «Вершиной» (говорят по-английски) — наоборот; после последнего русского этапа
// (итог) английскую возвращаем тоже, чтобы следующая игра в этом же приложении нашла её в памяти. Чистая логика с подставляемыми зависимостями (проверяется без браузера): runtime-объекты — voskRuntime.js (evict / acquire / whenSettled / expect / warmNow).
//  • toRu(): en.evict → пауза SETTLE_MS (распаковка библиотеки стирает общую базу IndexedDB — выгрузка английской делает это с задержкой 600 мс, русская не должна грузиться раньше) → ru.acquire → ждём готовности ≤ READY_MS;
//    не вышло — русскую отпускаем, английскую возвращаем, результат { ok: false } (директор переводит проход B на тап);
//  • toEn(): ru отпущена и выгружена → пауза SETTLE_MS → en.warmNow('switch'). Пока идёт переключение, у принимающей модели expect(true): слушатели ждут её, а не сообщают «нет модели».
export const SWITCH_MS = 1500   // плашка «секунду, переключаю слух»: столько держится стадия (русская догружается дальше, пилюли и слушатель ждут её)
export const SETTLE_MS = 700    // между выгрузкой одной модели и загрузкой другой
export const READY_MS = 20000   // русская модель должна быть в памяти не позже

export function createSwitcher({ en, ru, setTimer = setTimeout, log = () => {} }) {
  let state = 'en'      // en | switching | ru
  let releaseRu = null
  let queue = Promise.resolve() // переключения идут строго по очереди: второй вызов ждёт первый
  const sleep = ms => new Promise(r => setTimer(r, ms))
  const later = fn => (queue = queue.then(fn, fn))

  async function backToEn(why) {
    if (state === 'en') return
    state = 'switching'; en.expect(true)
    try { releaseRu?.() } catch { /* уже отпущена */ }
    releaseRu = null
    ru.evict(`игра: ${why}`)
    await sleep(SETTLE_MS)
    en.warmNow('switch'); en.expect(false)
    state = 'en'
    log(`слух: английская модель возвращена (${why})`)
  }

  async function forRu() {
    if (state === 'ru') return { ok: true }
    const t0 = Date.now()
    state = 'switching'; ru.expect(true)
    en.evict('игра: русский проход')
    await sleep(SETTLE_MS)
    releaseRu = ru.acquire('race')
    const r = await ru.whenSettled(READY_MS)
    if (r?.ok) { ru.expect(false); state = 'ru'; log(`слух: русская модель в памяти за ${Date.now() - t0} мс`); return { ok: true } }
    log(`слух: русская модель не включилась (${r?.text ?? 'без подробностей'}), проход на тапе`)
    await backToEn('русская не включилась')
    ru.expect(false) // только теперь: до этого слушатель прохода B ждёт модель, а не сообщает «нет модели» — директор сразу переведёт проход на тап (stage.demote)
    return { ok: false, text: r?.text ?? '' }
  }

  return {
    /** Английская выгружена, русская в памяти → { ok: true }; не включилась → английская возвращена, { ok: false, text } */
    toRu: () => later(forRu),
    /** Русская выгружена, английская возвращена (пауза SETTLE_MS внутри) */
    toEn: (why = 'назад') => later(() => backToEn(why)),
    state: () => state,
    /** Идёт переключение: сколько мс пилюлям подождать (0 — не идёт) */
    pendingMs: () => (state === 'switching' ? 250 : 0),
  }
}
