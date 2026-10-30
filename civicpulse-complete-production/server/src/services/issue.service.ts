import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { IssueStatus, Role, STATUS_TRANSITIONS, URGENCY_RANK } from '../models/enums';
import type { CreateIssueInput, ListIssuesQuery } from '../models/issue.schema';
import type { AuthUser, Paginated } from '../models/types';
import { AppError } from '../utils/AppError';
import { classifyIssue } from './categorization.service';
import { departmentService } from './department.service';
import { locationService } from './location.service';

/** Shape returned to clients: issue + the joined data dashboards always need. */
export const ISSUE_INCLUDE = {
  location: true,
  department: { select: { id: true, name: true, code: true } },
  user: { select: { id: true, fullName: true } },
} satisfies Prisma.IssueInclude;

export type IssueWithRelations = Prisma.IssueGetPayload<{ include: typeof ISSUE_INCLUDE }>;

/** The ward an issue belongs to = its location's parent, or itself if already ward-level. */
const wardIdOf = (loc: { id: string; parentId: string | null }) => loc.parentId ?? loc.id;

export const issueService = {
  /**
   * Create an issue and auto-route it:
   *   1. Location  <- explicit locationId OR nearest colony to the GPS pin
   *   2. Department <- explicit departmentCode OR keyword classification
   *   3. Urgency   <- max(user-supplied, inferred). Safety wins: a citizen
   *                   tagging "gas leak" as LOW still gets CRITICAL.
   */
  async create(user: AuthUser, input: CreateIssueInput) {
    const location = input.locationId
      ? await locationService.getById(input.locationId)
      : await locationService.resolveByCoordinates(input.latitude as number, input.longitude as number);

    const classification = classifyIssue(`${input.title} ${input.description}`);

    const departmentCode = input.departmentCode ?? classification.departmentCode;
    if (!departmentCode) {
      throw AppError.unprocessable(
        'DEPARTMENT_UNRESOLVED',
        'Could not determine the responsible department; please select a category',
      );
    }
    const department = await departmentService.findByCode(departmentCode);
    if (!department) {
      throw AppError.unprocessable('DEPARTMENT_UNKNOWN', `Unknown department code "${departmentCode}"`);
    }

    const requested = input.urgency ?? classification.urgency;
    const urgency = URGENCY_RANK[requested] >= URGENCY_RANK[classification.urgency] ? requested : classification.urgency;

    return prisma.issue.create({
      data: {
        title: input.title,
        description: input.description,
        mediaUrls: input.mediaUrls,
        urgency,
        latitude: input.latitude,
        longitude: input.longitude,
        userId: user.id,
        locationId: location.id,
        departmentId: department.id,
      },
      include: ISSUE_INCLUDE,
    });
  },

  /**
   * Paginated list. Officials are HARD-scoped to their own department and
   * ward regardless of query params (authorization, not just filtering).
   */
  async list(user: AuthUser, q: ListIssuesQuery): Promise<Paginated<unknown>> {
    const where: Prisma.IssueWhereInput = {
      ...(q.status && { status: q.status }),
      ...(q.urgency && { urgency: q.urgency }),
      ...(q.departmentId && { departmentId: q.departmentId }),
      ...(q.locationId && { locationId: q.locationId }),
      ...(q.wardId && { location: { OR: [{ id: q.wardId }, { parentId: q.wardId }] } }),
      ...(q.mine && { userId: user.id }),
    };

    if (user.role === Role.OFFICIAL) {
      where.departmentId = user.departmentId ?? '__none__';
      if (user.assignedWardId) {
        where.location = { OR: [{ id: user.assignedWardId }, { parentId: user.assignedWardId }] };
      }
    }

    const orderBy: Prisma.IssueOrderByWithRelationInput[] =
      q.sort === 'upvotes'
        ? [{ upvotesCount: 'desc' }, { createdAt: 'desc' }]
        : q.sort === 'urgency'
          ? [{ urgency: 'desc' }, { createdAt: 'desc' }] // enum declared LOW..CRITICAL, so desc = most urgent first
          : [{ createdAt: 'desc' }];

    const [items, total] = await prisma.$transaction([
      prisma.issue.findMany({
        where,
        orderBy,
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        include: ISSUE_INCLUDE,
      }),
      prisma.issue.count({ where }),
    ]);

    return { items, meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) } };
  },

  async getById(id: string) {
    const issue = await prisma.issue.findUnique({ where: { id }, include: ISSUE_INCLUDE });
    if (!issue) throw AppError.notFound('Issue not found');
    return issue;
  },

  /** Officials may only move issues in their own department + ward; admins are unrestricted. */
  async updateStatus(user: AuthUser, id: string, next: IssueStatus) {
    const issue = await prisma.issue.findUnique({ where: { id }, include: { location: true } });
    if (!issue) throw AppError.notFound('Issue not found');

    if (user.role === Role.OFFICIAL) {
      const sameDept = issue.departmentId === user.departmentId;
      const sameWard = !user.assignedWardId || wardIdOf(issue.location) === user.assignedWardId;
      if (!sameDept || !sameWard) throw AppError.forbidden('This issue is outside your department or ward');
    }

    if (!STATUS_TRANSITIONS[issue.status].includes(next)) {
      throw AppError.unprocessable(
        'INVALID_STATUS_TRANSITION',
        `Cannot move an issue from ${issue.status} to ${next}`,
      );
    }

    return prisma.issue.update({
      where: { id },
      data: { status: next, resolvedAt: next === IssueStatus.RESOLVED ? new Date() : null },
      include: ISSUE_INCLUDE,
    });
  },

  /** Idempotency is enforced by the (issueId,userId) unique index; duplicate => 409. */
  async upvote(userId: string, issueId: string) {
    const exists = await prisma.issue.findUnique({ where: { id: issueId }, select: { id: true } });
    if (!exists) throw AppError.notFound('Issue not found');

    return prisma.$transaction(async (tx) => {
      await tx.issueUpvote.create({ data: { issueId, userId } });
      return tx.issue.update({
        where: { id: issueId },
        data: { upvotesCount: { increment: 1 } },
        select: { id: true, upvotesCount: true },
      });
    });
  },

  async removeUpvote(userId: string, issueId: string) {
    return prisma.$transaction(async (tx) => {
      const { count } = await tx.issueUpvote.deleteMany({ where: { issueId, userId } });
      if (count === 0) throw AppError.notFound('You have not upvoted this issue');
      return tx.issue.update({
        where: { id: issueId },
        data: { upvotesCount: { decrement: 1 } },
        select: { id: true, upvotesCount: true },
      });
    });
  },

  /**
   * Social-accountability lookup: which officials (and Twitter/X handles) are
   * responsible for this issue's ward + department? Powers "tag the official".
   */
  async getAccountabilityHandles(issueId: string) {
    const issue = await prisma.issue.findUnique({
      where: { id: issueId },
      select: { departmentId: true, location: { select: { id: true, parentId: true } } },
    });
    if (!issue) throw AppError.notFound('Issue not found');

    return prisma.officialHandle.findMany({
      where: { wardId: wardIdOf(issue.location), departmentId: issue.departmentId },
      orderBy: { officialTitle: 'asc' },
    });
  },
};
