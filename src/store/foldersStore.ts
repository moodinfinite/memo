import { useAuthStore } from './authStore'
import { registerAccountReset } from '@/lib/accountState'
import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

export interface Folder {
  id: string
  user_id: string
  name: string
  color: string
  position: number
  created_at: string
}

const FOLDER_COLORS = [
  'var(--folder-1)', 'var(--folder-2)', 'var(--folder-3)',
  'var(--folder-4)', 'var(--folder-5)', 'var(--folder-6)',
]

// Folders created before the two-ink palette stored these hex values (by position)
const LEGACY_FOLDER_COLORS: Record<string, string> = {
  '#84cc16': FOLDER_COLORS[0], '#3b82f6': FOLDER_COLORS[1], '#f97316': FOLDER_COLORS[2],
  '#a855f7': FOLDER_COLORS[3], '#ec4899': FOLDER_COLORS[4], '#14b8a6': FOLDER_COLORS[5],
}

const withPaletteColor = (folder: Folder): Folder =>
  ({ ...folder, color: LEGACY_FOLDER_COLORS[folder.color?.toLowerCase()] ?? folder.color })

interface FoldersState {
  folders: Folder[]
  isLoading: boolean
  error: string | null
  foldersLastFetched: number
  fetchFolders: () => Promise<void>
  createFolder: (name: string) => Promise<Folder>
  updateFolder: (id: string, name: string) => Promise<void>
  deleteFolder: (id: string) => Promise<void>
}

export const useFoldersStore = create<FoldersState>((set, get) => ({
  folders: [],
  isLoading: false,
  error: null,
  foldersLastFetched: 0,

  fetchFolders: async () => {
    const userId = useAuthStore.getState().user?.id
    if (!userId) return
    // Skip refetch if data is fresh (< 30s old)
    if (get().folders.length > 0 && Date.now() - get().foldersLastFetched < 30_000) return
    if (get().folders.length === 0) set({ isLoading: true })
    set({ error: null })
    const { data, error } = await supabase
      .from('folders')
      .select('*')
      .order('position', { ascending: true })
    if (useAuthStore.getState().user?.id !== userId) return
    if (error) { set({ error: error.message, isLoading: false }); return }
    set({ folders: (data ?? []).map(withPaletteColor), isLoading: false, foldersLastFetched: Date.now() })
  },

  createFolder: async (name) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const position = get().folders.length
    const color = FOLDER_COLORS[position % FOLDER_COLORS.length]

    const { data, error } = await supabase
      .from('folders')
      .insert({ name: name.trim(), color, position, user_id: user.id })
      .select()
      .single()

    if (error) throw error
    const folder = withPaletteColor(data)
    set((state) => ({ folders: [...state.folders, folder] }))
    return folder
  },

  updateFolder: async (id, name) => {
    // Optimistic: rename immediately, sync in background
    const prev = get().folders
    set((state) => ({ folders: state.folders.map((f) => f.id === id ? { ...f, name } : f) }))
    const { error } = await supabase.from('folders').update({ name }).eq('id', id)
    if (error) set({ folders: prev }) // rollback on failure
  },

  deleteFolder: async (id) => {
    // Optimistic: remove immediately, sync in background
    const prev = get().folders
    set((state) => ({ folders: state.folders.filter((f) => f.id !== id) }))
    const { error } = await supabase.from('folders').delete().eq('id', id)
    if (error) set({ folders: prev }) // rollback on failure
  },
}))

registerAccountReset(() => useFoldersStore.setState(useFoldersStore.getInitialState(), true))
