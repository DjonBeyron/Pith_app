// Обучающая подсказка «зажми — замедли видео»: когда появляется и когда исчезает насовсем. Чистые функции
// (useSlowMotionHint.js держит состояние и таймеры).
//   — появляется на 3-м видео ленты при первом же посещении (ARM_AT_VIDEO) и остаётся на следующих видео, пока ею не
//     воспользуются;
//   — каждое видео, с которого ушли, не воспользовавшись подсказкой, — «проигнорировано»; после MAX_IGNORED таких
//     подсказка пропадает насовсем (новичок её не хочет — не навязываем).
export const ARM_AT_VIDEO = 3
export const MAX_IGNORED = 3

// viewed — сколько видео уже показано в этом посещении ленты (текущее — тоже)
export const shouldArm = ({ viewed, seen }) => !seen && viewed >= ARM_AT_VIDEO

// Ушли с видео, на котором висела подсказка, — → { ignored, retire }: сколько уже проигнорировано и пора ли убрать
export function swipeAway(ignored) {
  const next = (Number(ignored) || 0) + 1
  return { ignored: next, retire: next >= MAX_IGNORED }
}
