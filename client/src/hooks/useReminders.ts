import { useEffect, useCallback, useRef } from 'react';
import api from '../lib/api';
import type { Reminder } from '../types';

export function useReminders(enabled: boolean) {
  const firedIds = useRef<Set<number>>(new Set());

  const checkDue = useCallback(async () => {
    if (!enabled) return;
    try {
      const { data }: { data: Reminder[] } = await api.get('/reminders/due-now');
      data.forEach(r => {
        if (firedIds.current.has(r.id)) return;
        firedIds.current.add(r.id);

        if (Notification.permission === 'granted') {
          new Notification(r.title, {
            body: r.description || undefined,
            icon: '/favicon.ico',
          });
        }
        // Dismiss one-shot reminders automatically after showing
        if (r.repeat === 'none') {
          api.patch(`/reminders/${r.id}`, { status: 'dismissed' });
        } else {
          api.patch(`/reminders/${r.id}`, { status: 'dismissed' });
        }
      });
    } catch {
      // silently ignore
    }
  }, [enabled]);

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    checkDue();
    const id = setInterval(checkDue, 30000); // check every 30s
    document.addEventListener('visibilitychange', checkDue);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', checkDue);
    };
  }, [enabled, checkDue]);
}
