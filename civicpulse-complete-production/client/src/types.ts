export type Role = 'CITIZEN' | 'OFFICIAL' | 'ADMIN';
export type IssueStatus = 'PENDING' | 'IN_PROGRESS' | 'RESOLVED' | 'REJECTED';
export type IssueUrgency = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface User {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: Role;
  departmentId: string | null;
  assignedWardId: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface Location {
  id: string;
  state: string;
  district: string;
  city: string;
  wardName: string;
  wardNumber: string;
  colonyName: string | null;
  zipCode: string;
  latitude: number;
  longitude: number;
  parentId: string | null;
}

export interface Department {
  id: string;
  name: string;
  code: string;
  contactEmail: string;
}

export interface Issue {
  id: string;
  title: string;
  description: string;
  mediaUrls: string[];
  status: IssueStatus;
  urgency: IssueUrgency;
  latitude: number | null;
  longitude: number | null;
  upvotesCount: number;
  resolvedAt: string | null;
  aiSummary: string | null;
  aiConfidence: number | null;
  aiFlaggedIrrelevant: boolean;
  aiModel: string | null;
  createdAt: string;
  updatedAt: string;
  location: Location;
  department: Department;
  user: { id: string; fullName: string };
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiError {
  success: false;
  error: { code: string; message: string; details?: unknown };
}

export interface TwitterDraft {
  text: string;
  intentUrl: string;
  handles: string[];
  warnings: string[];
}

export interface AiVerdict {
  source: 'gemini' | 'fallback';
  model?: string;
  confidence: number;
  detectedDepartment: string | null;
  urgencyLevel: IssueUrgency;
  summary: string;
  flaggedIrrelevant: boolean;
  degraded: boolean;
  fallbackReason?: string;
  departmentRoutedBy: 'user' | 'ai' | 'text' | 'default';
}

export interface SubmissionResult {
  issue: Issue;
  ai: AiVerdict;
  twitter: TwitterDraft | null;
}
