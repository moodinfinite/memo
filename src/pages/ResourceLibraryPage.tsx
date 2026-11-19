import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { supabase } from '@/lib/supabase'
import styles from './ResourceLibraryPage.module.css'

type Resource = [name: string, destination: string, kind: string]
const mainland: Resource[] = [
  ['MaoMi Chinese', 'https://maomichinese.com/', 'Website'],
  ['Lao Bai', 'https://www.youtube.com/watch?v=jD8FJJhlXmA', 'YouTube'],
  ['CrazyLaugh Comedy', 'https://www.youtube.com/@crazylaughcomedy/videos', 'YouTube'],
  ['Chinese Food Tour', 'https://www.youtube.com/watch?v=eHM4zP4_CrA', 'YouTube'],
  ['Blondie in China', 'https://www.youtube.com/@BlondieinChina', 'YouTube'],
  ['LK’s Official Channel', 'https://www.youtube.com/watch?v=LYUyXnJ2pLM', 'YouTube'],
  ['Zhangkai Chinese', 'https://www.youtube.com/watch?v=79p7zF9KuGE', 'YouTube'],
]
const taiwan: Resource[] = [
  ['Dan Ge', 'https://www.instagram.com/dan.ge2.0?igsh=djRmcG1lOXc0ZHBv', 'Instagram'],
  ['Goldfish Brain', 'https://www.youtube.com/watch?v=A9B64fS9aPE', 'YouTube'],
  ['STR Night', 'https://www.youtube.com/watch?v=qhXQvjDH6aA', 'YouTube'],
]
const tools: Resource[] = [
  ['Mandarin Spot', 'https://mandarinspot.com/', 'Reading'],
  ['YouGlish', 'https://youglish.com/chinese', 'Pronunciation'],
  ['HanziHero', 'https://hanzihero.com/', 'Characters'],
]

function tutorSheet(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.origin === 'https://docs.google.com' && url.pathname.startsWith('/spreadsheets/d/') ? url.href : null
  } catch { return null }
}

export default function ResourceLibraryPage() {
  const user = useAuthStore(state => state.user)
  const [sheet, setSheet] = useState(() => tutorSheet(user?.user_metadata?.memo_tutor_sheet))
  useEffect(() => {
    let active = true
    // The session's cached profile can predate a newly saved bookmark.
    void supabase.auth.getUser().then(({ data }) => {
      if (active && data.user && data.user.id === user?.id) setSheet(tutorSheet(data.user.user_metadata?.memo_tutor_sheet))
    }).catch(() => {})
    return () => { active = false }
  }, [user?.id])
  const studyTools: Resource[] = sheet ? [...tools, ['Google Sheet with TW Tutor', sheet, 'Tutor notes']] : tools
  const groups = [{ title: 'Mainland China', links: mainland }, { title: 'Taiwan', links: taiwan }, { title: 'Study tools', links: studyTools }]
  return <div className={styles.page}>
    <h1>Resource library</h1>
    {groups.map(({ title, links }) => <section key={title}>
      <h2>{title}</h2>
      <ul>{links.map(([name, href, kind]) => <li key={name}>
        <a href={href} target="_blank" rel="noopener noreferrer">
          <span>{name}</span><small>{kind}</small><span aria-hidden="true">↗</span>
        </a>
      </li>)}</ul>
    </section>)}
  </div>
}
