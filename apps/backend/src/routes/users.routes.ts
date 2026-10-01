// src/routes/users.routes.ts
import { Router, Response } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "../database/prisma";
import { authenticate, AuthRequest, optionalAuthenticate, requireHost } from "../middlewares/auth.middleware";
import { asyncHandler } from "../middlewares/error.middleware";
import {
  followUser,
  listFollowers,
  listFollowing,
  searchUsers,
  suggestedUsers,
  unfollowUser,
} from "../services/social.service";
import { recordSignal, SignalType } from "../services/recommendation.service";
import { getHostDashboard } from "../services/host-dashboard.service";
import { getUserProfile, listUserConnections, listUserEvents, ProfileEventType } from "../services/user-profile.service";
import { listUserReviews } from "../services/reviews.service";

const router = Router();

const parsePagination = (
  query: Record<string, unknown>,
  includePageSize: boolean,
): { page: number; pageSize: number } | undefined => {
  const page = query.page === undefined ? 1 : Number(query.page);
  const pageSize = !includePageSize || query.pageSize === undefined ? 20 : Number(query.pageSize);
  if (
    !Number.isInteger(page) || page < 1
    || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50
  ) return undefined;
  return { page, pageSize };
};

router.get("/search", authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const query = String(req.query.q || "").trim();
  if (query.length < 2) {
    res.status(400).json({ success: false, error: "q must be at least 2 characters" });
    return;
  }
  res.json({ success: true, data: await searchUsers(req.userId!, query) });
}));

router.get("/suggested", authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json({ success: true, data: await suggestedUsers(req.userId!) });
}));

router.get("/me/following", authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json({ success: true, data: await listFollowing(req.userId!) });
}));

router.post("/me/signals", authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const input = z.object({
    type: z.enum(["search", "view", "save", "unsave"]),
    eventId: z.string().optional(),
    context: z.object({
      query: z.string().max(200).optional(),
    }).strict().optional(),
  }).strict().parse(req.body);
  await recordSignal(req.userId!, input.type as SignalType, {
    eventId: input.eventId,
    context: input.context,
  });
  res.status(204).send();
}));

router.get("/me/followers", authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json({ success: true, data: await listFollowers(req.userId!) });
}));

router.get("/me/follow-requests", authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const pagination = parsePagination(req.query as Record<string, unknown>, true);
  if (!pagination) {
    res.status(400).json({ success: false, error: "Invalid pagination" });
    return;
  }
  const where = { targetId: req.userId!, requester: { status: "ACTIVE" as const } };
  const [total, rows] = await Promise.all([
    prisma.followRequest.count({ where }),
    prisma.followRequest.findMany({
      where,
      select: {
        createdAt: true,
        requester: {
          select: { id: true, name: true, displayName: true, avatar: true, avatarUrl: true, bio: true, isPrivate: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
    }),
  ]);
  res.json({
    success: true,
    data: {
      items: rows.map(({ requester, createdAt }) => ({
        id: requester.id,
        name: requester.displayName || requester.name || "",
        avatar: requester.avatar || requester.avatarUrl || null,
        bio: requester.bio,
        isPrivate: requester.isPrivate,
        isFollowing: false,
        followRequested: false,
        isMe: false,
        createdAt,
      })),
      total,
    },
  });
}));

router.post("/me/follow-requests/:userId/approve", authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const requesterId = req.params.userId;
  const targetId = req.userId!;
  const approved = await prisma.$transaction(async transaction => {
    const request = await transaction.followRequest.findUnique({
      where: { requesterId_targetId: { requesterId, targetId } },
      select: { requester: { select: { name: true, displayName: true } } },
    });
    if (!request) return false;
    await transaction.follow.upsert({
      where: { followerId_followingId: { followerId: requesterId, followingId: targetId } },
      create: { followerId: requesterId, followingId: targetId },
      update: {},
    });
    await transaction.followRequest.delete({
      where: { requesterId_targetId: { requesterId, targetId } },
    });
    const target = await transaction.user.findUnique({
      where: { id: targetId },
      select: { name: true, displayName: true },
    });
    const targetName = target?.displayName || target?.name || "Someone";
    await transaction.notification.create({
      data: {
        userId: requesterId,
        type: "follow_request_approved",
        title: "Follow request approved",
        message: `${targetName} approved your follow request.`,
        data: { userId: targetId },
      },
    });
    return true;
  });
  if (!approved) {
    res.status(404).json({ success: false, error: "Follow request not found" });
    return;
  }
  res.json({ success: true, data: { status: "following" } });
}));

router.delete("/me/follow-requests/:userId", authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const deleted = await prisma.followRequest.deleteMany({
    where: { requesterId: req.params.userId, targetId: req.userId! },
  });
  if (!deleted.count) {
    res.status(404).json({ success: false, error: "Follow request not found" });
    return;
  }
  res.json({ success: true, data: { deleted: true } });
}));

router.get("/me/dashboard", authenticate, requireHost, asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json({ success: true, data: await getHostDashboard(req.userId!) });
}));

router.get("/:id/profile", optionalAuthenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const profile = await getUserProfile(req.params.id, req.userId || "", req.user?.role);
  if (!profile) {
    res.status(404).json({ success: false, error: "User not found" });
    return;
  }
  res.json({ success: true, data: profile });
}));

router.get("/:id/followers", optionalAuthenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const pagination = parsePagination(req.query as Record<string, unknown>, true);
  if (!pagination) {
    res.status(400).json({ success: false, error: "Invalid pagination" });
    return;
  }
  const result = await listUserConnections(
    req.params.id,
    req.userId || "",
    req.user?.role,
    "followers",
    pagination.page,
    pagination.pageSize,
  );
  if (!result) {
    res.status(404).json({ success: false, error: "User not found" });
    return;
  }
  if ("error" in result && result.error === "PROFILE_PRIVATE") {
    res.status(403).json({ success: false, error: "This profile is private", code: "PROFILE_PRIVATE" });
    return;
  }
  res.json({ success: true, data: result });
}));

router.get("/:id/following", optionalAuthenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const pagination = parsePagination(req.query as Record<string, unknown>, true);
  if (!pagination) {
    res.status(400).json({ success: false, error: "Invalid pagination" });
    return;
  }
  const result = await listUserConnections(
    req.params.id,
    req.userId || "",
    req.user?.role,
    "following",
    pagination.page,
    pagination.pageSize,
  );
  if (!result) {
    res.status(404).json({ success: false, error: "User not found" });
    return;
  }
  if ("error" in result && result.error === "PROFILE_PRIVATE") {
    res.status(403).json({ success: false, error: "This profile is private", code: "PROFILE_PRIVATE" });
    return;
  }
  res.json({ success: true, data: result });
}));

router.get("/:id/events", optionalAuthenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const type = req.query.type === undefined ? "upcoming" : String(req.query.type);
  if (!["upcoming", "past", "attended", "hosted"].includes(type)) {
    res.status(400).json({ success: false, error: "Invalid event type" });
    return;
  }
  const pagination = parsePagination(req.query as Record<string, unknown>, true);
  if (!pagination) {
    res.status(400).json({ success: false, error: "Invalid pagination" });
    return;
  }
  const result = await listUserEvents(
    req.params.id,
    req.userId || "",
    req.user?.role,
    type as ProfileEventType,
    pagination.page,
    pagination.pageSize,
  );
  if (!result) {
    res.status(404).json({ success: false, error: "User not found" });
    return;
  }
  if ("error" in result && result.error === "PROFILE_PRIVATE") {
    res.status(403).json({ success: false, error: "This profile is private", code: "PROFILE_PRIVATE" });
    return;
  }
  res.json({ success: true, data: result });
}));

router.get("/:id/reviews", optionalAuthenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const pagination = parsePagination(req.query as Record<string, unknown>, true);
  if (!pagination) {
    res.status(400).json({ success: false, error: "Invalid pagination" });
    return;
  }
  const result = await listUserReviews(
    req.params.id,
    req.userId || "",
    req.user?.role,
    pagination.page,
    pagination.pageSize,
  );
  if (!result) {
    res.status(404).json({ success: false, error: "User not found" });
    return;
  }
  if ("error" in result && result.error === "PROFILE_PRIVATE") {
    res.status(403).json({ success: false, error: "This profile is private", code: "PROFILE_PRIVATE" });
    return;
  }
  res.json({ success: true, data: result });
}));

router.post("/:id/follow", authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  if (req.userId === req.params.id) {
    res.status(400).json({ success: false, error: "Cannot follow yourself" });
    return;
  }
  const target = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: { id: true, status: true, isPrivate: true },
  });
  if (!target || (target.status === "PAUSED" && req.user?.role !== "ADMIN")) {
    res.status(404).json({ success: false, error: "User not found" });
    return;
  }
  const existingFollow = await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId: req.userId!, followingId: target.id } },
    select: { followerId: true },
  });
  if (target.isPrivate && req.user?.role !== "ADMIN" && !existingFollow) {
    try {
      await prisma.$transaction(async transaction => {
        const requester = await transaction.user.findUnique({
          where: { id: req.userId! },
          select: { name: true, displayName: true },
        });
        await transaction.followRequest.create({
          data: { requesterId: req.userId!, targetId: target.id },
        });
        const requesterName = requester?.displayName || requester?.name || "Someone";
        await transaction.notification.create({
          data: {
            userId: target.id,
            type: "follow_request",
            title: "New follow request",
            message: `${requesterName} requested to follow you.`,
            data: { userId: req.userId! },
          },
        });
      });
    } catch (error: any) {
      if (error?.code !== "P2002") throw error;
    }
    res.json({ success: true, data: { status: "requested" } });
    return;
  }
  const result = await followUser(req.userId!, req.params.id);
  if (!result) {
    res.status(404).json({ success: false, error: "User not found" });
    return;
  }
  if (result.error) {
    res.status(400).json({ success: false, error: "Cannot follow yourself" });
    return;
  }
  res.json({ success: true, data: { ...result, status: "following" } });
}));

router.delete("/:id/follow", authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await unfollowUser(req.userId!, req.params.id);
  if (!result) {
    res.status(404).json({ success: false, error: "User not found" });
    return;
  }
  if (result.error) {
    res.status(400).json({ success: false, error: "Cannot unfollow yourself" });
    return;
  }
  await prisma.followRequest.deleteMany({
    where: { requesterId: req.userId!, targetId: req.params.id },
  });
  res.json({ success: true, data: result });
}));

const publicUserSelect = {
  id: true,
  email: true,
  name: true,
  phone: true,
  avatar: true,
  coverImage: true,
  bio: true,
  isPrivate: true,
  preferences: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

const updateUserSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    avatar: z.string().url().max(2048).nullable().optional(),
    bio: z.string().trim().max(500).nullable().optional(),
    coverImage: z.string().url().max(2048).nullable().optional(),
    isPrivate: z.boolean().optional(),
    phone: z.string().regex(/^\+[1-9]\d{7,14}$/).nullable().optional(),
    preferences: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const reminderPreferencesSchema = z
  .object({
    email: z.boolean().optional(),
    whatsapp: z.boolean().optional(),
    saved: z.boolean().optional(),
  })
  .strict();

const homeLayoutSchema = z
  .object({
    order: z.array(z.string()).max(20),
    hidden: z.array(z.string()).max(20),
  })
  .strict();

const isSelfOrAdmin = async (req: AuthRequest, id: string): Promise<boolean> => {
  if (req.userId === id) return true;
  // The JWT role can be up to 15 min stale — re-check admin in the DB.
  if (req.user?.role !== "ADMIN") return false;
  const me = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { role: true, isAdmin: true },
  });
  return me?.role === "ADMIN" || me?.isAdmin === true;
};

// Get all users (admin only)
router.get("/", authenticate, async (req: AuthRequest, res: Response) => {
  const me = req.userId
    ? await prisma.user.findUnique({
        where: { id: req.userId },
        select: { role: true, isAdmin: true },
      })
    : null;
  if (me?.role !== "ADMIN" && !me?.isAdmin) {
    return res.status(403).json({ error: "Insufficient permissions" });
  }
  try {
    const users = await prisma.user.findMany({ select: publicUserSelect });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

router.put("/interests", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { interests } = req.body;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (
      !Array.isArray(interests) ||
      interests.length > 50 ||
      !interests.every((i) => typeof i === "string" && i.length <= 100)
    ) {
      return res.status(400).json({ error: "Interests must be an array of strings" });
    }

    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { preferences: true },
    });
    const currentPreferences =
      existing?.preferences && typeof existing.preferences === "object" && !Array.isArray(existing.preferences)
        ? (existing.preferences as Prisma.JsonObject)
        : {};

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        preferences: { ...currentPreferences, interests },
      },
      select: publicUserSelect,
    });

    res.json({
      success: true,
      message: "Interests updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Update interests error:", error);
    res.status(500).json({ error: "Failed to update interests" });
  }
});

router.get("/me", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { ...publicUserSelect, interests: true },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(user);
  } catch (error) {
    console.error("Get current user error:", error);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

router.put("/me", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: "Invalid user data" });
      return;
    }
    const homeLayout = parsed.data.preferences?.homeLayout;
    if (homeLayout !== undefined && !homeLayoutSchema.safeParse(homeLayout).success) {
      res.status(400).json({ success: false, error: "Invalid home layout" });
      return;
    }
    const reminders = parsed.data.preferences?.reminders;
    if (reminders !== undefined && !reminderPreferencesSchema.safeParse(reminders).success) {
      res.status(400).json({ success: false, error: "Invalid reminder preferences" });
      return;
    }
    const existing = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { preferences: true, isPrivate: true },
    });
    const currentPreferences =
      existing?.preferences && typeof existing.preferences === "object" && !Array.isArray(existing.preferences)
        ? existing.preferences as Prisma.JsonObject
        : {};
    const mergedPreferences = (parsed.data.preferences
      ? { ...currentPreferences, ...parsed.data.preferences }
      : { ...currentPreferences }) as Prisma.JsonObject;
    if (reminders !== undefined) {
      const currentReminders = currentPreferences.reminders;
      mergedPreferences.reminders = {
        ...(currentReminders && typeof currentReminders === "object" && !Array.isArray(currentReminders)
          ? currentReminders as Prisma.JsonObject
          : {}),
        ...reminders as z.infer<typeof reminderPreferencesSchema>,
      };
    }
    const preferences = mergedPreferences as Prisma.InputJsonObject;
    const user = await prisma.$transaction(async transaction => {
      const updated = await transaction.user.update({
        where: { id: req.userId! },
        data: {
          name: parsed.data.name,
          avatar: parsed.data.avatar,
          bio: parsed.data.bio,
          coverImage: parsed.data.coverImage,
          phone: parsed.data.phone,
          isPrivate: parsed.data.isPrivate,
          preferences,
        },
        select: { ...publicUserSelect, interests: true },
      });
      if (existing?.isPrivate && parsed.data.isPrivate === false) {
        const requests = await transaction.followRequest.findMany({
          where: { targetId: req.userId! },
          select: { requesterId: true },
        });
        for (const request of requests) {
          await transaction.follow.upsert({
            where: { followerId_followingId: { followerId: request.requesterId, followingId: req.userId! } },
            create: { followerId: request.requesterId, followingId: req.userId! },
            update: {},
          });
          await transaction.notification.create({
            data: {
              userId: request.requesterId,
              type: "follow_request_approved",
              title: "Follow request approved",
              message: `${updated.name || "Someone"} approved your follow request.`,
              data: { userId: req.userId! },
            },
          });
        }
        await transaction.followRequest.deleteMany({ where: { targetId: req.userId! } });
      }
      return updated;
    });
    res.json({ success: true, data: user });
  } catch (error: any) {
    if (error?.code === "P2002") {
      res.status(409).json({ success: false, error: "Phone already in use" });
      return;
    }
    res.status(500).json({ success: false, error: "Failed to update user" });
  }
});

// Get user by ID (self or admin)
router.get("/:id", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    if (!(await isSelfOrAdmin(req, id))) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        ...publicUserSelect,
        bookings: true,
        reviews: true,
        wishlists: { include: { event: true } },
        organizedEvents: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

// Update user (self or admin)
router.put("/:id", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    if (!(await isSelfOrAdmin(req, id))) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid user data" });
    }
    const { name, avatar, bio, coverImage, preferences } = parsed.data;

    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        name,
        avatar,
        bio,
        coverImage,
        preferences: preferences as Prisma.InputJsonObject | undefined,
      },
      select: publicUserSelect,
    });

    res.json({
      message: "User updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to update user" });
  }
});

// Delete user (self or admin)
router.delete("/:id", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    if (!(await isSelfOrAdmin(req, id))) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    await prisma.$transaction([
      prisma.refreshToken.deleteMany({ where: { userId: id } }),
      prisma.user.delete({ where: { id } }),
    ]);

    res.json({ message: "User deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete user" });
  }
});

export { router as usersRouter };
