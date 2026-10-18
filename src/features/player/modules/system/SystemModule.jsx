import { useEffect } from 'react'

export default function SystemModule({ node, onDone }) {
  useEffect(() => { onDone?.() }, []) // eslint-disable-line
  const content = node.typeData?.system?.content ?? ''
  return (
    <div className="playerMsgRow pinSystemRow pinSystemRowGap">
      <span className="pinSystemText">{content}</span>
    </div>
  )
}
