import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import prisma from '../database/prisma';

const bookedStatuses = ['CONFIRMED', 'CHECKED_IN'] as const;

const publicUser = (user: {
  id: string;
  name: string | null;
  displayName?: string | null;
  avatar?: string | null;
  avatarUrl?: string | null;
}) => ({
  id: user.id,
  name: user.displayName || user.name || '',
  avatar: user.avatar || user.avatarUrl || null,
});

const reviewSelect = {
  id: true,
  userId: true,
  eventId: true,
  overallRating: true,
  title: true,
  comment: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, name: true, displayName: true, avatar: true, avatarUrl: true } },
  _count: { select: { likes: true, comments: true } },
} satisfies Prisma.ReviewSelect;

const canInteract = async (reviewerId: string, viewerId: string): Promise<boolean> => {
  if (reviewerId === viewerId) return true;
  return Boolean(await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId: viewerId, followingId: reviewerId } },
    select: { followerId: true },
  }));
};

const eventByPublicId = (eventId: string) => prisma.event.findFirst({
  where: { OR: [{ id: eventId }, { migoId: eventId }, { slug: eventId }] },
  select: { id: true, startDate: true, status: true, organizerId: true },
});

const updateEventRating = async (eventId: string) => {
  const aggregate = await prisma.review.aggregate({
    where: { eventId },
    _avg: { overallRating: true },
    _count: { _all: true },
  });
  await prisma.event.update({
    where: { id: eventId },
    data: {
      ratingAverage: aggregate._avg.overallRating || 0,
      ratingCount: aggregate._count._all,
    },
  });
};

export async function createEventReview(
  eventId: string,
  userId: string,
  input: { rating: number; title?: string | null; comment?: string | null },
) {
  const event = await eventByPublicId(eventId);
  if (!event) return null;
  if (event.startDate > new Date() || !await prisma.booking.findFirst({
    where: { eventId: event.id, userId, status: { in: [...bookedStatuses] } },
    select: { id: true },
  })) return { error: 'REVIEW_NOT_ALLOWED' as const };

  const review = await prisma.review.upsert({
    where: { userId_eventId: { userId, eventId: event.id } },
    create: {
      userId,
      eventId: event.id,
      overallRating: input.rating,
      title: input.title?.trim() || null,
      comment: input.comment?.trim() || null,
    },
    update: {
      overallRating: input.rating,
      title: input.title?.trim() || null,
      comment: input.comment?.trim() || null,
    },
    select: reviewSelect,
  });
  await updateEventRating(event.id);
  return { review };
}

export async function listEventReviews(eventId: string, viewerId?: string, page = 1, pageSize = 5, viewerRole?: string) {
  const event = await eventByPublicId(eventId);
  if (!event) return null;
  const followedAuthorIds = viewerId
    ? (await prisma.follow.findMany({
      where: { followerId: viewerId },
      select: { followingId: true },
    })).map(follow => follow.followingId)
    : [];
  const where: Prisma.ReviewWhereInput = {
    eventId: event.id,
    ...(viewerRole === 'ADMIN' ? {} : {
      user: {
        OR: [
          { isPrivate: false },
          ...(viewerId ? [{ id: viewerId }] : []),
          ...(followedAuthorIds.length ? [{ id: { in: followedAuthorIds } }] : []),
        ],
      },
    }),
  };
  const [total, reviews] = await Promise.all([
    prisma.review.count({ where }),
    prisma.review.findMany({
      where,
      select: reviewSelect,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  const likedIds = viewerId && reviews.length
    ? new Set((await prisma.reviewLike.findMany({
      where: { userId: viewerId, reviewId: { in: reviews.map(review => review.id) } },
      select: { reviewId: true },
    })).map(like => like.reviewId))
    : new Set<string>();
  const following = new Set(followedAuthorIds);
  return {
    items: reviews.map(review => ({
      id: review.id,
      rating: review.overallRating,
      title: review.title,
      comment: review.comment,
      createdAt: review.createdAt,
      user: publicUser(review.user),
      likeCount: review._count.likes,
      commentCount: review._count.comments,
      likedByMe: likedIds.has(review.id),
      canInteract: review.userId === viewerId || following.has(review.userId),
      isMine: review.userId === viewerId,
    })),
    total,
  };
}

export async function listUserReviews(
  userId: string,
  viewerId: string,
  viewerRole: string | undefined,
  page: number,
  pageSize = 20,
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true, isPrivate: true },
  });
  if (!user || user.status === 'DELETED' || (user.status === 'PAUSED' && viewerRole !== 'ADMIN')) return null;
  if (
    user.isPrivate
    && viewerId !== userId
    && viewerRole !== 'ADMIN'
    && !await prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: viewerId, followingId: userId } },
      select: { followerId: true },
    })
  ) return { error: 'PROFILE_PRIVATE' as const };

  const where = { userId };
  const [total, reviews] = await Promise.all([
    prisma.review.count({ where }),
    prisma.review.findMany({
      where,
      select: {
        ...reviewSelect,
        event: {
          select: { id: true, title: true, coverImage: true, startDate: true, venueName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  const likedIds = reviews.length
    ? new Set((await prisma.reviewLike.findMany({
      where: { userId: viewerId, reviewId: { in: reviews.map(review => review.id) } },
      select: { reviewId: true },
    })).map(like => like.reviewId))
    : new Set<string>();
  const isSelf = userId === viewerId;
  const followsReviewer = isSelf ? true : Boolean(await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId: viewerId, followingId: userId } },
    select: { followerId: true },
  }));

  return {
    items: reviews.map(review => ({
      id: review.id,
      rating: review.overallRating,
      title: review.title,
      comment: review.comment,
      createdAt: review.createdAt,
      user: publicUser(review.user),
      event: review.event,
      likeCount: review._count.likes,
      commentCount: review._count.comments,
      likedByMe: likedIds.has(review.id),
      canInteract: followsReviewer,
    })),
    total,
  };
}

const reviewForInteraction = (reviewId: string) => prisma.review.findUnique({
  where: { id: reviewId },
  select: { id: true, userId: true, eventId: true, user: { select: { isPrivate: true } } },
});

const notifyReviewAction = async (
  review: { id: string; userId: string },
  actorId: string,
  type: 'review_like' | 'review_comment',
) => {
  if (review.userId === actorId) return;
  const actor = await prisma.user.findUnique({
    where: { id: actorId },
    select: { name: true, displayName: true },
  });
  const actorName = actor?.displayName || actor?.name || 'Someone';
  const data: Prisma.InputJsonObject = { reviewId: review.id, userId: actorId };
  const notification = {
    userId: review.userId,
    type,
    title: type === 'review_like' ? 'New review like' : 'New review comment',
    message: type === 'review_like'
      ? `${actorName} liked your review.`
      : `${actorName} commented on your review.`,
    data,
  };
  if (type === 'review_like') {
    const id = `review_like_${createHash('sha256').update(`${review.id}:${actorId}`).digest('hex')}`;
    await prisma.notification.createMany({ data: [{ ...notification, id }], skipDuplicates: true });
  } else {
    await prisma.notification.create({ data: notification });
  }
};

export async function likeReview(reviewId: string, userId: string) {
  const review = await reviewForInteraction(reviewId);
  if (!review) return null;
  if (!await canInteract(review.userId, userId)) return { error: 'FOLLOW_REQUIRED' as const };
  const result = await prisma.reviewLike.createMany({
    data: [{ reviewId, userId }],
    skipDuplicates: true,
  });
  if (result.count) await notifyReviewAction(review, userId, 'review_like');
  const likeCount = await prisma.reviewLike.count({ where: { reviewId } });
  return { likeCount, likedByMe: true };
}

export async function unlikeReview(reviewId: string, userId: string) {
  const review = await reviewForInteraction(reviewId);
  if (!review) return null;
  if (!await canInteract(review.userId, userId)) return { error: 'FOLLOW_REQUIRED' as const };
  await prisma.reviewLike.deleteMany({ where: { reviewId, userId } });
  const likeCount = await prisma.reviewLike.count({ where: { reviewId } });
  return { likeCount, likedByMe: false };
}

export async function listReviewComments(
  reviewId: string,
  viewerId: string,
  viewerRole: string | undefined,
  page = 1,
  pageSize = 20,
) {
  const review = await reviewForInteraction(reviewId);
  if (!review) return null;
  if (
    review.user.isPrivate
    && review.userId !== viewerId
    && viewerRole !== 'ADMIN'
    && !await canInteract(review.userId, viewerId)
  ) return { error: 'PROFILE_PRIVATE' as const };
  const where = { reviewId };
  const [total, comments] = await Promise.all([
    prisma.reviewComment.count({ where }),
    prisma.reviewComment.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, displayName: true, avatar: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return {
    items: comments.map(comment => ({
      id: comment.id,
      body: comment.body,
      createdAt: comment.createdAt,
      user: publicUser(comment.user),
      canDelete: comment.userId === viewerId || review.userId === viewerId || viewerRole === 'ADMIN',
    })),
    total,
  };
}

export async function createReviewComment(reviewId: string, userId: string, body: string) {
  const review = await reviewForInteraction(reviewId);
  if (!review) return null;
  if (!await canInteract(review.userId, userId)) return { error: 'FOLLOW_REQUIRED' as const };
  const comment = await prisma.reviewComment.create({
    data: { reviewId, userId, body: body.trim() },
    include: {
      user: { select: { id: true, name: true, displayName: true, avatar: true, avatarUrl: true } },
    },
  });
  await notifyReviewAction(review, userId, 'review_comment');
  return {
    id: comment.id,
    body: comment.body,
    createdAt: comment.createdAt,
    user: publicUser(comment.user),
    canDelete: true,
  };
}

export async function deleteReviewComment(
  reviewId: string,
  commentId: string,
  userId: string,
  viewerRole?: string,
) {
  const comment = await prisma.reviewComment.findUnique({
    where: { id: commentId },
    select: { id: true, userId: true, reviewId: true, review: { select: { userId: true } } },
  });
  if (!comment || comment.reviewId !== reviewId) return 'NOT_FOUND' as const;
  if (
    comment.userId !== userId
    && comment.review.userId !== userId
    && viewerRole !== 'ADMIN'
  ) return 'FORBIDDEN' as const;
  await prisma.reviewComment.delete({ where: { id: commentId } });
  return 'DELETED' as const;
}

export async function deleteReview(reviewId: string, userId: string, viewerRole?: string) {
  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    select: { id: true, userId: true, eventId: true },
  });
  if (!review) return 'NOT_FOUND' as const;
  if (review.userId !== userId && viewerRole !== 'ADMIN') return 'FORBIDDEN' as const;
  await prisma.review.delete({ where: { id: reviewId } });
  await updateEventRating(review.eventId);
  return 'DELETED' as const;
}
