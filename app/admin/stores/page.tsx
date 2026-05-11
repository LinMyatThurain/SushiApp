'use client'
// app/(admin)/stores/page.tsx

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  ArrowLeft, Plus, Store, MapPin, User, CheckCircle2,
  XCircle, Pencil, Trash2, X, Loader2, AlertCircle
} from 'lucide-react'
import Link from 'next/link'

type StoreRow = {
  id: string
  name: string
  location: string | null
  manager_name: string | null
  status: 'active' | 'inactive'
  created_at: string
}

type StoreDataRow = {
  id: string
  name: string
  location: string | null
  manager_name: string | null
  status: string
  created_at: string
}

type FormState = {
  name: string
  location: string
  manager_name: string
  status: 'active' | 'inactive'
}

const EMPTY_FORM: FormState = { name: '', location: '', manager_name: '', status: 'active' }
const STORE_FORM_FIELDS: Array<{ label: string; key: keyof Omit<FormState, 'status'>; placeholder: string }> = [
  { label: 'Store Name *', key: 'name', placeholder: 'e.g. Store Orchard' },
  { label: 'Location', key: 'location', placeholder: 'e.g. Orchard Road' },
  { label: 'Manager Name', key: 'manager_name', placeholder: 'e.g. Li Wei' },
]

export default function StoresPage() {
  const supabase = useMemo(() => createClient(), [])
  const [stores, setStores]       = useState<StoreRow[]>([])
  const [loading, setLoading]     = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing]     = useState<StoreRow | null>(null)
  const [form, setForm]           = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving]       = useState(false)
  const [deleting, setDeleting]   = useState<string | null>(null)
  const [error, setError]         = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('stores')
      .select('*')
      .order('created_at', { ascending: false })

    const rows: StoreRow[] = ((data ?? []) as StoreDataRow[]).map((row) => ({
      id: row.id,
      name: row.name,
      location: row.location,
      manager_name: row.manager_name,
      status: row.status === 'active' ? 'active' : 'inactive',
      created_at: row.created_at,
    }))

    setStores(rows)
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    let cancelled = false
    async function loadInitialStores() {
      const { data } = await supabase
        .from('stores')
        .select('*')
        .order('created_at', { ascending: false })

      if (cancelled) return
      const rows: StoreRow[] = ((data ?? []) as StoreDataRow[]).map((row) => ({
        id: row.id,
        name: row.name,
        location: row.location,
        manager_name: row.manager_name,
        status: row.status === 'active' ? 'active' : 'inactive',
        created_at: row.created_at,
      }))

      setStores(rows)
      setLoading(false)
    }
    void loadInitialStores()
    return () => { cancelled = true }
  }, [supabase])

  function openAdd() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setError('')
    setShowModal(true)
  }

  function openEdit(s: StoreRow) {
    setEditing(s)
    setForm({
      name: s.name,
      location: s.location ?? '',
      manager_name: s.manager_name ?? '',
      status: s.status,
    })
    setError('')
    setShowModal(true)
  }

  async function handleSave() {
    setError('')
    if (!form.name.trim()) { setError('Store name is required.'); return }
    setSaving(true)

    const response = await fetch('/api/admin/stores', {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editing ? { id: editing.id, ...form } : form),
    })
    const result = await response.json()

    if (!response.ok) {
      setError(result.error ?? 'Failed to save store.')
      setSaving(false)
      return
    }

    await load()
    setSaving(false)
    setShowModal(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this store? This cannot be undone.')) return
    setError('')
    setDeleting(id)
    const response = await fetch(`/api/admin/stores?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    const result = await response.json()

    if (!response.ok) {
      setError(result.error ?? 'Failed to delete store.')
      setDeleting(null)
      return
    }

    await load()
    setDeleting(null)
  }

  const activeCount   = stores.filter(s => s.status === 'active').length
  const inactiveCount = stores.filter(s => s.status === 'inactive').length

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(15,23,42,0.04),_transparent_28%),linear-gradient(180deg,#f8fafc_0%,#f4f7fb_100%)] text-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/dashboard" className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="text-sm font-semibold text-slate-950">Store management</h1>
          </div>
          <button onClick={openAdd}
            className="flex items-center gap-1.5 bg-slate-950 text-white text-xs font-medium px-3 py-2 rounded-xl hover:bg-slate-800 transition-colors shadow-sm">
            <Plus className="w-3.5 h-3.5" /> Add Store
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 md:px-6 py-6 space-y-4">
        {error && !showModal && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white border border-slate-200/70 rounded-3xl p-4 shadow-sm">
            <p className="text-2xl font-bold text-slate-950 tabular-nums">{stores.length}</p>
            <p className="text-xs text-slate-500 mt-0.5">Total stores</p>
          </div>
          <div className="bg-emerald-50/80 border border-emerald-100/80 rounded-3xl p-4 shadow-sm">
            <p className="text-2xl font-bold text-emerald-700 tabular-nums">{activeCount}</p>
            <p className="text-xs text-emerald-600 mt-0.5">Active</p>
          </div>
          <div className="bg-slate-50 border border-slate-200/70 rounded-3xl p-4 shadow-sm">
            <p className="text-2xl font-bold text-slate-500 tabular-nums">{inactiveCount}</p>
            <p className="text-xs text-slate-500 mt-0.5">Inactive</p>
          </div>
        </div>

        {/* Store list */}
        <div className="bg-white border border-slate-200/70 rounded-3xl overflow-hidden shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Store className="w-8 h-8 text-slate-200 animate-pulse" />
            </div>
          ) : stores.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center">
                <Store className="w-6 h-6 text-slate-300" />
              </div>
              <p className="text-sm text-slate-400">No stores yet</p>
              <button onClick={openAdd} className="text-xs font-medium text-slate-950 underline underline-offset-2">
                Add first store
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {stores.map(s => (
                <div key={s.id} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50/70 transition-colors">
                  {/* Icon */}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0
                    ${s.status === 'active' ? 'bg-slate-950' : 'bg-slate-100'}`}>
                    <Store className={`w-4.5 h-4.5 ${s.status === 'active' ? 'text-white' : 'text-slate-400'}`} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">{s.name}</p>
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium
                        ${s.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                        {s.status === 'active'
                          ? <CheckCircle2 className="w-3 h-3" />
                          : <XCircle className="w-3 h-3" />}
                        {s.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <MapPin className="w-3 h-3" /> {s.location || '—'}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <User className="w-3 h-3" /> {s.manager_name || '—'}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => openEdit(s)}
                      className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 px-3 py-1.5 rounded-lg border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-all">
                      <Pencil className="w-3 h-3" /> Edit
                    </button>
                    <button onClick={() => handleDelete(s.id)} disabled={deleting === s.id}
                      className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-600 px-3 py-1.5 rounded-lg border border-red-100 hover:border-red-200 hover:bg-red-50 transition-all disabled:opacity-50">
                      {deleting === s.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-slate-950/30 backdrop-blur-sm" onClick={() => setShowModal(false)} />

          {/* Sheet */}
          <div className="relative bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-2xl p-6 shadow-2xl border border-slate-200/70">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-slate-950">
                {editing ? 'Edit Store' : 'Add New Store'}
              </h2>
              <button onClick={() => setShowModal(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-2xl px-3 py-2.5 mb-4">
                <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                <p className="text-xs text-red-600">{error}</p>
              </div>
            )}

            <div className="space-y-3">
              {STORE_FORM_FIELDS.map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">{f.label}</label>
                  <input
                    type="text"
                    value={form[f.key]}
                    onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full text-sm bg-slate-50 border border-slate-200/70 rounded-xl px-3 py-2.5 outline-none focus:border-slate-300 focus:bg-white transition-all placeholder:text-slate-300"
                  />
                </div>
              ))}

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Status</label>
                <div className="flex gap-2">
                  {(['active', 'inactive'] as const).map(s => (
                    <button key={s} onClick={() => setForm(prev => ({ ...prev, status: s }))}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-medium capitalize border transition-all
                        ${form.status === s
                          ? s === 'active' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-gray-100 border-gray-200 text-gray-600'
                          : 'bg-white border-gray-100 text-gray-400 hover:border-gray-200'}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-600 border border-slate-200/70 hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-slate-950 text-white hover:bg-slate-800 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</> : editing ? 'Save Changes' : 'Add Store'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
