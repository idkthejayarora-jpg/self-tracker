import { useEffect, useState, useCallback } from 'react';
import { Plus, Check, Trash2, ChevronDown, ChevronUp, Zap } from 'lucide-react';
import api from '../lib/api';
import { useSync } from '../hooks/useSync';
import type { Task, TaskPriority, TaskStatus } from '../types';

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'text-red-400 border-red-700 bg-red-900/20',
  high: 'text-orange-400 border-orange-700 bg-orange-900/20',
  medium: 'text-yellow-400 border-yellow-700 bg-yellow-900/20',
  low: 'text-green-400 border-green-700 bg-green-900/20',
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Done',
  cancelled: 'Cancelled',
};

interface TaskFormData {
  title: string;
  description: string;
  due_date: string;
  priority: TaskPriority;
  is_recurring: boolean;
  recur_interval: string;
  follow_up_date: string;
}

const EMPTY_FORM: TaskFormData = {
  title: '',
  description: '',
  due_date: '',
  priority: 'medium',
  is_recurring: false,
  recur_interval: 'daily',
  follow_up_date: '',
};

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [queueView, setQueueView] = useState(false);
  const [filter, setFilter] = useState<'all' | TaskStatus>('all');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<TaskFormData>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  const fetchTasks = useCallback(async () => {
    const url = queueView ? '/tasks/priority-queue' : '/tasks';
    const params = !queueView && filter !== 'all' ? { status: filter } : {};
    const res = await api.get<Task[]>(url, { params });
    setTasks(res.data);
  }, [queueView, filter]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);
  useSync(fetchTasks, 30000);

  async function createTask() {
    if (!form.title.trim()) return;
    setSubmitting(true);
    try {
      await api.post('/tasks', {
        ...form,
        is_recurring: form.is_recurring,
        recur_interval: form.is_recurring ? form.recur_interval : undefined,
        follow_up_date: form.follow_up_date || undefined,
        due_date: form.due_date || undefined,
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      fetchTasks();
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleStatus(task: Task) {
    const newStatus: TaskStatus = task.status === 'completed' ? 'pending' : 'completed';
    await api.patch(`/tasks/${task.id}`, { status: newStatus });
    fetchTasks();
  }

  async function deleteTask(id: number) {
    await api.delete(`/tasks/${id}`);
    setTasks(prev => prev.filter(t => t.id !== id));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Tasks</h1>
        <button
          onClick={() => setShowForm(s => !s)}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} /> New task
        </button>
      </div>

      {/* Add task form */}
      {showForm && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
          <input
            autoFocus
            placeholder="Task title"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <textarea
            placeholder="Description (optional)"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            rows={2}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Due date</label>
              <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Priority</label>
              <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as TaskPriority }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                {['low', 'medium', 'high', 'urgent'].map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Follow-up date</label>
              <input type="date" value={form.follow_up_date} onChange={e => setForm(f => ({ ...f, follow_up_date: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div className="flex items-end gap-2 pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_recurring} onChange={e => setForm(f => ({ ...f, is_recurring: e.target.checked }))}
                  className="rounded" />
                <span className="text-xs text-gray-400">Recurring</span>
              </label>
              {form.is_recurring && (
                <select value={form.recur_interval} onChange={e => setForm(f => ({ ...f, recur_interval: e.target.value }))}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none">
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              )}
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors">Cancel</button>
            <button onClick={createTask} disabled={submitting || !form.title.trim()}
              className="px-4 py-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm rounded-lg font-medium transition-colors">
              {submitting ? 'Adding...' : 'Add task'}
            </button>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setQueueView(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            queueView ? 'bg-yellow-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          <Zap size={12} /> Focus Queue
        </button>
        {!queueView && (['all', 'pending', 'in_progress', 'completed', 'cancelled'] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === s ? 'bg-brand-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {s === 'all' ? 'All' : STATUS_LABELS[s as TaskStatus]}
          </button>
        ))}
      </div>

      {/* Task list */}
      <div className="space-y-2">
        {tasks.length === 0 && (
          <div className="text-center py-12 text-gray-500">No tasks found.</div>
        )}
        {tasks.map(task => {
          const isExpanded = expanded === task.id;
          const isOverdue = task.due_date && task.due_date < new Date().toISOString().slice(0, 10) && task.status !== 'completed';
          return (
            <div key={task.id} className={`bg-gray-900 border rounded-xl overflow-hidden transition-colors ${
              isOverdue ? 'border-red-800' : 'border-gray-800'
            }`}>
              <div className="flex items-center gap-3 px-4 py-3">
                <button
                  onClick={() => toggleStatus(task)}
                  className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                    task.status === 'completed' ? 'bg-brand-600 border-brand-600' : 'border-gray-600 hover:border-brand-500'
                  }`}
                >
                  {task.status === 'completed' && <Check size={12} className="text-white" />}
                </button>

                <div className="flex-1 min-w-0" onClick={() => setExpanded(isExpanded ? null : task.id)}>
                  <p className={`text-sm font-medium ${task.status === 'completed' ? 'line-through text-gray-500' : 'text-gray-100'}`}>
                    {task.title}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className={`text-xs px-1.5 py-0.5 rounded border ${PRIORITY_COLORS[task.priority]}`}>{task.priority}</span>
                    {task.due_date && (
                      <span className={`text-xs ${isOverdue ? 'text-red-400' : 'text-gray-500'}`}>
                        {isOverdue ? '⚠ ' : ''}Due {task.due_date}
                      </span>
                    )}
                    {task.is_recurring === 1 && (
                      <span className="text-xs text-brand-400">↻ {task.recur_interval}</span>
                    )}
                    {task.priority_score !== undefined && (
                      <span className="text-xs text-yellow-500 font-medium">Score: {task.priority_score}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => setExpanded(isExpanded ? null : task.id)} className="p-1 text-gray-500 hover:text-gray-300">
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  <button onClick={() => deleteTask(task.id)} className="p-1 text-gray-600 hover:text-red-400 transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="px-4 pb-3 border-t border-gray-800 pt-3 space-y-1.5">
                  {task.description && <p className="text-sm text-gray-300">{task.description}</p>}
                  <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                    <span>Status: <span className="text-gray-300">{STATUS_LABELS[task.status]}</span></span>
                    {task.follow_up_date && <span>Follow-up: <span className="text-gray-300">{task.follow_up_date}</span></span>}
                    {task.deferred_count > 0 && <span className="text-orange-400">Deferred {task.deferred_count}×</span>}
                    <span>Created: {task.created_at.slice(0, 10)}</span>
                  </div>
                  {/* Status change */}
                  <div className="flex gap-2 mt-2">
                    {(['pending', 'in_progress', 'completed', 'cancelled'] as TaskStatus[]).map(s => (
                      <button key={s}
                        onClick={async () => { await api.patch(`/tasks/${task.id}`, { status: s }); fetchTasks(); }}
                        className={`text-xs px-2 py-1 rounded transition-colors ${
                          task.status === s ? 'bg-brand-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                        }`}
                      >
                        {STATUS_LABELS[s]}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
