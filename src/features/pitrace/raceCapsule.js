// Герой «Вершины» — капсула с растущей фразой (CONCEPT_RACE.md, раунд 3): чистая геометрия без React и DOM, по ней RaceHero.jsx строит капсулу и прыжки.
//  • Текст капсулы — первые rung слов фразы (на земле капсула пустая и узкая); взял ступень — новое слово влетает, капсула удлиняется; соскок — последнее слово вылетает на остров, капсула укорачивается;
//  • ширина не больше CAP_MAX_VW % экрана, шрифт уменьшается по длине текста (от CAP_FONT_MAX до CAP_FONT_MIN px), дальше текст переносится на вторую строку;
//  • ширины и шрифт — строки CSS (vw, calc, clamp): экран и шрифт браузера знает только он, поэтому ничего не меряем; --cw (оценка ширины) ставится на героя, по нему capLeft прижимает капсулу к краям экрана
//    (центр не ближе половины ширины + CAP_EDGE_PX от края). capLeft — и положение героя, и кадры прыжка (WAAPI интерполирует left между двумя такими строками).
export const CAP_MAX_VW = 86     // ширина капсулы не больше, % ширины экрана
export const CAP_FONT_MAX = 17   // шрифт короткого текста, px
export const CAP_FONT_MIN = 12   // шрифт не мельче, px
export const CAP_PAD_PX = 28     // поля капсулы слева и справа (с обводкой), px
export const CAP_EM = 0.56       // средняя ширина буквы в долях шрифта (оценка для --cw и --cf)
export const CAP_MIN_PX = 34     // пустая капсула на земле
export const CAP_EDGE_PX = 8     // зазор от края экрана
export const CAP_WORD_IN_MS = 350 // слово влетает в капсулу

/** Текст капсулы героя на ступени rung: первые rung слов фразы */
export const capText = (words, rung) => words.slice(0, Math.max(0, rung)).join(' ')

/** Слово, которое вылетает из капсулы при соскоке со ступени from на ступень to (to < from): слово ступени from; иначе '' */
export const outWord = (words, from, to) => (to < from ? words[from - 1] ?? '' : '')

/** Шрифт капсулы по длине текста len (символов) — строка CSS: длиннее текст — мельче шрифт, в пределах CAP_FONT_MIN…CAP_FONT_MAX */
export const capFont = len => `clamp(${CAP_FONT_MIN}px, calc((${CAP_MAX_VW}vw - ${CAP_PAD_PX}px) / ${(Math.max(1, len) * CAP_EM).toFixed(2)}), ${CAP_FONT_MAX}px)`

/** Оценка ширины капсулы по длине текста len — строка CSS (используется только для прижатия к краям; сама капсула растёт по тексту) */
export const capWidth = len => `max(${CAP_MIN_PX}px, min(${CAP_MAX_VW}vw, calc(${(Math.max(0, len) * CAP_EM).toFixed(2)} * var(--cf) + ${CAP_PAD_PX}px)))`

/** Положение героя по горизонтали — строка CSS для left: центр на дорожке (доля ширины x), но капсула целиком в экране (читает --cw героя) */
export const capLeft = x => `clamp(calc(var(--cw) / 2 + ${CAP_EDGE_PX}px), ${(x * 100).toFixed(2)}%, calc(100% - var(--cw) / 2 - ${CAP_EDGE_PX}px))`

/** Стиль героя по длине текста: переменные шрифта и ширины */
export const capVars = len => ({ '--cf': capFont(len), '--cw': capWidth(len) })
