import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthRequest, authenticate } from '../middlewares/auth.middleware';
import { asyncHandler } from '../middlewares/error.middleware';
import {
  createReviewComment,
  deleteReview,
  deleteReviewComment,
  likeReview,
  listReviewComments,
  unlikeReview,
} from '../services/reviews.service';

const router = Router();
router.use(authenticate);

const parsePagination = (query: Record<string, unknown>) => {
  const page = query.page === undefined ? 1 : Number(query.page);
  const pageSize = query.pageSize === undefined ? 20 : Number(query.pageSize);
  if (
    !Number.isInteger(page) || page < 1
    || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50
  ) return null;
  return { page, pageSize };
};

router.delete('/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await deleteReview(req.params.id, req.userId!, req.user?.role);
  if (result === 'NOT_FOUND') {
    res.status(404).json({ success: false, error: 'Review not found' });
    return;
  }
  if (result === 'FORBIDDEN') {
    res.status(403).json({ success: false, error: 'Not allowed to delete this review' });
    return;
  }
  res.json({ success: true });
}));

router.post('/:id/like', asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await likeReview(req.params.id, req.userId!);
  if (!result) {
    res.status(404).json({ success: false, error: 'Review not found' });
    return;
  }
  if ('error' in result) {
    res.status(403).json({ success: false, error: 'Follow the reviewer to interact', code: result.error });
    return;
  }
  res.json({ success: true, data: result });
}));

router.delete('/:id/like', asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await unlikeReview(req.params.id, req.userId!);
  if (!result) {
    res.status(404).json({ success: false, error: 'Review not found' });
    return;
  }
  if ('error' in result) {
    res.status(403).json({ success: false, error: 'Follow the reviewer to interact', code: result.error });
    return;
  }
  res.json({ success: true, data: result });
}));

router.get('/:id/comments', asyncHandler(async (req: AuthRequest, res: Response) => {
  const pagination = parsePagination(req.query as Record<string, unknown>);
  if (!pagination) {
    res.status(400).json({ success: false, error: 'Invalid pagination' });
    return;
  }
  const data = await listReviewComments(
    req.params.id,
    req.userId!,
    req.user?.role,
    pagination.page,
    pagination.pageSize,
  );
  if (!data) {
    res.status(404).json({ success: false, error: 'Review not found' });
    return;
  }
  if ('error' in data && data.error === 'PROFILE_PRIVATE') {
    res.status(403).json({ success: false, error: 'This profile is private', code: data.error });
    return;
  }
  res.json({ success: true, data });
}));

router.post('/:id/comments', asyncHandler(async (req: AuthRequest, res: Response) => {
  const input = z.object({ body: z.string().trim().min(1).max(1000) }).strict().safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ success: false, error: 'Comment must be 1–1000 characters' });
    return;
  }
  const result = await createReviewComment(req.params.id, req.userId!, input.data.body);
  if (!result) {
    res.status(404).json({ success: false, error: 'Review not found' });
    return;
  }
  if ('error' in result) {
    res.status(403).json({ success: false, error: 'Follow the reviewer to interact', code: result.error });
    return;
  }
  res.status(201).json({ success: true, data: result });
}));

router.delete('/:id/comments/:commentId', asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await deleteReviewComment(
    req.params.id,
    req.params.commentId,
    req.userId!,
    req.user?.role,
  );
  if (result === 'NOT_FOUND') {
    res.status(404).json({ success: false, error: 'Comment not found' });
    return;
  }
  if (result === 'FORBIDDEN') {
    res.status(403).json({ success: false, error: 'Not allowed to delete this comment' });
    return;
  }
  res.json({ success: true });
}));

export { router as reviewsRouter };
