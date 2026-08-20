'use client'

import { useMemo, useRef, useState } from 'react'
import type { Member } from '@/lib/services/workspaces'

const TRIGGER = /(^|\s)@([\w-]*)$/

export default function Compose({
  members,
  action,
  placeholder,
  compact = false,
}: {
  members: Member[]
  action: (formData: FormData) => Promise<void>
  placeholder: string
  compact?: boolean
}) {
  const [text, setText] = useState('')
  const [picked, setPicked] = useState<Member[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const query = useMemo(() => {
    const m = TRIGGER.exec(text)
    return m ? m[2].toLowerCase() : null
  }, [text])

  const suggestions = useMemo(() => {
    if (query === null) return []
    return members
      .filter((m) => m.slug.toLowerCase().startsWith(query) || m.label.toLowerCase().startsWith(query))
      .slice(0, 6)
  }, [members, query])

  function pick(m: Member) {
    setText(text.replace(TRIGGER, `$1@${m.slug} `))
    if (!picked.some((p) => p.type === m.type && p.id === m.id)) setPicked([...picked, m])
    inputRef.current?.focus()
  }

  // Only submit mentions whose @slug survived editing.
  const activeMentions = picked
    .filter((m) => text.includes(`@${m.slug}`))
    .map((m) => ({ type: m.type, id: m.id }))

  return (
    <form
      action={async (fd) => {
        await action(fd)
        setText('')
        setPicked([])
      }}
      className="relative flex gap-2"
    >
      {suggestions.length > 0 && (
        <ul className="absolute bottom-full left-0 z-10 mb-1 w-64 rounded-md border bg-white shadow dark:bg-gray-900">
          {suggestions.map((m) => (
            <li key={`${m.type}:${m.id}`}>
              <button
                type="button"
                onClick={() => pick(m)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <span className="font-medium">@{m.slug}</span>
                <span className="text-xs text-gray-500">
                  {m.label} · {m.type}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        ref={inputRef}
        name="content"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && suggestions.length > 0) {
            e.preventDefault()
            pick(suggestions[0])
          }
        }}
        placeholder={placeholder}
        autoComplete="off"
        required
        className={`flex-1 rounded-md border ${compact ? 'px-2 py-1 text-sm' : 'px-3 py-2'}`}
      />
      <input type="hidden" name="mentions" value={JSON.stringify(activeMentions)} />
      <button
        type="submit"
        className={
          compact
            ? 'rounded-md border px-3 py-1 text-sm'
            : 'rounded-md bg-blue-600 px-4 py-2 text-white'
        }
      >
        {compact ? 'Reply' : 'Send'}
      </button>
    </form>
  )
}
