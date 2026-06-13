import { apiFetch } from './client'

export type MediaType = 'ppt' | 'video'

export type LibraryMedia = {
  id: string
  type: MediaType
  title: string
  url: string
  embedUrl: string
  description?: string | null
  createdAt: string
}

export type LibraryMediaInput = {
  type: MediaType
  title: string
  url: string
  description?: string | null
}

export function listMedia() {
  return apiFetch<LibraryMedia[]>('/api/library/media')
}
export function createMedia(input: LibraryMediaInput) {
  return apiFetch<LibraryMedia>('/api/library/media', { method: 'POST', body: input })
}
export function updateMedia(id: string, input: Partial<LibraryMediaInput>) {
  return apiFetch<LibraryMedia>(`/api/library/media/${encodeURIComponent(id)}`, { method: 'PATCH', body: input })
}
export function deleteMedia(id: string) {
  return apiFetch<void>(`/api/library/media/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
