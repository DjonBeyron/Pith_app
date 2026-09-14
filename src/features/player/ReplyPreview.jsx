import { useState } from 'react'
import { resolveReply } from './replyResolve.js'

// Player frame reference dimensions
const PLAYER_FW      = 200
const PLAYER_FH_VID  = PLAYER_FW * 12 / 9
const PLAYER_FH_CIRC = PLAYER_FW

const THUMB_H = 36
function thumbDims(type) {
  if (type === 'circle' || type === 'sticker') return { w: THUMB_H, h: THUMB_H }
  return { w: Math.round(THUMB_H * 9 / 12), h: THUMB_H }
}
function playerFH(type) {
  return type === 'circle' ? PLAYER_FH_CIRC : PLAYER_FH_VID
}
function cropK(type) { return THUMB_H / playerFH(type) }

function getThumbSrc(node, lessonFiles) {
  if (!node) return null
  const fileId = node.typeData?.[node.type]?.file_id
  if (!fileId) return null
  const file = lessonFiles.find(f => f.id === fileId)
  if (!file) return null
  if (node.type === 'photo') return file.blobUrl ?? file.r2Url ?? null
  return file.posterUrl ?? file.blobUrl ?? file.r2Url ?? null
}

function ReplyThumb({ type, src, crop = { x: 0, y: 0, scale: 1 } }) {
  const [natural, setNatural] = useState(null)
  const isSticker = type === 'sticker'
  const isCircle  = type === 'circle'
  const dims      = thumbDims(type)
  const K         = cropK(type)
  const radius    = isCircle ? '50%' : isSticker ? 4 : 5

  function imgStyle() {
    if (isSticker || !natural) {
      return { width: '100%', height: '100%', objectFit: isSticker ? 'contain' : 'cover' }
    }
    const ma = natural.w / natural.h
    const fa = dims.w / dims.h
    const d  = ma > fa
      ? { w: dims.h * ma, h: dims.h }
      : { w: dims.w, h: dims.w / ma }
    return {
      position: 'absolute', left: '50%', top: '50%',
      width: d.w, height: d.h,
      transform: `translate(calc(-50% + ${crop.x * K}px), calc(-50% + ${crop.y * K}px)) scale(${crop.scale})`,
      transformOrigin: 'center center',
    }
  }

  return (
    <div style={{ width: dims.w, height: dims.h, flexShrink: 0, overflow: 'hidden', position: 'relative', borderRadius: radius }}>
      <img src={src} alt="" onLoad={e => setNatural({ w: e.target.naturalWidth, h: e.target.naturalHeight })} style={imgStyle()} />
    </div>
  )
}

// Renders the reply preview block (green left-bar style).
export default function ReplyPreview({ replyNode, lessonFiles, teacherName, allWordChoiceStates, allPhotoChoiceStates, allPhraseStates }) {
  if (!replyNode) return null
  const r = resolveReply(replyNode, teacherName, allWordChoiceStates, allPhotoChoiceStates, allPhraseStates)
  if (!r) return null
  const thumbSrc = r.thumbSrc ?? getThumbSrc(replyNode, lessonFiles)
  return (
    <div className="playerReply" style={{ borderLeftColor: r.theme.border, background: r.theme.bg }}>
      <div className="playerReplyContent">
        <span className="playerReplyName" style={{ color: r.theme.name }}>{r.name}</span>
        <p className="playerReplyText" style={r.theme.text ? { color: r.theme.text } : undefined}>{r.label}</p>
      </div>
      {thumbSrc && <ReplyThumb type={replyNode.type} src={thumbSrc} crop={r.crop} />}
    </div>
  )
}
