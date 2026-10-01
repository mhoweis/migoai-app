// src/routes/users.routes.ts
import { Router, Response } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "../database/prisma";
import { authenticate, AuthRequest } from "../middlewares/auth.middleware";
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

const router = Router();

router.use(authenticate);

router.get("/search", asyncHandler(async (req: AuthRequest, res: Response) => {
  const query = String(req.query.q || "").trim();
  if (query.length < 2) {
    res.status(400).json({ success: false, error: "q must be at least 2 characters" });
    return;
  }
  res.json({ success: true, data: await searchUsers(req.userId!, query) });
}));

router.get("/suggested", asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json({ success: true, data: await suggestedUsers(req.userId!) });
}));

router.get("/me/following", asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json({ success: true, data: await listFollowing(req.userId!) });
}));

router.post("/me/signals", asyncHandler(async (req: AuthRequest, res: Response) => {
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

router.get("/me/followers", asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json({ success: true, data: await listFollowers(req.userId!) });
}));

router.get("/me/dashboard", asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json({ success: true, data: await getHostDashboard(req.userId!) });
}));

router.post("/:id/follow", asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await followUser(req.userId!, req.params.id);
  if (!result) {
    res.status(404).json({ success: false, error: "User not found" });
    return;
  }
  if (result.error) {
    res.status(400).json({ success: false, error: "Cannot follow yourself" });
    return;
  }
  res.json({ success: true, data: result });
}));

router.delete("/:id/follow", asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await unfollowUser(req.userId!, req.params.id);
  if (!result) {
    res.status(404).json({ success: false, error: "User not found" });
    return;
  }
  if (result.error) {
    res.status(400).json({ success: false, error: "Cannot unfollow yourself" });
    return;
  }
  res.json({ success: true, data: result });
}));

const publicUserSelect = {
  id: true,
  email: true,
  name: true,
  phone: true,
  avatar: true,
  preferences: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

const updateUserSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    avatar: z.string().url().max(2048).nullable().optional(),
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
router.get("/", async (req: AuthRequest, res: Response) => {
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

router.put("/interests", async (req: AuthRequest, res: Response) => {
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

router.get("/me", async (req: AuthRequest, res: Response) => {
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

router.put("/me", async (req: AuthRequest, res: Response) => {
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
      select: { preferences: true },
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
    const user = await prisma.user.update({
      where: { id: req.userId! },
      data: {
        name: parsed.data.name,
        avatar: parsed.data.avatar,
        phone: parsed.data.phone,
        preferences,
      },
      select: { ...publicUserSelect, interests: true },
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
router.get("/:id", async (req: AuthRequest, res: Response) => {
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
router.put("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    if (!(await isSelfOrAdmin(req, id))) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid user data" });
    }
    const { name, avatar, preferences } = parsed.data;

    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        name,
        avatar,
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
router.delete("/:id", async (req: AuthRequest, res: Response) => {
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
