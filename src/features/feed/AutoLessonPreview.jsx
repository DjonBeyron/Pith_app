// Авто-превью для урока-закладки без своего видео/постера (StandaloneLessonRunner —
// у него нет video_url/poster_url модуля). Дизайн — по образцу карточки
// «подсвеченное слово в рамке с маячками сверху/снизу», фиолетовый акцент.
// Текст — название урока: адаптивный размер и перенос строк (в образце было
// одно короткое слово заглавными, у нас — целая фраза произвольной длины).
function fitFontSize(len) {
  if (len <= 8)  return '2.4rem'
  if (len <= 14) return '1.8rem'
  if (len <= 22) return '1.4rem'
  if (len <= 34) return '1.1rem'
  return '0.9rem'
}

// Маячок-капля: два зеркальных варианта — верхний висит НАД боксом остриём
// ВНИЗ (к боксу), нижний висит ПОД боксом остриём ВВЕРХ (тоже к боксу).
// Одна и та же форма, отражённая по вертикали — не «одна и та же капля
// дважды», как было раньше (снизу выглядело перевёрнутым).
function PinTeardrop({ flip = false }) {
  return (
    <svg
      className={`autoLessonPreviewPinSvg${flip ? ' autoLessonPreviewPinSvgFlip' : ''}`}
      viewBox="0 0 34 42" fill="none" xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M17 41.5 C15.5 37 3 24 3 17 C3 7.6 9.3 1 17 1 C24.7 1 31 7.6 31 17 C31 24 18.5 37 17 41.5Z" fill="#794ef9" />
    </svg>
  )
}

export default function AutoLessonPreview({ title }) {
  return (
    <div className="autoLessonPreview">
      <div className="autoLessonPreviewGlow" />
      {/* Статичная надпись сверху — дословно как в образце дизайна. Не
          притянуто за уши: каждый урок в этом приложении и есть разбор ОДНОГО
          целевого слова (см. lessonSchema.js), так что «об слове» тут в точку */}
      <div className="autoLessonPreviewCaption">Всё, что нужно знать об слове</div>
      <div className="autoLessonPreviewBoxWrap">
        <div className="autoLessonPreviewBox">
          <span className="autoLessonPreviewPin autoLessonPreviewPinLeft"><PinTeardrop /></span>
          <span className="autoLessonPreviewText" style={{ fontSize: fitFontSize(title.length) }}>{title}</span>
          <span className="autoLessonPreviewPin autoLessonPreviewPinRight"><PinTeardrop flip /></span>
        </div>
      </div>
    </div>
  )
}
