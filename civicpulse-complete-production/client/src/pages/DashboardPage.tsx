import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import IssueCard from '../components/IssueCard';
import LoadingSpinner from '../components/LoadingSpinner';
import { useAuth } from '../context/AuthContext';
import { api, apiErrorMessage } from '../lib/api';
import type { ApiSuccess, Issue, IssueStatus, IssueUrgency, PaginationMeta } from '../types';

const STATUS_OPTIONS: Array<IssueStatus | 'ALL'> = ['ALL', 'PENDING', 'IN_PROGRESS', 'RESOLVED', 'REJECTED'];
const URGENCY_OPTIONS: Array<IssueUrgency | 'ALL'> = ['ALL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const POLL_MS = 20_000;

export default function DashboardPage() {
  const { user } = useAuth();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<IssueStatus | 'ALL'>('ALL');
  const [urgency, setUrgency] = useState<IssueUrgency | 'ALL'>('ALL');
  const [sort, setSort] = useState<'newest' | 'upvotes' | 'urgency'>('newest');
  const [mineOnly, setMineOnly] = useState(false);
  const [page, setPage] = useState(1);
  const firstLoad = useRef(true);

  const fetchIssues = useCallback(async () => {
    try {
      const res = await api.get<ApiSuccess<Issue[]>>('/issues', {
        params: {
          page,
          limit: 12,
          sort,
          ...(status !== 'ALL' && { status }),
          ...(urgency !== 'ALL' && { urgency }),
          ...(mineOnly && { mine: 'true' }),
        },
      });
      setIssues(res.data.data);
      setMeta(res.data.meta ?? null);
    } catch (err) {
      if (!firstLoad.current || user) toast.error(apiErrorMessage(err, 'Could not load issues'));
    } finally {
      setLoading(false);
      firstLoad.current = false;
    }
  }, [page, sort, status, urgency, mineOnly, user]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchIssues();
  }, [fetchIssues, user]);

  // Lightweight "live" feed: re-poll in the background without flashing the loading state.
  useEffect(() => {
    if (!user) return;
    const id = setInterval(fetchIssues, POLL_MS);
    return () => clearInterval(id);
  }, [fetchIssues, user]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Civic issue feed</h1>
          <p className="mt-1 text-sm text-slate-500">
            {user
              ? user.role === 'CITIZEN'
                ? 'What people are reporting near you, updated live.'
                : 'Issues routed to your department and ward.'
              : 'Sign in to see live reports and submit your own.'}
          </p>
        </div>
      </div>

      {!user ? (
        <div className="mt-10 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-slate-600">Sign in to view the live issue feed and report problems in your area.</p>
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Select label="Status" value={status} onChange={(v) => { setStatus(v as typeof status); setPage(1); }} options={STATUS_OPTIONS} />
            <Select label="Urgency" value={urgency} onChange={(v) => { setUrgency(v as typeof urgency); setPage(1); }} options={URGENCY_OPTIONS} />
            <Select
              label="Sort"
              value={sort}
              onChange={(v) => { setSort(v as typeof sort); setPage(1); }}
              options={['newest', 'upvotes', 'urgency']}
            />
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={mineOnly}
                onChange={(e) => { setMineOnly(e.target.checked); setPage(1); }}
                className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              My reports only
            </label>
            <button onClick={fetchIssues} className="ml-auto text-sm font-medium text-brand-700 hover:underline">
              Refresh
            </button>
          </div>

          {loading ? (
            <LoadingSpinner />
          ) : issues.length === 0 ? (
            <div className="mt-10 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
              No issues match these filters yet.
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-1 gap-4">
              {issues.map((issue) => (
                <IssueCard key={issue.id} issue={issue} />
              ))}
            </div>
          )}

          {meta && meta.totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-3 text-sm">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-md border border-slate-200 px-3 py-1.5 disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-slate-500">
                Page {meta.page} of {meta.totalPages}
              </span>
              <button
                disabled={page >= meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-md border border-slate-200 px-3 py-1.5 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-600">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
