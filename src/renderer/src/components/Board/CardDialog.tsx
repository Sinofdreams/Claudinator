import { useState, useEffect } from 'react'
import type { Card } from '@shared/models'
import { useSettingsStore } from '@/stores/settings-store'
import { useTitleBarDim } from '@/hooks/useTitleBarDim'

interface CardDialogProps {
  card?: Card | null
  onSave: (data: { title: string; description: string; projectDir: string; tags: string[] }) => void
  onClose: () => void
  onDelete?: () => void
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  borderRadius: 8,
  border: '1px solid var(--border-input)',
  backgroundColor: 'var(--bg-input)',
  padding: '10px 14px',
  fontSize: 14,
  color: 'var(--text-primary)',
  outline: 'none',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--text-secondary)',
  marginBottom: 6,
}

export default function CardDialog({ card, onSave, onClose, onDelete }: CardDialogProps): JSX.Element {
  const defaultProjectDir = useSettingsStore((s) => s.defaultProjectDir)
  const [title, setTitle] = useState(card?.title ?? '')
  const [description, setDescription] = useState(card?.description ?? '')
  const [projectDir, setProjectDir] = useState(card?.projectDir ?? defaultProjectDir)
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>(card?.tags ?? [])

  useTitleBarDim()

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handlePickFolder = async (): Promise<void> => {
    const folder = await window.api.pickFolder()
    if (folder) setProjectDir(folder)
  }

  const handleAddTag = (): void => {
    const tag = tagInput.trim().toLowerCase()
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag])
    }
    setTagInput('')
  }

  const handleTagKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddTag()
    }
  }

  const handleRemoveTag = (tag: string): void => {
    setTags(tags.filter((t) => t !== tag))
  }

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    if (!title.trim()) return
    onSave({ title: title.trim(), description: description.trim(), projectDir: projectDir.trim(), tags })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'var(--bg-overlay)', backdropFilter: 'blur(4px)' }}
      onMouseDown={onClose}
    >
      <form
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        style={{
          width: '100%',
          maxWidth: 480,
          borderRadius: 14,
          border: '1px solid var(--border-primary)',
          backgroundColor: 'var(--bg-elevated)',
          padding: '28px 28px 24px',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 24 }}>
          {card ? 'Edit Card' : 'New Card'}
        </h2>

        {/* Title */}
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Title</label>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Fix auth bug"
            style={inputStyle}
          />
        </div>

        {/* Description */}
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional details..."
            rows={3}
            style={{ ...inputStyle, resize: 'none' }}
          />
        </div>

        {/* Tags */}
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Tags</label>
          {tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {tags.map((tag) => (
                <span
                  key={tag}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    borderRadius: 20,
                    backgroundColor: 'var(--bg-button)',
                    padding: '3px 10px',
                    fontSize: 12,
                    color: 'var(--text-primary)',
                  }}
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <path d="M2.5 2.5l5 5M7.5 2.5l-5 5" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          )}
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleTagKeyDown}
            onBlur={handleAddTag}
            placeholder="Type a tag and press Enter..."
            style={inputStyle}
          />
        </div>

        {/* Project Directory */}
        <div style={{ marginBottom: 28 }}>
          <label style={labelStyle}>Project Directory</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={projectDir}
              onChange={(e) => setProjectDir(e.target.value)}
              placeholder="C:\Users\me\project"
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              type="button"
              onClick={handlePickFolder}
              style={{
                borderRadius: 8,
                backgroundColor: 'var(--bg-button)',
                padding: '10px 16px',
                fontSize: 14,
                color: 'var(--text-primary)',
                border: 'none',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 4.5V12a1.5 1.5 0 001.5 1.5h9A1.5 1.5 0 0014 12V6.5A1.5 1.5 0 0012.5 5H8L6.5 3H3.5A1.5 1.5 0 002 4.5z" />
              </svg>
              Browse
            </button>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            {card && onDelete && (
              <button
                type="button"
                onClick={onDelete}
                style={{
                  borderRadius: 8,
                  padding: '8px 14px',
                  fontSize: 14,
                  color: '#f87171',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1M5 4v8.5a1 1 0 001 1h4a1 1 0 001-1V4" />
                </svg>
                Delete
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                borderRadius: 8,
                padding: '8px 16px',
                fontSize: 14,
                color: 'var(--text-secondary)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M12 4L4 12M4 4l8 8" />
              </svg>
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim()}
              style={{
                borderRadius: 8,
                backgroundColor: 'var(--accent)',
                padding: '8px 20px',
                fontSize: 14,
                fontWeight: 500,
                color: '#fff',
                border: 'none',
                cursor: title.trim() ? 'pointer' : 'default',
                opacity: title.trim() ? 1 : 0.4,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {card ? (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3.5 8.5l3 3 6-6" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M8 4v8M4 8h8" />
                </svg>
              )}
              {card ? 'Save' : 'Create'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
