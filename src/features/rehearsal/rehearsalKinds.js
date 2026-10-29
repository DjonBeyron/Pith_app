// Типы стадий «Репетиции с Питом» и их «движковый» вид. Директор игры (useWordLaneFlow) умеет только announce / turn / dictor / student / order / discern; репетиция добавляет свои типы стадий,
// но каждый из них — либо один из этих видов (движок пилюль работает как раньше), либо экран без движка (mirror, summary). Лист без зависимостей: его читают и wordLaneStages, и директор.
//  warmup — разминка: слово по переводу, ученик (движок: student);
//  read   — читка: диктор говорит всю фразу, куски подсвечиваются по очереди (движок: dictor);
//  take   — дубль: вся фраза один раз как обычная ступень ученика (движок: student); на ней идёт запись голоса (useRehearsalTake);
//  mirror — экран сравнения «Пит / Ты» (WordLaneMirror, без движка); summary — итог.
const ENGINE = { warmup: 'student', take: 'student', read: 'dictor' }

/** Вид стадии для движка: warmup и take — ученик, read — диктор, остальное как есть (mirror и summary — экраны без пилюль) */
export const engineKind = stage => (stage ? ENGINE[stage.type] ?? stage.type : null)

/** Стадия, на которой ученик говорит (слушатель Vosk, микрофон, конвейер пилюль) */
export const isStudentStage = stage => engineKind(stage) === 'student'
