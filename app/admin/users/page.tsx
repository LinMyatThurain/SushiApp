'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Copy,
  KeyRound,
  Loader2,
  Mail,
  Pencil,
  Plus,
  Search,
  Shield,
  Trash2,
  Truck,
  Users,
  X,
} from 'lucide-react'
import Link from 'next/link'

type UserRole = 'admin' | 'delivery'

type UserRow = {
  id: string
  name: string
  email: string
  role: UserRole
  created_at: string
}

type UserDataRow = {
  id: string
  name: string | null
  email: string
  role: string | null
  created_at: string
}

type FormState = {
  name: string
  email: string
  password: string
  role: UserRole
}

const EMPTY_FORM: FormState = {
  name: '',
  email: '',
  password: '',
  role: 'delivery',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-SG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default function UsersPage() {
  const supabase = useMemo(() => createClient(), [])
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<UserRow | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [passwordTarget, setPasswordTarget] = useState<UserRow | null>(null)
  const [passwordValue, setPasswordValue] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)

  const load = useCallback(async () => {
    const { data: userData } = await supabase.from('users').select('id, name, email, role, created_at').order('created_at', { ascending: false })

    const rows: UserRow[] = ((userData ?? []) as UserDataRow[]).map((row) => ({
      id: row.id,
      name: row.name ?? '',
      email: row.email,
      role: row.role === 'admin' ? 'admin' : 'delivery',
      created_at: row.created_at,
    }))

    setUsers(rows)
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    let cancelled = false
    async function loadInitialUsers() {
      const { data: userData } = await supabase.from('users').select('id, name, email, role, created_at').order('created_at', { ascending: false })
      if (cancelled) return

      const rows: UserRow[] = ((userData ?? []) as UserDataRow[]).map((row) => ({
        id: row.id,
        name: row.name ?? '',
        email: row.email,
        role: row.role === 'admin' ? 'admin' : 'delivery',
        created_at: row.created_at,
      }))

      setUsers(rows)
      setLoading(false)
    }
    void loadInitialUsers()
    return () => { cancelled = true }
  }, [supabase])

  const filtered = useMemo(() => {
    let next = users
    if (roleFilter !== 'all') {
      next = next.filter((user) => user.role === roleFilter)
    }
    if (search.trim()) {
      const query = search.toLowerCase()
      next = next.filter(
        (user) =>
          user.name.toLowerCase().includes(query) ||
          user.email.toLowerCase().includes(query) ||
          user.id.toLowerCase().includes(query) ||
          user.role.toLowerCase().includes(query)
      )
    }
    return next
  }, [search, roleFilter, users])

  function openAdd() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setError('')
    setNotice('')
    setShowModal(true)
  }

  function openEdit(user: UserRow) {
    setEditing(user)
    setForm({
      name: user.name,
      email: user.email,
      password: '',
      role: user.role,
    })
    setError('')
    setNotice('')
    setShowModal(true)
  }

  function openPasswordReset(user: UserRow) {
    setPasswordTarget(user)
    setPasswordValue('')
    setError('')
    setNotice('')
  }

  async function handleSave() {
    setError('')

    if (!form.email.trim()) {
      setError('Email is required.')
      return
    }

    if (!editing && form.password.trim().length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    const payload = {
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      role: form.role,
      ...(form.password.trim() ? { password: form.password.trim() } : {}),
    }

    setSaving(true)

    const response = await fetch('/api/admin/users', {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editing ? { id: editing.id, ...payload } : payload),
    })

    const result = await response.json()

    if (!response.ok) {
      setError(result.error ?? 'Failed to save user.')
      setSaving(false)
      return
    }

    setNotice(editing ? 'User updated successfully.' : 'User created successfully.')
    await load()
    setSaving(false)
    setShowModal(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this user from both the app table and Supabase Auth? This cannot be undone.')) return

    setDeleting(id)
    const response = await fetch(`/api/admin/users?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    const result = await response.json()

    if (!response.ok) {
      setDeleting(null)
      setError(result.error ?? 'Failed to delete user.')
      return
    }

    await load()
    setDeleting(null)
    setNotice('User deleted successfully.')
  }

  async function handlePasswordReset() {
    if (!passwordTarget) return

    setError('')
    if (passwordValue.trim().length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setPasswordSaving(true)

    const response = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: passwordTarget.id,
        name: passwordTarget.name,
        email: passwordTarget.email,
        role: passwordTarget.role,
        password: passwordValue.trim(),
      }),
    })

    const result = await response.json()
    if (!response.ok) {
      setError(result.error ?? 'Failed to reset password.')
      setPasswordSaving(false)
      return
    }

    setPasswordSaving(false)
    setPasswordTarget(null)
    setPasswordValue('')
    setNotice(`Password updated for ${passwordTarget.email}.`)
  }

  async function copyId(id: string) {
    try {
      await navigator.clipboard.writeText(id)
      setCopiedId(id)
      window.setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 1200)
    } catch {
      setCopiedId(null)
    }
  }

  const adminCount = users.filter((user) => user.role === 'admin').length
  const deliveryCount = users.filter((user) => user.role === 'delivery').length

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(15,23,42,0.04),_transparent_28%),linear-gradient(180deg,#f8fafc_0%,#f4f7fb_100%)] text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/dashboard" className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="text-sm font-semibold text-slate-950">User management</h1>
          </div>
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 bg-slate-950 text-white text-xs font-medium px-3 py-2 rounded-xl hover:bg-slate-800 transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" /> Add User
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 md:px-6 py-6 space-y-4">
        {notice && !showModal && !passwordTarget && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <p className="text-sm text-emerald-700">{notice}</p>
          </div>
        )}

        {error && !showModal && !passwordTarget && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white border border-slate-200/70 rounded-3xl p-4 shadow-sm">
            <p className="text-2xl font-bold text-slate-950 tabular-nums">{users.length}</p>
            <p className="text-xs text-slate-500 mt-0.5">Total users</p>
          </div>
          <div className="bg-slate-950 border border-slate-900 rounded-3xl p-4 shadow-sm">
            <p className="text-2xl font-bold text-white tabular-nums">{adminCount}</p>
            <p className="text-xs text-slate-400 text-white mt-0.5">Admins</p>
          </div>
          <div className="bg-sky-50/80 border border-sky-100/80 rounded-3xl p-4 shadow-sm">
            <p className="text-2xl font-bold text-blue-700 tabular-nums">{deliveryCount}</p>
            <p className="text-xs text-sky-600 mt-0.5">Delivery users</p>
          </div>
        </div>

        <div className="flex gap-2">
          <div className="flex items-center gap-2 bg-white border border-slate-200/70 rounded-2xl px-3 py-2 flex-1 shadow-sm">
            <Search className="w-3.5 h-3.5 text-slate-300 shrink-0" />
            <input
              type="text"
              placeholder="Search users..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="flex-1 text-xs bg-transparent outline-none text-slate-700 placeholder:text-slate-300"
            />
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">          {(['all', 'admin', 'delivery'] as const).map((role) => (
            <button
              key={role}
              onClick={() => setRoleFilter(role)}
              className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-all ${
                roleFilter === role
                  ? 'bg-slate-950 text-white border-slate-950'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
              }`}
            >
              {role === 'all' ? 'All' : role === 'admin' ? 'Admins' : 'Delivery'}
            </button>
          ))}
        </div>

        <div className="rounded-2xl border border-amber-200/80 bg-amber-50/80 px-4 py-3">
          <p className="text-xs text-amber-800">
            This page manages only app accounts for admins and delivery staff. Delivery staff will be used for shipment and end-of-day entry.
          </p>
        </div>

        <div className="bg-white border border-slate-200/70 rounded-3xl overflow-hidden shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Users className="w-8 h-8 text-slate-200 animate-pulse" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center">
                <Users className="w-6 h-6 text-slate-300" />
              </div>
              <p className="text-sm text-slate-400">No users found</p>
              <button onClick={openAdd} className="text-xs font-medium text-slate-950 underline underline-offset-2">
                Add first user
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filtered.map((user) => (
                <div key={user.id} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50/70 transition-colors">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      user.role === 'admin' ? 'bg-slate-950' : 'bg-sky-50'
                    }`}
                  >
                    {user.role === 'admin' ? <Shield className="w-4.5 h-4.5 text-white" /> : <Truck className="w-4.5 h-4.5 text-sky-500" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-slate-900">{user.email}</p>
                      {user.name ? <span className="text-xs text-slate-400">({user.name})</span> : null}
                      <span
                        className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${
                          user.role === 'admin'
                            ? 'bg-slate-950 text-white border-slate-950'
                            : 'bg-sky-50 text-sky-700 border-sky-200'
                        }`}
                      >
                        {user.role === 'admin' ? <Shield className="w-3 h-3" /> : <Truck className="w-3 h-3" />}
                        {user.role === 'delivery' ? 'Delivery' : user.role}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      <span className="flex items-center gap-1 text-xs text-slate-400 min-w-0">
                        <Mail className="w-3 h-3 shrink-0" /> {user.email}
                      </span>
                      <span className="text-xs text-slate-400">Created {fmtDate(user.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <code className="text-[11px] text-slate-400 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200/70">
                        {user.id}
                      </code>
                      <button onClick={() => copyId(user.id)} className="text-slate-300 hover:text-slate-600 transition-colors" title="Copy user ID">
                        {copiedId === user.id ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => openPasswordReset(user)}
                      className="flex items-center gap-1.5 text-xs text-sky-600 hover:text-sky-700 px-3 py-1.5 rounded-lg border border-sky-100 hover:border-sky-200 hover:bg-sky-50 transition-all"
                    >
                      <KeyRound className="w-3 h-3" />
                      Password
                    </button>
                    <button
                      onClick={() => openEdit(user)}
                      className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 px-3 py-1.5 rounded-lg border border-slate-200/70 hover:border-slate-300 hover:bg-slate-50 transition-all"
                    >
                      <Pencil className="w-3 h-3" /> Edit
                    </button>
                    <button
                      onClick={() => handleDelete(user.id)}
                      disabled={deleting === user.id}
                      className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-600 px-3 py-1.5 rounded-lg border border-red-100 hover:border-red-200 hover:bg-red-50 transition-all disabled:opacity-50"
                    >
                      {deleting === user.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {filtered.length > 0 && (
          <p className="text-xs text-gray-400 text-center">
            {filtered.length} user{filtered.length !== 1 ? 's' : ''}{' '}
            {roleFilter !== 'all' || search ? 'matching filters' : 'total'}
          </p>
        )}
      </main>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowModal(false)} />

          <div className="relative bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-gray-900">{editing ? 'Edit User' : 'Add New User'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mb-4">
                <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                <p className="text-xs text-red-600">{error}</p>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Name</label>
                <input
                  type="text"
                  value={form.name}
                  placeholder="e.g. Jane Tan"
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  className="w-full text-sm bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 outline-none focus:border-gray-300 focus:bg-white transition-all placeholder:text-gray-300"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Email *</label>
                <input
                  type="email"
                  value={form.email}
                  placeholder="name@example.com"
                  onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                  className="w-full text-sm bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 outline-none focus:border-gray-300 focus:bg-white transition-all placeholder:text-gray-300"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">{editing ? 'New Password' : 'Password *'}</label>
                <input
                  type="password"
                  value={form.password}
                  placeholder={editing ? 'Leave blank to keep current password' : 'Minimum 8 characters'}
                  onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                  className="w-full text-sm bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 outline-none focus:border-gray-300 focus:bg-white transition-all placeholder:text-gray-300"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Role</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['admin', 'delivery'] as const).map((role) => (
                    <button
                      key={role}
                      onClick={() => setForm((prev) => ({ ...prev, role }))}
                      className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium capitalize border transition-all ${
                        form.role === role
                          ? role === 'admin'
                            ? 'bg-gray-900 border-gray-900 text-white'
                            : 'bg-blue-50 border-blue-200 text-blue-700'
                          : 'bg-white border-gray-100 text-gray-400 hover:border-gray-200'
                      }`}
                    >
                      {role === 'admin' ? <Shield className="w-3.5 h-3.5" /> : <Truck className="w-3.5 h-3.5" />}
                      {role === 'admin' ? 'Admin' : 'Delivery'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-gray-600 border border-gray-100 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...
                  </>
                ) : editing ? (
                  'Save Changes'
                ) : (
                  'Add User'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {passwordTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setPasswordTarget(null)} />

          <div className="relative bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Reset Password</h2>
                <p className="text-xs text-gray-400 mt-1">{passwordTarget.email}</p>
              </div>
              <button onClick={() => setPasswordTarget(null)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mb-4">
                <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                <p className="text-xs text-red-600">{error}</p>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">New Password</label>
              <input
                type="password"
                value={passwordValue}
                placeholder="Minimum 8 characters"
                onChange={(event) => setPasswordValue(event.target.value)}
                className="w-full text-sm bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 outline-none focus:border-gray-300 focus:bg-white transition-all placeholder:text-gray-300"
              />
            </div>

            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setPasswordTarget(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-gray-600 border border-gray-100 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handlePasswordReset}
                disabled={passwordSaving}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {passwordSaving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...
                  </>
                ) : (
                  'Update Password'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
