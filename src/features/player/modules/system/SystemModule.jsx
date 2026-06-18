export default function SystemModule({ node }) {
  const content = node.typeData?.system?.content ?? ''
  return (
    <div className="playerSystemMsg">
      {content}
    </div>
  )
}
