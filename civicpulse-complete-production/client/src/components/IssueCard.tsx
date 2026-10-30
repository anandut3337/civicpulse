import { formatDistanceToNow } from 'date-fns';
import { Link } from 'react-router-dom';
import type { Issue } from '../types';
import { StatusBadge, UrgencyBadge } from './Badges';

export default function IssueCard({ issue }: { issue: Issue }) {
  const thumb = issue.mediaUrls[0];
  const loc = issue.location;

  return (
    <Link
      to={`/issues/${issue.id}`}
      className="group flex gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-300 hover:shadow-md"
    >
      <div className="h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-slate-100">
        {thumb ? (
          <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="grid h-full w-full place-items-center text-xs text-slate-400">No photo</div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate font-semibold text-slate-900 group-hover:text-brand-700">{issue.title}</h3>
          <span className="shrink-0 text-xs text-slate-400">{formatDistanceToNow(new Date(issue.createdAt), { addSuffix: true })}</span>
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-slate-600">{issue.description}</p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge status={issue.status} />
          <UrgencyBadge urgency={issue.urgency} />
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">{issue.department.name}</span>
          <span className="text-xs text-slate-400">
            {loc.colonyName ? `${loc.colonyName}, ` : ''}
            {loc.wardName}
          </span>
          <span className="ml-auto flex items-center gap-1 text-xs font-medium text-slate-500">▲ {issue.upvotesCount}</span>
        </div>
      </div>
    </Link>
  );
}
