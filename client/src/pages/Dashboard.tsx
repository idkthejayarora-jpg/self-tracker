import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Flame, CheckSquare, BookOpen, Zap, ArrowRight } from 'lucide-react';
import api from '../lib/api';
import { useSync } from '../hooks/useSync';
import type { DashboardData, Task } from '../types';
import { format } from 'date-fns';

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'text-red-400 bg-red-900/30 border-red-800',
  high: 'text-orange-400 bg-orange-900/30 border-orange-800',
  medium: 'text-yellow-400 bg-yellow-900/30 border-yellow-800',
  low: 'text-green-400 bg-green-900/30 border-green-800',
};

const MOOD_EMOJI = ['', '😞', '😕', '😐', '🙂', '😄'];

function StreakCard({ label, current, longest, icon: Icon, color }: {
  label: string; current: number; longest: number; icon: any; color: string;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={16} className={color} />
        <span className="text-xs text-gray-400 font-medium">{label}</span>
      </div>
      <p className={`text-3xl font-bold ${color}`}>{current}</p>
      <p className="text-xs text-gray-500 mt-1">Best: {longest}</p>
    </div>
  );
}

function TaskRow({ task }: { task: Task }) {
  const isOverdue = task.due_date && task.due_date < new Date().toISOString().slice(0, 10);
  return (
    <div className="flex items-start gap-3 py-2 border-b border-gray-800 last:border-0">
      <div className={`mt-0.5 text-xs px-2 py-0.5 rounded border font-medium ${PRIORITY_COLORS[task.priority]}`}>
        {task.priority}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-100 truncate">{task.title}</p>
        {task.due_date && (
          <p className={`text-xs mt-0.5 ${isOverdue ? 'text-red-400' : 'text-gray-500'}`}>
            {isOverdue ? 'Overdue · ' : ''}Due {task.due_date}
          </p>
        )}
      </div>
      {task.priority_score !== undefined && (
        <span className="text-xs text-gray-500 shrink-0">#{task.priority_score}</span>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);

  const fetch = useCallback(async () => {
    const res = await api.get<DashboardData>('/dashboard');
    setData(res.data);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);
  useSync(fetch, 60000);

  if (!data) return <div className="text-gray-500 p-8">Loading...</div>;

  const { streaks, stats, priorityQueue, pendingToday, journal } = data;
  const today = format(new Date(), 'EEEE, d MMMM yyyy');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Good {getGreeting()}</h1>
        <p className="text-gray-400 text-sm mt-1">{today}</p>
      </div>

      {/* Streaks */}
      <div className="grid grid-cols-3 gap-3">
        <StreakCard label="Tasks" current={streaks.tasks?.current ?? 0} longest={streaks.tasks?.longest ?? 0} icon={CheckSquare} color="text-brand-400" />
        <StreakCard label="Journal" current={streaks.journal?.current ?? 0} longest={streaks.journal?.longest ?? 0} icon={BookOpen} color="text-purple-400" />
        <StreakCard label="Overall" current={streaks.overall?.current ?? 0} longest={streaks.overall?.longest ?? 0} icon={Flame} color="text-orange-400" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-white">{stats.completedTasks}</p>
          <p className="text-xs text-gray-400 mt-1">Tasks done</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-white">{stats.totalTasks - stats.completedTasks}</p>
          <p className="text-xs text-gray-400 mt-1">Remaining</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-white">{stats.totalJournal}</p>
          <p className="text-xs text-gray-400 mt-1">Journal entries</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Focus Queue */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Zap size={16} className="text-yellow-400" />
              <h2 className="font-semibold text-white text-sm">Focus Queue</h2>
            </div>
            <Link to="/tasks" className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1">
              All tasks <ArrowRight size={12} />
            </Link>
          </div>
          {priorityQueue.length === 0 ? (
            <p className="text-gray-500 text-sm py-4 text-center">All caught up!</p>
          ) : (
            priorityQueue.map(t => <TaskRow key={t.id} task={t} />)
          )}
        </div>

        {/* Due Today */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-white text-sm">Due Today / Overdue</h2>
            <span className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded-full">
              {pendingToday.length}
            </span>
          </div>
          {pendingToday.length === 0 ? (
            <p className="text-gray-500 text-sm py-4 text-center">Nothing due today</p>
          ) : (
            pendingToday.slice(0, 5).map(t => <TaskRow key={t.id} task={t} />)
          )}
        </div>
      </div>

      {/* Today's Journal */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <BookOpen size={16} className="text-purple-400" />
            <h2 className="font-semibold text-white text-sm">Today's Journal</h2>
          </div>
          <Link to="/journal" className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1">
            {journal ? 'Edit' : 'Write'} <ArrowRight size={12} />
          </Link>
        </div>
        {journal ? (
          <div>
            {journal.mood && (
              <span className="text-xl mr-2">{MOOD_EMOJI[journal.mood]}</span>
            )}
            <p className="text-sm text-gray-300 mt-2 line-clamp-3">{journal.content}</p>
          </div>
        ) : (
          <p className="text-gray-500 text-sm py-2">No entry yet today. <Link to="/journal" className="text-brand-400 hover:underline">Write one →</Link></p>
        )}
      </div>
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}
