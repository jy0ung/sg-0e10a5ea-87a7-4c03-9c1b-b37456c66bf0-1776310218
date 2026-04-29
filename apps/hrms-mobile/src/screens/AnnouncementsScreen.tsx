import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { listAnnouncements } from '@/services/hrmsService';
import type { Announcement, AnnouncementCategory, AnnouncementPriority } from '@flc/types';

const CATEGORY_LABELS: Record<AnnouncementCategory, string> = {
  general:   'General',
  policy:    'Policy',
  event:     'Event',
  emergency: 'Emergency',
  holiday:   'Holiday',
};

const PRIORITY_CLASSES: Record<AnnouncementPriority, string> = {
  low:    'bg-secondary text-muted-foreground',
  normal: 'bg-primary/10 text-primary',
  high:   'bg-yellow-900/30 text-yellow-400',
  urgent: 'bg-red-900/30 text-red-400',
};

function formatDate(value?: string) {
  if (!value) return 'Unpublished';
  return new Intl.DateTimeFormat('en-MY', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}

export default function AnnouncementsScreen() {
  const { employee } = useAuth();
  const navigate = useNavigate();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<AnnouncementCategory | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!employee?.companyId) return;

    setLoading(true);
    setError(null);
    listAnnouncements(employee.companyId)
      .then(setAnnouncements)
      .catch(err => setError(err instanceof Error ? err.message : 'Could not load announcements.'))
      .finally(() => setLoading(false));
  }, [employee?.companyId]);

  const filteredAnnouncements = useMemo(() => {
    if (selectedCategory === 'all') return announcements;
    return announcements.filter(item => item.category === selectedCategory);
  }, [announcements, selectedCategory]);

  const categories = useMemo(() => {
    const available = new Set(announcements.map(item => item.category));
    return (Object.keys(CATEGORY_LABELS) as AnnouncementCategory[]).filter(category => available.has(category));
  }, [announcements]);

  return (
    <div className="flex min-h-screen flex-col bg-background safe-top safe-bottom">
      <header className="flex items-center gap-3 px-5 pb-4 pt-6">
        <button onClick={() => navigate(-1)} className="text-muted-foreground">←</button>
        <div>
          <h1 className="text-lg font-bold text-foreground">Announcements</h1>
          <p className="text-xs text-muted-foreground">Company updates and HR notices</p>
        </div>
      </header>

      <main className="flex-1 px-5 pb-6">
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          <CategoryChip label="All" active={selectedCategory === 'all'} onClick={() => setSelectedCategory('all')} />
          {categories.map(category => (
            <CategoryChip
              key={category}
              label={CATEGORY_LABELS[category]}
              active={selectedCategory === category}
              onClick={() => setSelectedCategory(category)}
            />
          ))}
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : error ? (
          <div className="rounded-2xl bg-secondary p-4 text-sm text-destructive">{error}</div>
        ) : filteredAnnouncements.length === 0 ? (
          <div className="rounded-2xl bg-secondary p-5 text-sm text-muted-foreground">No announcements yet.</div>
        ) : (
          <ul className="space-y-3">
            {filteredAnnouncements.map(item => (
              <li key={item.id} className="rounded-2xl bg-secondary p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  {item.pinned && <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground">Pinned</span>}
                  <span className="rounded-full bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    {CATEGORY_LABELS[item.category]}
                  </span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${PRIORITY_CLASSES[item.priority]}`}>
                    {item.priority}
                  </span>
                </div>
                <h2 className="text-base font-semibold leading-snug text-foreground">{item.title}</h2>
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-muted-foreground">{item.body}</p>
                <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>{formatDate(item.publishedAt ?? item.createdAt)}</span>
                  {item.authorName && <span>{item.authorName}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function CategoryChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-4 py-2 text-xs font-medium ${active ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}
    >
      {label}
    </button>
  );
}