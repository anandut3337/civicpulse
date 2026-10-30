import type { IssueStatus, IssueUrgency, Role } from './enums';

/** Identity attached to the request after JWT verification. */
export interface AuthUser {
  id: string;
  role: Role;
  /** Set for OFFICIAL users: the department they act for. */
  departmentId: string | null;
  /** Set for OFFICIAL users: the WARD-level Location they are responsible for. */
  assignedWardId: string | null;
}

/** Claims we put inside the JWT (subject = user id). */
export interface JwtClaims {
  role: Role;
  departmentId: string | null;
  assignedWardId: string | null;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}

/** Output of the rule-based classifier (see categorization.service.ts). */
export interface Classification {
  departmentCode: string | null;
  urgency: IssueUrgency;
  /** 0..1 heuristic confidence; useful for routing low-confidence items to manual triage. */
  confidence: number;
}

/** Row returned by the coordinate -> locality resolver. */
export interface ResolvedLocation {
  id: string;
  state: string;
  district: string;
  city: string;
  wardName: string;
  wardNumber: string;
  colonyName: string | null;
  zipCode: string;
  parentId: string | null;
  distanceKm: number;
}

export interface IssueListFilters {
  status?: IssueStatus;
  urgency?: IssueUrgency;
  departmentId?: string;
  locationId?: string;
  wardId?: string;
  mine?: boolean;
}
