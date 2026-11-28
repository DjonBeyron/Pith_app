// «Голос без слов цели» → красное (v3.3.401, владелец iPhone: «первое слово неверное, говорю очень громко — визуально ничего»). Решение слушателя фраз (racePhraseListen.js) по ИТОГУ захода, чистая функция.
//  • ЖЁСТКОЕ (как было с v3.3.311, проход 1): голос ≥ PEAK_MIN, нового слова цели нет — красное ожидаемое слово и рывок.
//  • МЯГКОЕ (новое, красное слово без рывка): на ПЕРВОМ слове (в этой попытке ещё ни одно не принято) Vosk не вернул ни одного слова цели (итог пуст / «[unk]») — а голос явно речь: пик ≥ LOUD_PEAK
//    (3 × PEAK_MIN; живая речь iPhone 0,017–0,13, фон комнаты и эхо ≤ 0,011), детектор голоса его признал, звук ≥ SOFT_VOICE_MS. Закрывает проход 2 (жёсткого там не было вовсе: итог пуст / «[unk]» — тишина).
//    Проход 1 мягким не трогаем: там жёсткое уже покрывает всё, кроме «выдоха» (пустой итог после ≥ LONG_VOICE_MS сплошного звука — дыхание в микрофон, решение владельца v3.3.318 «красного нет»).
//    Шум / тихий голос / короткий звук / верное слово — по-прежнему без красного. Красное — только вид: зачёт, жизни и серию не трогает.
import { PEAK_MIN } from './racePhraseDraftHold.js'

export const LOUD_PEAK = PEAK_MIN * 3
export const SOFT_VOICE_MS = 400

/** → null | { why, peak, soft? }. kind — 'partial' | 'final' (решаем только по итогу); text — слова цели в итоге (пусто — Vosk не вернул ни одного); breath — «выдох» (пустой долгий итог); progressed — в заходе принято новое слово;
 *  anySaid — в попытке уже принято слово (не первое); noise / voiced / peak — защита шума (racePhraseDraftHold); voiceMs — длина голоса по Vosk (null — не известна) */
export function voiceWrong({ kind, wordByWord, text, breath, progressed, anySaid, noise, voiced, peak, voiceMs }) {
  if (kind !== 'final') return null
  if (wordByWord && !breath && !progressed && !noise && peak >= PEAK_MIN) return { why: 'voice', peak }
  if (breath || text || anySaid || progressed || noise || !voiced || peak < LOUD_PEAK) return null // «выдох» (v3.3.318: дыхание в микрофон iPhone даёт пик 0,19 и ≥ 1,5 с сплошного звука) красного не получает — решение владельца
  if (voiceMs != null && !(voiceMs >= SOFT_VOICE_MS)) return null
  return { why: 'voice-soft', soft: true, peak }
}
