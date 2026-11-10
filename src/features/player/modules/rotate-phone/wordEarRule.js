// «Честный зачёт слова» (v3.3.180, замечание владельца: «начал говорить начало слова, а он уже засчитал — „ванлер…“», цель wonderful). Слушатель слов (wordLaneListen.js) даёт Vosk грамматику только
// из цели и [unk], и Vosk в ЧЕРНОВИКЕ выдаёт ближайшее слово грамматики уже по началу звука: замер реальным Vosk EN (espeak, 3 скорости) — черновик «wonderful» приходит через ≈ 270 мс после начала
// голоса и при 40 % слова, и при целом слове; итог Vosk честнее (обрубок — «», [unk] или conf 0,57–0,83, целое — conf 1). Правило (одно слово цели; фразы из нескольких слов — как раньше):
//  • ЛОВУШКИ: в грамматику добавляются начала слова (≥ 3 букв, до длины − 2: «won», «wonder», «inter», «interest»): слова, которых нет в словаре модели, Vosk молча выбрасывает, а настоящие дают
//    ему выдать обрубок вместо цели. Слово-ловушка — не цель и не промах (neutral убирает его из разбора).
//  • ЧЕРНОВИК засчитывается сразу у слова в 1 слог; в 2 слога — если голос уже длится ≥ needMs (слоги × PER_SYL_MS); от 3 слогов (и короче needMs) — ждём ИТОГ: голос кончился (тишина
//    QUIET_MS) — просим итог захода (stop), он решает: слово цели с conf ≥ CONF_MIN и голосом ≥ needMs — зачёт, иначе нет
//    (обрубок «toge» Vosk иногда «дотягивает» до together с conf 1 — его выдаёт короткий голос). Голос дорос до needMs раньше (2 слога) — зачёт черновиком. Есть цель
//    от 3 слогов — итог просим по концу голоса и без черновика (с ловушками Vosk отдаёт черновик через ≈ 250 мс после голоса: так быстрее на ≈ 100 мс).
//  • Журнал: «[word-ear] черновик «wonderful» на 270 мс голоса (3 слога, ожидаю ≥ 360) — жду итог» / «… — зачёт», «голос кончился … — прошу итог», «итог «…» conf … — зачёт | не засчитано».
// Чистая логика над часами now(); слушатель зовёт level() на каждый кусок звука, draft() на черновик с новой целью, finalText() на итог.
export const EAR_VOICE_RMS = 0.015 // голос — кусок звука громче (как порог голоса стенда: 2,5 × затвор тишины)
export const EAR_GAP_MS = 350      // тишина короче — то же высказывание
export const PER_SYL_MS = 120      // ожидаемый минимум голоса на слог (быстрая речь ≈ 150–180 мс на слог)
export const LONG_SYL = 3          // от стольких слогов черновик не засчитывается без итога
export const QUIET_MS = 150        // голос кончился: тишина столько мс — просим итог
export const CONF_MIN = 0.7        // итог по просьбе правила: слово цели с conf ниже — не засчитано
export const WAIT_MAX_MS = 2500    // ждём итог не дольше (шум не даёт тишины) — просим его принудительно
export const EARLY_MIN_MS = 150    // итог по концу голоса без черновика — если голос шёл хотя бы столько (щелчок — не слово)
export const EAR_GRAMMAR_MAX = 60 // ловушек в грамматике не больше
const UNK = '[unk]'
const VOWELS = { en: /[aeiouy]+/g, ru: /[аеёиоуыэюя]+/g }

/** Слоги слова (группы гласных; английское немое «e» на конце не считается) */
export function syllables(word, lang = 'en') {
  const w = String(word ?? '').toLowerCase().replace(lang === 'ru' ? /[^а-яё]/g : /[^a-z]/g, '')
  if (!w) return 0
  const n = (w.match(lang === 'ru' ? VOWELS.ru : VOWELS.en) ?? []).length
  return Math.max(1, lang !== 'ru' && /[^aeiouy]e$/.test(w) && !/le$/.test(w) ? n - 1 : n)
}
export const needMs = (word, lang) => syllables(word, lang) * PER_SYL_MS
const single = t => !/\s/.test(String(t ?? '').trim())

/** Ловушки для целей: начала одиночных слов в ≥ 2 слога (≥ 6 букв), без совпадений с самими целями */
export function earDecoys(targets, lang = 'en') {
  const letters = lang === 'ru' ? /^[а-яё]+$/ : /^[a-z]+$/
  const own = new Set(targets.map(t => String(t).toLowerCase().trim()))
  const out = new Set()
  for (const t of targets) {
    const w = String(t ?? '').toLowerCase().trim()
    if (!single(w) || !letters.test(w) || w.length < 6 || syllables(w, lang) < 2) continue
    for (let n = 3; n <= w.length - 2; n++) for (const d of lang === 'ru' ? [w.slice(0, n)] : [w.slice(0, n), `${w.slice(0, n)}y`, `${w.slice(0, n)}e`]) if (!own.has(d) && d !== w) out.add(d) // «beaut» → «beauty»
  }
  return [...out]
}

export function createWordEar({ targets, lang = 'en', hit = () => false, now = () => Date.now(), log = () => {} }) {
  const decoys = earDecoys(targets, lang), trap = new Set(decoys)
  const early = targets.some(t => single(t) && syllables(t, lang) >= LONG_SYL) // есть длинное слово: итог просим по концу голоса, не дожидаясь черновика (Vosk с ловушками отдаёт его через ≈ 250 мс после голоса)
  let on = null, last = null, pend = null, asked = false, fresh = false // fresh — в заходе был голос, ещё не разобранный ни зачётом, ни итогом
  const voiceMs = () => (on == null ? 0 : last - on)
  const words = raw => String(raw ?? '').toLowerCase().split(/\s+/).filter(w => w && w !== UNK && !trap.has(w))
  return {
    decoys,
    /** Сырой текст Vosk без слов-ловушек (ловушка — ни цель, ни промах) */
    neutral: raw => (trap.size ? String(raw ?? '').split(/\s+/).filter(w => w && !trap.has(w.toLowerCase())).join(' ') : raw),
    /** Кусок звука → { ok: seq } (ждали — голос дорос, засчитать) | { final: true } (голос кончился — просить итог) | null */
    level(rms) {
      const t = now()
      if (rms >= EAR_VOICE_RMS) { if (on == null || t - last > EAR_GAP_MS) on = t; last = t; fresh = true }
      if (asked) return null
      if (!pend) {
        if (!early || !fresh || voiceMs() < EARLY_MIN_MS || t - last < QUIET_MS) return null
        asked = true; fresh = false
        log(`голос кончился (${voiceMs()} мс, тишина ${Math.round(t - last)} мс) — прошу итог, не дожидаясь черновика`)
        return { final: true }
      }
      if (pend.syl < LONG_SYL && voiceMs() >= pend.need) { log(`черновик «${pend.word}»: голос дорос до ${voiceMs()} мс (ожидаю ≥ ${pend.need}) — зачёт`); const { seq } = pend; pend = null; return { ok: seq } }
      const quiet = last != null && t - last >= QUIET_MS
      if (quiet || t - pend.at >= WAIT_MAX_MS) { asked = true; fresh = false; log(quiet ? `голос кончился (${voiceMs()} мс, тишина ${Math.round(t - last)} мс) — прошу итог` : `итога нет ${WAIT_MAX_MS} мс — прошу итог`); return { final: true } }
      return null
    },
    /** Черновик с новой целью (seq — счёт с ней, target — текст цели, raw — черновик) → true: засчитать сейчас, false: ждём (pending) */
    draft(seq, target, raw) {
      const heard = words(raw).at(-1) ?? String(target)
      if (!single(target)) return true
      const syl = syllables(heard, lang), need = syl * PER_SYL_MS, v = voiceMs()
      const ok = syl <= 1 || (syl < LONG_SYL && v >= need)
      const was = pend
      pend = ok ? null : { seq, word: heard, syl, need, at: was?.at ?? now() }
      if (ok) fresh = false
      if (!was || ok) log(`черновик «${heard}» на ${v} мс голоса (${syl} слог${syl === 1 ? '' : syl < 5 ? 'а' : 'ов'}, ожидаю ≥ ${need}) — ${ok ? 'зачёт' : syl >= LONG_SYL ? 'жду итог' : 'жду голос или итог'}`)
      return ok
    },
    pending: () => pend,
    /** Итог захода: если ждали — слово цели не засчитано ([unk]), если conf < CONF_MIN или голос короче needMs слова (обрубок, который Vosk «дотянул» до целого: «toge» → together conf 1). → текст для разбора */
    finalText(raw, list) {
      const p = pend, was = asked
      pend = null; asked = false
      if (!p && !was) return raw
      const ws = Array.isArray(list) && list.length ? list : String(raw ?? '').split(/\s+/).filter(Boolean).map(word => ({ word, conf: 1 }))
      const v = voiceMs(), real = w => w.word !== UNK && !trap.has(String(w.word).toLowerCase())
      const why = w => (Number(w.conf ?? 1) < CONF_MIN ? 'conf' : single(w.word) && v < needMs(w.word, lang) ? 'голос' : '')
      const out = ws.map(w => (real(w) && why(w) ? UNK : w.word))
      const info = ws.filter(real).map(w => `${w.word} conf ${Math.round(Number(w.conf ?? 1) * 100) / 100}${w.end != null && w.start != null ? `, по Vosk ${Math.round((w.end - w.start) * 1000)} мс` : ''}, голос ${v} мс (ожидаю ≥ ${needMs(w.word, lang)})${why(w) ? ` — ${why(w) === 'conf' ? `conf < ${CONF_MIN}` : 'голос короче'}` : ''}`).join('; ')
      log(`итог «${ws.map(w => w.word).join(' ')}»${info ? `: ${info}` : ''} — ${hit(out.join(' ')) ? 'зачёт' : `не засчитано${p ? ` (черновик был «${p.word}»)` : ''}`}`)
      return out.join(' ')
    },
    /** Конец захода: голос и ожидание сначала */
    reset() { pend = null; asked = false; fresh = false },
  }
}

/** Грамматика с ловушками: base — грамматика целей (JSON-массив вариантов), ловушки — отдельными вариантами (по одной: обрубок говорят один раз). Не больше EAR_GRAMMAR_MAX ловушек */
export function earGrammar(base, decoys) {
  if (!base || !decoys?.length) return base
  try { const list = JSON.parse(base); return JSON.stringify([...list, ...decoys.slice(0, EAR_GRAMMAR_MAX).filter(d => !list.includes(d))]) } catch { return base }
}
