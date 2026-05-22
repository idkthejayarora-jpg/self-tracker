import { useEffect, useState, useCallback, useRef } from 'react';
import { Plus, Check, Trash2, ChevronDown, ChevronUp, Zap, Pencil, Save, AlertCircle } from 'lucide-react';
import api from '../lib/api';
import { useSync } from '../hooks/useSync';
import type { Task, TaskPriority, TaskStatus } from '../types';

const PRIORITY_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  urgent: { bg: '#f43f5e22', text: '#f43f5e', border: '#f43f5e44' },
  high:   { bg: '#f9731622', text: '#f97316', border: '#f9731644' },
  medium: { bg: '#eab30822', text: '#eab308', border: '#eab30844' },
  low:    { bg: '#22c55e22', text: '#22c55e', border: '#22c55e44' },
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Done',
  cancelled: 'Cancelled',
};

interface LifeAreaOption {
  id: number;
  name: string;
  icon: string;
  color: string;
}

interface TaskFormData {
  title: string;
  description: string;
  due_date: string;
  due_time: string;
  priority: TaskPriority;
  is_recurring: boolean;
  recur_interval: string;
  follow_up_date: string;
  life_area_id: number | null;
}

function emptyForm(): TaskFormData {
  return { title: '', description: '', due_date: '', due_time: '',
    priority: 'medium', is_recurring: false, recur_interval: 'daily', follow_up_date: '', life_area_id: null };
}

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadErr, setLoadErr] = useState('');
  const [queueView, setQueueView] = useState(false);
  const [filter, setFilter] = useState<'all' | TaskStatus>('all');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<TaskFormData>(emptyForm());
  const [formErr, setFormErr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<TaskFormData>>({});
  const [editErr, setEditErr] = useState('');
  const [lifeAreas, setLifeAreas] = useState<LifeAreaOption[]>([]);
  const [showDone, setShowDone] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  const fetchTasks = useCallback(async () => {
    try {
      setLoadErr('');
      const url = queueView ? '/tasks/priority-queue' : '/tasks';
      const params = !queueView && filter !== 'all' ? { status: filter } : {};
      const res = await api.get<Task[]>(url, { params });
      setTasks(res.data);
    } catch (e: any) {
      setLoadErr(e?.response?.data?.error || e?.message || 'Failed to load tasks');
    }
  }, [queueView, filter]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);
  useSync(fetchTasks, 30000);

  useEffect(() => {
    api.get<LifeAreaOption[]>('/life/areas').then(r => setLifeAreas(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (showForm) setTimeout(() => titleRef.current?.focus(), 50);
  }, [showForm]);

  async function createTask() {
    if (!form.title.trim()) return;
    setSubmitting(true);
    setFormErr('');
    try {
      await api.post('/tasks', {
        title: form.title.trim(),
        description: form.description || null,
        due_date: form.due_date || null,
        due_time: form.due_time || null,
        priority: form.priority,
        is_recurring: form.is_recurring,
        recur_interval: form.is_recurring ? form.recur_interval : null,
        follow_up_date: form.follow_up_date || null,
        tags: [],
        life_area_id: form.life_area_id || null,
      });
      setForm(emptyForm());
      setShowForm(false);
      await fetchTasks();
    } catch (e: any) {
      setFormErr(e?.response?.data?.error || e?.message || 'Failed to create task. Check your connection.');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleStatus(task: Task) {
    const newStatus: TaskStatus = task.status === 'completed' ? 'pending' : 'completed';
    try {
      await api.patch(`/tasks/${task.id}`, { status: newStatus });
      await fetchTasks();
    } catch {
      await fetchTasks();
    }
  }

  async function deleteTask(id: number) {
    try {
      await api.delete(`/tasks/${id}`);
      setTasks(prev => prev.filter(t => t.id !== id));
    } catch {
      await fetchTasks();
    }
  }

  function startEdit(task: Task) {
    setEditId(task.id);
    setEditErr('');
    setEditForm({
      title: task.title,
      description: task.description || '',
      due_date: task.due_date || '',
      due_time: task.due_time || '',
      priority: task.priority,
      follow_up_date: task.follow_up_date || '',
    });
  }

  async function saveEdit(id: number) {
    setEditErr('');
    try {
      await api.patch(`/tasks/${id}`, {
        title: editForm.title || undefined,
        description: editForm.description ?? null,
        due_date: editForm.due_date || null,
        due_time: editForm.due_time || null,
        priority: editForm.priority,
        follow_up_date: editForm.follow_up_date || null,
      });
      setEditId(null);
      await fetchTasks();
    } catch (e: any) {
      setEditErr(e?.response?.data?.error || e?.message || 'Failed to save');
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  // Split active vs done when in 'all' view (not queue)
  const showSplit = filter === 'all' && !queueView;
  const activeTasks = showSplit ? tasks.filter(t => t.status !== 'completed') : tasks;
  const doneTasks   = showSplit ? tasks.filter(t => t.status === 'completed')  : [];

  return (
    <div className="max-w-2xl mx-auto space-y-5 anim-page"
      style={{ '--accent-rgb': '34 197 94' } as React.CSSProperties}>

      {/* Cyberpunk body overlay */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(circle, rgba(34,197,94,0.06) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }} />
      </div>

      <div className="page-header flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="shrink-0 flex items-center justify-center rounded-2xl"
            style={{ width: 44, height: 44, background: '#818cf815', border: '1px solid #818cf825' }}>
            <CheckSquare size={22} style={{ color: '#818cf8' }} strokeWidth={1.7} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-head tracking-tight">Missions</h1>
            <p className="text-xs text-muted mt-0.5">Task management</p>
          </div>
        </div>
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>

      <div className="flex justify-end">
        <button
          onClick={() => { setShowForm(s => !s); setForm(emptyForm()); setFormErr(''); }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold tap"
          style={{ background: `rgb(var(--accent-rgb) / 0.12)`, color: `rgb(var(--accent-rgb-light))` }}>
          <Plus size={15} /> New task
        </button>
      </div>

      {/* Add task form */}
      {showForm && (
        <div className="card px-4 py-4 space-y-3 scale-in">
          <p className="text-sm font-semibold text-head">New task</p>

          {formErr && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
              style={{ background: 'rgb(239 68 68 / 0.1)', color: '#f87171' }}>
              <AlertCircle size={13} />
              {formErr}
            </div>
          )}

          <input
            ref={titleRef}
            placeholder="Task title"
            value={form.title}
            onChange={e => { setForm(f => ({ ...f, title: e.target.value })); setFormErr(''); }}
            onKeyDown={e => e.key === 'Enter' && createTask()}
            className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none"
          />
          <textarea
            placeholder="Description (optional)"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            rows={2}
            className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none resize-none"
          />
          {lifeAreas.length > 0 && (
            <div>
              <p className="text-[10px] mb-1 font-bold tracking-wider" style={{ color: 'var(--t-faint)' }}>LIFE AREA (optional)</p>
              <div className="flex flex-wrap gap-1.5">
                <button type="button"
                  onClick={() => setForm(f => ({ ...f, life_area_id: null }))}
                  className="text-xs px-2.5 py-1 rounded-full tap"
                  style={{ background: form.life_area_id == null ? 'rgb(var(--accent-rgb)/0.15)' : 'var(--s3)', color: form.life_area_id == null ? 'rgb(var(--accent-rgb-light))' : 'var(--t-faint)', border: `1px solid ${form.life_area_id == null ? 'rgb(var(--accent-rgb)/0.4)' : 'transparent'}` }}>
                  None
                </button>
                {lifeAreas.map(a => (
                  <button key={a.id} type="button"
                    onClick={() => setForm(f => ({ ...f, life_area_id: f.life_area_id === a.id ? null : a.id }))}
                    className="text-xs px-2.5 py-1 rounded-full tap"
                    style={{ background: form.life_area_id === a.id ? `${a.color}20` : 'var(--s3)', color: form.life_area_id === a.id ? a.color : 'var(--t-faint)', border: `1px solid ${form.life_area_id === a.id ? a.color + '60' : 'transparent'}` }}>
                    {a.icon} {a.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium" style={{ color: 'var(--t-dim)' }}>DUE DATE</label>
              <input type="date" value={form.due_date}
                onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none mt-1" />
            </div>
            <div>
              <label className="text-[11px] font-medium" style={{ color: 'var(--t-dim)' }}>PRIORITY</label>
              <select value={form.priority}
                onChange={e => setForm(f => ({ ...f, priority: e.target.value as TaskPriority }))}
                className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none mt-1">
                {(['low', 'medium', 'high', 'urgent'] as TaskPriority[]).map(p =>
                  <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                )}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium" style={{ color: 'var(--t-dim)' }}>DUE TIME</label>
              <input type="time" value={form.due_time}
                onChange={e => setForm(f => ({ ...f, due_time: e.target.value }))}
                className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none mt-1" />
            </div>
            <div>
              <label className="text-[11px] font-medium" style={{ color: 'var(--t-dim)' }}>FOLLOW-UP</label>
              <input type="date" value={form.follow_up_date}
                onChange={e => setForm(f => ({ ...f, follow_up_date: e.target.value }))}
                className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none mt-1" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_recurring}
                onChange={e => setForm(f => ({ ...f, is_recurring: e.target.checked }))}
                className="rounded" />
              <span className="text-xs font-medium" style={{ color: 'var(--t-dim)' }}>Recurring</span>
            </label>
            {form.is_recurring && (
              <select value={form.recur_interval}
                onChange={e => setForm(f => ({ ...f, recur_interval: e.target.value }))}
                className="flex-1 rounded-lg px-2 py-1.5 text-xs border focus:outline-none">
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setShowForm(false); setFormErr(''); }}
              className="flex-1 py-2 rounded-lg text-sm font-medium tap"
              style={{ background: 'var(--s3)', color: 'var(--t-dim)' }}>Cancel</button>
            <button onClick={createTask} disabled={submitting || !form.title.trim()}
              className="flex-1 py-2 rounded-lg text-sm font-semibold tap disabled:opacity-50"
              style={{ background: `rgb(var(--accent-rgb))`, color: '#fff' }}>
              {submitting ? 'Adding...' : 'Add task'}
            </button>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          onClick={() => setQueueView(v => !v)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold tap"
          style={{
            background: queueView ? '#f59e0b22' : 'var(--s3)',
            color: queueView ? '#f59e0b' : '#71717a',
            border: `1px solid ${queueView ? '#f59e0b44' : 'transparent'}`,
          }}>
          <Zap size={12} /> Focus Queue
        </button>
        {!queueView && (['all', 'pending', 'in_progress', 'completed', 'cancelled'] as const).map(s => (
          <button key={s}
            onClick={() => setFilter(s)}
            className="px-3 py-1.5 rounded-full text-xs font-semibold tap"
            style={{
              background: filter === s ? `rgb(var(--accent-rgb) / 0.12)` : 'var(--s3)',
              color: filter === s ? `rgb(var(--accent-rgb-light))` : '#71717a',
              border: `1px solid ${filter === s ? `rgb(var(--accent-rgb) / 0.2)` : 'transparent'}`,
            }}>
            {s === 'all' ? 'All' : STATUS_LABELS[s as TaskStatus]}
          </button>
        ))}
      </div>

      {/* Load error */}
      {loadErr && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs"
          style={{ background: 'rgb(239 68 68 / 0.08)', color: '#f87171', border: '1px solid rgb(239 68 68 / 0.2)' }}>
          <AlertCircle size={13} />
          {loadErr} — <button onClick={fetchTasks} className="underline tap">retry</button>
        </div>
      )}

      {/* Task list */}
      <div className="space-y-2" style={{ position: 'relative', zIndex: 1 }}>
        {!loadErr && tasks.length === 0 && (
          <div className="card py-12 text-center">
            <p className="text-sm font-medium" style={{ color: 'var(--t-dim)' }}>No tasks found</p>
            <p className="text-xs mt-1" style={{ color: '#52525b' }}>Tap "New task" to get started</p>
          </div>
        )}

        {/* ── Active missions ── */}
        {showSplit && activeTasks.length === 0 && tasks.length > 0 && (
          <div className="rounded-xl py-8 text-center" style={{ border: '1px dashed var(--b)' }}>
            <p className="text-sm font-semibold" style={{ color: 'var(--t-muted)' }}>All missions complete 🎯</p>
          </div>
        )}

        {activeTasks.map(task => {
          const isExpanded = expanded === task.id;
          const isEditing = editId === task.id;
          const isOverdue = task.due_date && task.due_date < today && task.status !== 'completed' && task.status !== 'cancelled';
          const pc = PRIORITY_COLOR[task.priority] ?? PRIORITY_COLOR.medium;
          return (
            <div key={task.id}
              className="card overflow-hidden"
              style={isOverdue ? { borderColor: '#f43f5e55' } : {}}>

              {/* Main row */}
              <div className="flex items-center gap-3 px-4 py-3">
                <button
                  onClick={() => toggleStatus(task)}
                  className="flex items-center justify-center rounded-full border-2 tap transition-all"
                  style={{
                    width: 22, height: 22, flexShrink: 0,
                    background: task.status === 'completed' ? `rgb(var(--accent-rgb))` : 'transparent',
                    borderColor: task.status === 'completed' ? `rgb(var(--accent-rgb))` : 'var(--b)',
                  }}>
                  {task.status === 'completed' && <Check size={12} color="#fff" strokeWidth={3} />}
                </button>

                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpanded(isExpanded ? null : task.id)}>
                  <p className="text-sm font-medium text-head truncate"
                    style={{ textDecoration: task.status === 'completed' ? 'line-through' : 'none', opacity: task.status === 'completed' ? 0.5 : 1 }}>
                    {task.title}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                      style={{ background: pc.bg, color: pc.text, border: `1px solid ${pc.border}` }}>
                      {task.priority}
                    </span>
                    {task.due_date && (
                      <span className="text-[11px]" style={{ color: isOverdue ? '#f43f5e' : '#71717a' }}>
                        {isOverdue ? '⚠ ' : ''}Due {task.due_date}{task.due_time ? ` ${task.due_time}` : ''}
                      </span>
                    )}
                    {task.is_recurring === 1 && (
                      <span className="text-[11px]" style={{ color: `rgb(var(--accent-rgb-light))` }}>↻ {task.recur_interval}</span>
                    )}
                    {task.priority_score !== undefined && (
                      <span className="text-[11px] font-semibold" style={{ color: '#f59e0b' }}>Score: {task.priority_score}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1" style={{ flexShrink: 0 }}>
                  <button onClick={() => setExpanded(isExpanded ? null : task.id)}
                    className="p-1 tap" style={{ color: '#52525b' }}>
                    {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </button>
                  <button onClick={() => deleteTask(task.id)}
                    className="p-1 tap" style={{ color: '#52525b' }}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {/* Expanded panel */}
              {isExpanded && (
                <div className="px-4 pb-4 pt-3 space-y-3" style={{ borderTop: '1px solid var(--b)' }}>
                  {isEditing ? (
                    <div className="space-y-2">
                      {editErr && (
                        <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs"
                          style={{ background: 'rgb(239 68 68 / 0.1)', color: '#f87171' }}>
                          <AlertCircle size={12} />{editErr}
                        </div>
                      )}
                      <input value={editForm.title ?? ''}
                        onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && saveEdit(task.id)}
                        className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none"
                        placeholder="Title" />
                      <textarea value={editForm.description ?? ''}
                        onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                        rows={2}
                        className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none resize-none"
                        placeholder="Description" />
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-medium" style={{ color: 'var(--t-dim)' }}>DUE DATE</label>
                          <input type="date" value={editForm.due_date ?? ''}
                            onChange={e => setEditForm(f => ({ ...f, due_date: e.target.value }))}
                            className="w-full rounded-lg px-3 py-1.5 text-sm border focus:outline-none mt-0.5" />
                        </div>
                        <div>
                          <label className="text-[10px] font-medium" style={{ color: 'var(--t-dim)' }}>PRIORITY</label>
                          <select value={editForm.priority ?? 'medium'}
                            onChange={e => setEditForm(f => ({ ...f, priority: e.target.value as TaskPriority }))}
                            className="w-full rounded-lg px-3 py-1.5 text-sm border focus:outline-none mt-0.5">
                            {(['low', 'medium', 'high', 'urgent'] as TaskPriority[]).map(p =>
                              <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                            )}
                          </select>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => { setEditId(null); setEditErr(''); }}
                          className="flex-1 py-1.5 rounded-lg text-xs font-medium tap"
                          style={{ background: 'var(--s3)', color: 'var(--t-dim)' }}>Cancel</button>
                        <button onClick={() => saveEdit(task.id)}
                          className="flex-1 py-1.5 rounded-lg text-xs font-semibold tap flex items-center justify-center gap-1"
                          style={{ background: `rgb(var(--accent-rgb))`, color: '#fff' }}>
                          <Save size={12} /> Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {task.description && (
                        <p className="text-sm" style={{ color: '#a1a1aa' }}>{task.description}</p>
                      )}
                      <div className="flex flex-wrap gap-3 text-xs" style={{ color: '#52525b' }}>
                        <span>Status: <span className="text-head font-medium">{STATUS_LABELS[task.status]}</span></span>
                        {task.follow_up_date && <span>Follow-up: <span className="text-head font-medium">{task.follow_up_date}</span></span>}
                        {task.deferred_count > 0 && <span style={{ color: '#f97316' }}>Deferred {task.deferred_count}×</span>}
                        <span>Created: {task.created_at.slice(0, 10)}</span>
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        {(['pending', 'in_progress', 'completed', 'cancelled'] as TaskStatus[]).map(s => (
                          <button key={s}
                            onClick={async () => { await api.patch(`/tasks/${task.id}`, { status: s }); fetchTasks(); }}
                            className="text-xs px-2.5 py-1 rounded-full tap font-semibold"
                            style={{
                              background: task.status === s ? `rgb(var(--accent-rgb) / 0.12)` : 'var(--s3)',
                              color: task.status === s ? `rgb(var(--accent-rgb-light))` : '#71717a',
                              border: `1px solid ${task.status === s ? `rgb(var(--accent-rgb) / 0.3)` : 'transparent'}`,
                            }}>
                            {STATUS_LABELS[s]}
                          </button>
                        ))}
                      </div>
                      <button onClick={() => startEdit(task)}
                        className="flex items-center gap-1.5 text-xs tap font-semibold"
                        style={{ color: 'var(--t-dim)' }}>
                        <Pencil size={12} /> Edit task
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {/* ── Completed section ── */}
        {showSplit && doneTasks.length > 0 && (
          <div className="mt-1">
            <button
              onClick={() => setShowDone(s => !s)}
              className="flex items-center gap-2 w-full py-2 px-1 tap"
            >
              <div className="flex-1 h-px" style={{ background: 'var(--b)' }} />
              <span className="text-[10px] font-black tracking-widest shrink-0"
                style={{ color: 'var(--t-faint)' }}>
                ✓ COMPLETED ({doneTasks.length})
              </span>
              <div className="flex-1 h-px" style={{ background: 'var(--b)' }} />
              <span style={{ color: 'var(--t-faint)', fontSize: 12 }}>{showDone ? '▲' : '▼'}</span>
            </button>

            {showDone && (
              <div className="space-y-2 mt-2">
                {doneTasks.map(task => {
                  const isExpanded = expanded === task.id;
                  const isEditing  = editId === task.id;
                  const pc = PRIORITY_COLOR[task.priority] ?? PRIORITY_COLOR.medium;
                  return (
                    <div key={task.id} className="card overflow-hidden" style={{ opacity: 0.75 }}>
                      <div className="flex items-center gap-3 px-4 py-3">
                        <button onClick={() => toggleStatus(task)}
                          className="flex items-center justify-center rounded-full border-2 tap transition-all"
                          style={{ width: 22, height: 22, flexShrink: 0,
                            background: `rgb(var(--accent-rgb))`, borderColor: `rgb(var(--accent-rgb))` }}>
                          <Check size={12} color="#fff" strokeWidth={3} />
                        </button>
                        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpanded(isExpanded ? null : task.id)}>
                          <p className="text-sm font-medium text-head truncate"
                            style={{ textDecoration: 'line-through', opacity: 0.6 }}>{task.title}</p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                              style={{ background: pc.bg, color: pc.text, border: `1px solid ${pc.border}` }}>
                              {task.priority}
                            </span>
                            {task.completed_at && (
                              <span className="text-[10px]" style={{ color: 'var(--t-faint)' }}>
                                Done {task.completed_at.slice(0, 10)}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1" style={{ flexShrink: 0 }}>
                          <button onClick={() => setExpanded(isExpanded ? null : task.id)}
                            className="p-1 tap" style={{ color: 'var(--t-faint)' }}>
                            {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                          </button>
                          <button onClick={() => deleteTask(task.id)}
                            className="p-1 tap" style={{ color: 'var(--t-faint)' }}>
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="px-4 pb-3 pt-3 space-y-2" style={{ borderTop: '1px solid var(--b)' }}>
                          {isEditing ? (
                            <div className="space-y-2">
                              {editErr && (
                                <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs"
                                  style={{ background: 'rgb(239 68 68 / 0.1)', color: '#f87171' }}>
                                  <AlertCircle size={12} />{editErr}
                                </div>
                              )}
                              <input value={editForm.title ?? ''}
                                onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                                onKeyDown={e => e.key === 'Enter' && saveEdit(task.id)}
                                className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none" placeholder="Title" />
                              <div className="flex gap-2">
                                <button onClick={() => { setEditId(null); setEditErr(''); }}
                                  className="flex-1 py-1.5 rounded-lg text-xs font-medium tap"
                                  style={{ background: 'var(--s3)', color: 'var(--t-dim)' }}>Cancel</button>
                                <button onClick={() => saveEdit(task.id)}
                                  className="flex-1 py-1.5 rounded-lg text-xs font-semibold tap flex items-center justify-center gap-1"
                                  style={{ background: `rgb(var(--accent-rgb))`, color: '#fff' }}>
                                  <Save size={12} /> Save
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              {task.description && (
                                <p className="text-xs" style={{ color: 'var(--t-muted)' }}>{task.description}</p>
                              )}
                              <div className="flex gap-2 flex-wrap">
                                <button onClick={async () => { await api.patch(`/tasks/${task.id}`, { status: 'pending' }); fetchTasks(); }}
                                  className="text-xs px-2.5 py-1 rounded-full tap font-semibold"
                                  style={{ background: 'var(--s3)', color: 'var(--t-dim)' }}>
                                  Reopen
                                </button>
                                <button onClick={() => startEdit(task)}
                                  className="flex items-center gap-1 text-xs tap font-semibold"
                                  style={{ color: 'var(--t-dim)' }}>
                                  <Pencil size={11} /> Edit
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </div>{/* end task list */}

      </div>{/* end zIndex wrapper */}
    </div>
  );
}
