import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import LoadingSpinner from '../components/LoadingSpinner';
import { StatusBadge, UrgencyBadge } from '../components/Badges';
import { useAuth } from '../context/AuthContext';
import { api, apiErrorMessage } from '../lib/api';
import type { ApiSuccess, Issue, IssueStatus, TwitterDraft } from '../types';

const TRANSITIONS: Record<IssueStatus, IssueStatus[]> = {
  PENDING: ['IN_PROGRESS', 'REJECTED'],
  IN_PROGRESS: ['RESOLVED', 'REJECTED'],
  RESOLVED: [],
  REJECTED: [],
};

export default function IssueDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [issue, setIssue] = useState<Issue | null>(null);
  const [loading, setLoading] = useState(true);
  const [upvoted, setUpvoted] = useState(false);
  const [draft, setDraft] = useState<TwitterDraft | null>(null);
  const [updating, setUpdating] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const res = await api.get<ApiSuccess<Issue>>(`/issues/${id}`);
      setIssue(res.data.data);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not load this issue'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!id) return;
    api
      .get<ApiSuccess<TwitterDraft>>(`/issues/${id}/twitter-draft`)
      .then((res) => setDraft(res.data.data))
      .catch(() => setDraft(null));
  }, [id]);

  const toggleUpvote = async () => {
    if (!issue) return;
    try {
      if (upvoted) {
        await api.delete(`/issues/${issue.id}/upvote`);
        setIssue({ ...issue, upvotesCount: issue.upvotesCount - 1 });
      } else {
        await api.post(`/issues/${issue.id}/upvote`);
        setIssue({ ...issue, upvotesCount: issue.upvotesCount + 1 });
      }
      setUpvoted((v) => !v);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not update your upvote'));
    }
  };

  const updateStatus = async (next: IssueStatus) => {
    if (!issue) return;
    setUpdating(true);
    try {
      const res = await api.patch<ApiSuccess<Issue>>(`/issues/${issue.id}/status`, { status: next });
      setIssue(res.data.data);
      toast.success(`Marked as ${next.replace('_', ' ').toLowerCase()}`);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not update status'));
    } finally {
      setUpdating(false);
    }
  };

  if (loading) return <LoadingSpinner />;
  if (!issue) return <div className="mx-auto max-w-3xl px-4 py-12 text-center text-slate-500">Issue not found.</div>;

  const canModerate = user && (user.role === 'OFFICIAL' || user.role === 'ADMIN');
  const loc = issue.location;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      {issue.mediaUrls.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {issue.mediaUrls.map((url, i) =>
            /\.(mp4|mov|webm)(\?|$)/i.test(url) ? (
              <video key={i} src={url} controls className="aspect-video w-full rounded-lg object-cover" />
            ) : (
              <img key={i} src={url} alt="" className="aspect-video w-full rounded-lg object-cover" />
            ),
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={issue.status} />
        <UrgencyBadge urgency={issue.urgency} />
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">{issue.department.name}</span>
      </div>

      <h1 className="mt-3 text-2xl font-bold text-slate-900">{issue.title}</h1>
      <p className="mt-2 whitespace-pre-wrap text-slate-700">{issue.description}</p>

      {issue.aiSummary && (
        <div className="mt-4 rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-800">
          <span className="font-semibold">AI summary:</span> {issue.aiSummary}
        </div>
      )}

      <dl className="mt-6 grid grid-cols-2 gap-4 rounded-lg border border-slate-200 bg-white p-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-slate-400">Reported by</dt>
          <dd className="font-medium text-slate-800">{issue.user.fullName}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Location</dt>
          <dd className="font-medium text-slate-800">
            {loc.colonyName ? `${loc.colonyName}, ` : ''}
            {loc.wardName}
          </dd>
        </div>
        <div>
          <dt className="text-slate-400">Reported on</dt>
          <dd className="font-medium text-slate-800">{format(new Date(issue.createdAt), 'd MMM yyyy, p')}</dd>
        </div>
      </dl>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          onClick={toggleUpvote}
          disabled={!user}
          className={`flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium transition ${
            upvoted ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-slate-300 text-slate-700 hover:bg-slate-50'
          } disabled:cursor-not-allowed disabled:opacity-50`}
        >
          ▲ {upvoted ? 'Upvoted' : 'Upvote'} ({issue.upvotesCount})
        </button>

        {draft && (
          <a
            href={draft.intentUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Tag officials on X
          </a>
        )}
      </div>

      {canModerate && TRANSITIONS[issue.status].length > 0 && (
        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm font-medium text-slate-700">Update status</p>
          <div className="mt-2 flex gap-2">
            {TRANSITIONS[issue.status].map((next) => (
              <button
                key={next}
                disabled={updating}
                onClick={() => updateStatus(next)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Mark {next.replace('_', ' ').toLowerCase()}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
