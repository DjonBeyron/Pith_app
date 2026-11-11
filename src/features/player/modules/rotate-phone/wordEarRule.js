// «Честный зачёт слова» (v3.3.180; переделан в v3.3.183 по двум отчётам владельца со стенда, iPhone: «не считывает» — цель interesting, 18 попыток, 0 зачётов; «не ждёт окончания, ложно
// срабатывает» — milk засчитан на «mil…», window — на «win…»). Слушатель слов (wordLaneListen.js) даёт Vosk закрытую грамматику, и Vosk выдаёт цель уже по началу звука. Правило (цели — одно слово;
// цели-фразы из нескольких слов засчитываются черновиком, как раньше):
//  • ЛОВУШКИ (wordEarDecoys.js): слова-соседи цели в грамматике — обрубку есть чем стать, кроме цели. Слово-ловушка — не цель и не промах (neutral убирает его из разбора).
//  • ЗАЧЁТ — ТОЛЬКО ПО ИТОГУ, когда слово договорено: черновик с целью последним словом не засчитывается никогда (раньше 1 слог — сразу, 2 слога — по длине голоса: «mil», «win» проходили).
//    Слово в черновике, после которого уже идёт другое («try try», «i'm trying»), договорено — засчитывается сразу: серия слов подряд не ждёт пауз.
//  • КОНЕЦ СЛОВА — голос кончился и молчит QUIET_MS. Голос считает wordEarVoice.js: порог от шума микрофона и пика речи (тихий микрофон iPhone работает как громкий), тихие согласные
//    внутри слова — голос. Тогда просим у Vosk итог захода (stop «ear»), и он решает: слово цели с conf ≥ CONF_MIN и голосом ≥ слоги × PER_SYL_MS — зачёт; ловушка, [unk], низкий conf — нет.
//    На ступени, где есть и цели-фразы, пока черновик не показал цель-слово, ждём тишину QUIET_PHRASE_MS: пауза между словами фразы («to … learn») заход не обрывает.
//  • Журнал объясняет каждое решение: «голос начался: rms … ≥ порог …», «пауза внутри речи 130 мс — жду дальше», «голос кончился: шёл 610 мс, тишина 232 мс … — прошу итог»,
//    «итог «mill»: mill — ловушка (обрубок цели) conf 0.5 — не засчитано: слово не договорено», «итог «milk»: milk conf 1, по Vosk 540 мс, голос 480 мс (ожидаю ≥ 120) — зачёт».
// v3.3.186 (отчёт владельца: «house» без конца засчитан — «я уверен, что не говорю окончания»; «nice» — 20 попыток, 0 зачётов):
//  • ловушки — ПО ЗВУКУ, из таблицы произношений (wordEarDecoys.js → shared/lib/vosk/phones): настоящие слова, модель их не выбрасывает; таблица грузится лениво, поэтому ловушки
//    пересобираются перед заходом, когда она пришла (get decoys). Журнал называет ловушки каждого слова и те, что отброшены как не слова;
//  • голос считает общий счётчик shared/lib/vosk/voskVoice.js — тот же экземпляр слушатель отдаёт затвору тишины движка: что правило назвало голосом, то ушло в Vosk (и усилено,
//    voskAgc.js). Сторож: «⚠ звук не дошёл до Vosk: затвор закрыт N мс из M мс голоса»; в строке итога — сколько голоса ушло в Vosk и с каким усилением.
// Чистая логика над часами now(); слушатель зовёт level() на каждый кусок звука, draft() на черновик с новой целью, finalText() на итог.
import { createEarVoice, voiceNote, EAR_GAP_MS } from '../../../../shared/lib/vosk/voskVoice.js'
import { earPlan, syllables, single, normWord } from './wordEarDecoys.js'
import { phonesOf } from '../../../../shared/lib/vosk/phones/phoneTable.js'
export { earDecoys, earGrammar, syllables } from './wordEarDecoys.js'

export const PER_SYL_MS = 120      // ожидаемый минимум голоса на слог (быстрая речь ≈ 150–180 мс на слог)
export const QUIET_MS = 220        // голос кончился: тишина столько мс — просим итог (смычка «t», «k» внутри слова — до ≈ 150–200 мс; замер — _stand/word_ear)
export const QUIET_PHRASE_MS = 600 // на ступени есть и цели-фразы: пока черновик не показал цель-слово, итог просим только после такой тишины — пауза между словами фразы («to … learn») заход не обрывает
export const CONF_MIN = 0.6        // итог: слово цели с conf ниже — не засчитано. С ловушками conf — доля цели против ВСЕХ её соседей вместе: обрубок делит её с соседом («ka…» — cat или calf),
                                   // целое слово с ясным концом забирает почти всю. Замер v3.3.186 (фонетические ловушки, 768 прогонов): порог 0,35 → 0,6 убирает четверть ложных зачётов обрубков
                                   // ценой 3 целых слов из 173 (до v3.3.186 ловушки по буквам модель выбрасывала, conf был почти всегда 1 — порог ничего не решал и стоял 0,35)
export const CONF_MIN_RU = 0.7     // русская модель: ловушек-соседей меньше (только начала длинных слов) — conf решает больше (замер v3.3.180: обрубок 0,57–0,83)
export const WAIT_MAX_MS = 2500    // ждём итог не дольше (шум не даёт тишины) — просим его принудительно
export const EARLY_MIN_MS = 90     // итог по концу голоса без черновика — если голос шёл хотя бы столько (щелчок — не слово)
export const GAP_LOG_MS = 80       // пауза внутри речи короче — в журнал не идёт
const UNK = '[unk]'
export const needMs = (word, lang) => syllables(word, lang) * PER_SYL_MS
const r2 = v => Math.round(Number(v ?? 1) * 100) / 100
export const confMin = lang => (lang === 'ru' ? CONF_MIN_RU : CONF_MIN)

/** own — слова целей во всех записях грамматики («i'm» и «i am»): ловушки их не содержат; hit(текст) — есть ли в тексте цель */
export function createWordEar({ targets, lang = 'en', own = [], hit = () => false, now = () => Date.now(), log = () => {}, voice = createEarVoice({ now }) }) {
  let decoys = [], trap = new Set(), bare = new Set(), built // bare — слова без слов-соседей: итогу не с чем их сверить; built — с какой таблицей произношений собраны ловушки
  const some = (list, n = 14) => (list.length > n ? `${list.slice(0, n).join(', ')}, … ещё ${list.length - n}` : list.join(', '))
  const sync = () => { // ловушки пересобираются, когда догрузилась таблица произношений (phoneTable.js): следующий заход идёт уже с фонетическими
    const table = phonesOf(lang)
    if (built === table) return
    built = table
    const plan = earPlan(targets, lang, own, table)
    decoys = plan.list; trap = new Set(decoys.flatMap(d => d.split(' ')))
    bare = new Set(targets.filter(single).map(normWord).filter(w => !plan.words.find(p => p.word === w)?.took.length))
    for (const p of plan.words) {
      log(!p.took.length ? `ловушек у «${p.word}» нет${p.dropped.length ? ` (по буквам вышли не слова: ${some(p.dropped, 6)})` : ''}: обрубок Vosk может принять за целое слово`
        : p.kind === 'звук' ? `ловушки «${p.word}» по звуку (${p.took.length}, все есть в словаре модели): ${some(p.took)}`
          : p.sure ? `ловушки «${p.word}» по буквам (слова нет в таблице произношений; ${p.took.length} — слова, модель их примет): ${some(p.took)}${p.dropped.length ? `; отброшены как не слова: ${some(p.dropped, 6)}` : ''}`
            : `ловушки «${p.word}» по буквам без проверки (таблица произношений ещё не загружена; ${p.took.length}): ${some(p.took, 8)} — которых нет в словаре модели, те она молча выбросит`)
    }
  }
  sync()
  const strict = targets.some(single) // есть цель-слово: итог просим по концу голоса, не дожидаясь черновика, и проверяем любой итог
  const mixed = strict && !targets.every(single) // вперемешку с фразами: без черновика с целью-словом ждём тишину подольше (QUIET_PHRASE_MS)
  const neutral = raw => (trap.size ? String(raw ?? '').split(/\s+/).filter(w => w && !trap.has(w.toLowerCase())).join(' ') : raw)
  let pend = null, asked = null, fresh = false // fresh — в заходе был голос, ещё не разобранный ни зачётом, ни итогом; asked — { ms } голоса на момент просьбы итога (null — правило голоса не слышало)
  const deaf = () => { const q = voice.quietMs(); return q == null || q > EAR_GAP_MS } // Vosk слово слышит, а правило голоса — нет (речь тише порога начала): тишину считаем от последней смены черновика
  return {
    /** Ловушки для грамматики захода (слушатель берёт их перед каждым заходом) */
    get decoys() { sync(); return decoys },
    /** Сырой текст Vosk без слов-ловушек (ловушка — ни цель, ни промах) */
    neutral,
    /** Кусок звука → { final: true } (голос кончился — просить итог) | null */
    level(rms) {
      const t = now(), v = voice.push(rms)
      if (!strict) return null
      if (v.started) log(`голос начался: rms ${Math.round(rms * 1e4) / 1e4} ≥ порог ${voice.state().on} (шум ${voice.state().noise})`)
      else if (v.gap >= GAP_LOG_MS) log(`пауза внутри речи ${Math.round(v.gap)} мс (самый тихий кусок ${v.low ?? '—'}, короче ${QUIET_MS} мс) — жду дальше`)
      if (v.voice) fresh = true
      if (asked) return null
      const blind = pend?.from != null && deaf(), quiet = blind ? t - pend.from : voice.quietMs(), over = pend && t - pend.at >= WAIT_MAX_MS, need = pend || !mixed ? QUIET_MS : QUIET_PHRASE_MS
      if (!over && !(quiet != null && quiet >= need && (pend || (fresh && voice.ms() >= EARLY_MIN_MS)))) return null
      asked = { ms: fresh ? voice.ms() : null }; fresh = false
      log(over && !(quiet >= QUIET_MS) ? `тишины нет ${WAIT_MAX_MS} мс (${voiceNote(voice.state())}) — прошу итог`
        : blind ? `голос тише порога начала ${voice.state().on} (шум ${voice.state().noise}) — правило его не слышит; черновик не меняется ${Math.round(quiet)} мс ≥ ${need} — прошу итог`
          : `голос кончился: шёл ${voice.ms()} мс, тишина ${Math.round(quiet)} мс ≥ ${need} (${voiceNote(voice.state())}, тихие куски от ${voice.state().low ?? '—'}) — прошу итог${pend ? '' : ', не дожидаясь черновика'}`)
      return { final: true }
    },
    /** Черновик: next — счёт с новыми целями, have — сколько уже засчитано, raw — текст черновика → счёт, который можно засчитать сейчас, или null (ждём итог) */
    draft(next, have, raw) {
      if (next.length <= have) { if (pend?.from != null) pend.from = now(); return pend ? null : next } // черновик сменился — Vosk ещё слышит речь
      const target = targets[next.at(-1)], toks = String(raw ?? '').toLowerCase().split(/\s+/).filter(Boolean)
      if (!single(target)) { pend = null; return next } // фраза — как раньше
      const last = toks.at(-1) ?? '', word = toks.findLast(w => hit(w)) ?? last
      if (!hit(last) && last !== UNK && !trap.has(last)) { // после цели в черновике уже идёт другое СЛОВО цели: она договорена
        log(`черновик «${raw}»: после «${target}» идёт другое слово, значит оно договорено — зачёт`)
        pend = null; fresh = false
        return next
      } // после цели — [unk] или ловушка (v3.3.186): это звук, а не слово; обрубок «fro…» + шум давал «from [unk]» и засчитывался сразу — теперь ждёт итог, как последнее слово
      if (!pend || pend.seq.length !== next.length) log(`черновик «${raw}»: «${word}» — последнее слово${last === word ? '' : ` (после него «${last}» — не слово цели)`}, может быть не договорено (голос ${voice.ms()} мс, слогов ${syllables(word, lang)}) — жду конец голоса и итог`)
      pend = { seq: next, word, at: pend?.at ?? now(), from: deaf() ? now() : null }
      return next.length - 1 > have ? next.slice(0, -1) : null
    },
    pending: () => pend,
    /** Итог захода → текст для разбора: слово цели с conf < CONF_MIN или с голосом короче needMs заменяется на [unk] (не засчитано); ловушки уберёт neutral */
    finalText(raw, list, stats = null) {
      const p = pend, was = asked
      pend = null; asked = null
      if (stats?.gatedVoiceMs > 0) log(`⚠ звук не дошёл до Vosk: затвор закрыт ${stats.gatedVoiceMs} мс из ${stats.voiceMs} мс голоса`)
      if (!strict) return raw
      const ws = Array.isArray(list) && list.length ? list : String(raw ?? '').split(/\s+/).filter(Boolean).map(word => ({ word, conf: 1 }))
      const v = was ? was.ms : fresh ? voice.ms() : null, low = w => String(w.word).toLowerCase() // голос, мс (null — правило его не слышало: длину не сверяем)
      const span = need => (v == null ? 'голос тише порога — длину не сверяю' : `голос ${v} мс (ожидаю ≥ ${need})`)
      const goal = w => low(w) !== UNK && !trap.has(low(w)) && hit(low(w)) // слово-цель: к нему и применяются проверки
      const why = w => (!goal(w) ? '' : Number(w.conf ?? 1) < confMin(lang) ? 'conf' : v != null && v < needMs(w.word, lang) ? 'голос' : '')
      const out = ws.map(w => (why(w) ? UNK : w.word)).join(' ')
      if (!p && !was && !ws.some(goal)) return out // итог без цели и без ожидания — журналу нечего объяснять
      if (p && bare.has(p.word) && ws.every(w => low(w) === UNK) && (v == null || v >= needMs(p.word, lang))) { // слово без соседей: итогу не с чем его сверить, честность здесь — только «дождались конца голоса»
        log(`итог «${ws.map(w => w.word).join(' ')}»: слова в итоге нет, но в черновике было «${p.word}», а слов-соседей у него нет — сверить не с чем; ${span(needMs(p.word, lang))} — зачёт`)
        return p.word
      }
      const info = ws.filter(w => low(w) !== UNK).map(w => (trap.has(low(w)) ? `${w.word} — ловушка (обрубок цели) conf ${r2(w.conf)}`
        : `${w.word} conf ${r2(w.conf)}${w.end != null && w.start != null ? `, по Vosk ${Math.round((w.end - w.start) * 1000)} мс` : ''}${goal(w) ? `, ${span(needMs(w.word, lang))}${why(w) ? ` — ${why(w) === 'conf' ? `conf < ${confMin(lang)}` : 'голос короче'}` : ''}` : ''}`)).join('; ')
      const no = ws.some(w => why(w) === 'conf') ? 'Vosk не уверен, что слово сказано целиком' : ws.some(w => why(w) === 'голос') ? 'голос короче слова' : ws.some(w => trap.has(low(w))) ? 'слово не договорено' : 'цель не услышана'
      const fed = stats?.voiceMs != null ? `; в Vosk ушло: голос ${stats.voiceMs} мс${stats.agcMax > 1 ? `, усиление до ×${stats.agcMax}` : ''}, тишины не отдано ${stats.gatedMs ?? 0} мс` : ''
      log(`итог «${ws.map(w => w.word).join(' ')}»${info ? `: ${info}` : ''} — ${hit(neutral(out)) ? 'зачёт' : `не засчитано: ${no}${p ? ` (черновик был «${p.word}»)` : ''}`}${fed}`)
      return out
    },
    /** Конец захода: ожидание сначала (оценка шума и пик речи живут дальше — микрофон тот же) */
    reset() { pend = null; asked = null; fresh = false },
  }
}
