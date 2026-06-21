import { useState, useEffect } from 'react'

const PHOTO_COLORS = [
  '#6366f1','#ec4899','#f59e0b','#10b981',
  '#3b82f6','#ef4444','#8b5cf6','#14b8a6',
  '#f97316','#06b6d4','#84cc16','#a855f7',
]

function usePhotoSrc(ph, lessonFiles = []) {
  const [src, setSrc] = useState(null)
  useEffect(() => {
    if (!ph) { setSrc(null); return }
    // Saved lesson: photoUrl is r2Url injected on save
    if (ph.photoUrl) { setSrc(ph.photoUrl); return }
    // Local preview: resolve fileId via lessonFiles
    if (ph.fileId) {
      const f = lessonFiles.find(lf => lf.id === ph.fileId)
      if (f?.r2Url) { setSrc(f.r2Url); return }
      if (f?.localFile) {
        const u = URL.createObjectURL(f.localFile)
        setSrc(u)
        return () => URL.revokeObjectURL(u)
      }
    }
    setSrc(null)
  }, [ph, lessonFiles])
  return src
}

export default function PhotoChoiceModule({ node, lessonFiles, photoChoiceState }) {
  if (!photoChoiceState || photoChoiceState.selected == null) return null

  const photos  = node.typeData?.photo_choice?.photos ?? []
  const { selected, result } = photoChoiceState
  const photo = photos[selected] ?? null
  const isOk  = result === 'correct'

  const src = usePhotoSrc(photo, lessonFiles)

  return (
    <div className="playerMsgRow playerMsgRowRight">
      <div
        className={`pcAnswerPhoto ${isOk ? 'pcAnswerPhotoOk' : 'pcAnswerPhotoErr'}`}
        style={src ? {} : { background: PHOTO_COLORS[selected % PHOTO_COLORS.length] }}
      >
        {src
          ? <img src={src} className="pcAnswerImg" alt="" />
          : <span className="pcAnswerIdx">{selected + 1}</span>
        }
      </div>
    </div>
  )
}
