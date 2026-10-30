import clsx from 'clsx';
import type { IssueStatus, IssueUrgency } from '../types';

const STATUS_STYLES: Record<IssueStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  IN_PROGRESS: 'bg-blue-100 text-blue-800',
  RESOLVED: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-slate-200 text-slate-600',
};

const STATUS_LABEL: Record<IssueStatus, string> = {
  PENDING: 'Pending',
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Resolved',
  REJECTED: 'Rejected',
};

const URGENCY_STYLES: Record<IssueUrgency, string> = {
  LOW: 'bg-slate-100 text-slate-700',
  MEDIUM: 'bg-sky-100 text-sky-800',
  HIGH: 'bg-orange-100 text-orange-800',
  CRITICAL: 'bg-red-100 text-red-800',
};

export function StatusBadge({ status }: { status: IssueStatus }) {
  return (
    <span className={clsx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', STATUS_STYLES[status])}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function UrgencyBadge({ urgency }: { urgency: IssueUrgency }) {
  return (
    <span className={clsx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', URGENCY_STYLES[urgency])}>
      {urgency === 'CRITICAL' ? '⚠ Critical' : urgency.charAt(0) + urgency.slice(1).toLowerCase()}
    </span>
  );
}
