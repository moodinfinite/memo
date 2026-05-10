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
  '#84cc16', '#3b82f6', '#f97316',
  '#a855f7', '#ec4899', '#14b8a6',
]

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
    // Skip refetch if data is fresh (< 30s old)
    if (get().folders.length > 0 && Date.now() - get().foldersLastFetched < 30_000) return
    if (get().folders.length === 0) set({ isLoading: true })
    set({ error: null })
    const { data, error } = await supabase
      .from('folders')
      .select('*')
      .order('position', { ascending: true })
    if (error) { set({ error: error.message, isLoading: false }); return }
    set({ folders: data ?? [], isLoading: false, foldersLastFetched: Date.now() })
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
    set((state) => ({ folders: [...state.folders, data] }))
    return data
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
