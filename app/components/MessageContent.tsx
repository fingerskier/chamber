export default function MessageContent({ content }: { content: string }) {
  const parts = content.split(/(@[\w-]+)/g)
  return (
    <p className="whitespace-pre-wrap">
      {parts.map((part, i) =>
        part.startsWith('@') ? (
          <span key={i} className="rounded bg-blue-100 px-1 font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </p>
  )
}
