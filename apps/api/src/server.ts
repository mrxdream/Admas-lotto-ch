import "dotenv/config";

import express from "express";
import cors from "cors";
import helmet from "helmet";
import session from "express-session";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { prisma } from "./lib/prisma";

const app = express();
const port = Number(process.env.PORT) || 3000;

app.disable("x-powered-by");
app.use(helmet());
app.use(
  cors({
    origin: process.env.ADMIN_ORIGIN || "http://localhost:5173",
    credentials: true,
  }),
);
app.use(express.json({ limit: "20kb" }));

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET is not configured");
}

app.use(
  session({
    name: "admas.sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 8 * 60 * 60 * 1000,
    },
  }),
);

/* -------------------- HELPERS -------------------- */

function safeSecretEqual(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

function isPrismaErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

function botSecretAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  const expectedSecret = process.env.BOT_API_SECRET;
  const suppliedSecret = req.header("x-bot-api-secret");

  if (!expectedSecret) {
    return res.status(503).json({ error: "Bot API is not configured" });
  }
  if (!suppliedSecret || !safeSecretEqual(suppliedSecret, expectedSecret)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return next();
}

function adminDrawAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  if (req.session.adminAuthenticated) return next();

  const expectedSecret = process.env.ADMIN_API_SECRET;
  const suppliedSecret = req.header("x-admin-api-secret");

  if (!expectedSecret) {
    return res.status(503).json({ error: "Admin API is not configured" });
  }
  if (!suppliedSecret || !safeSecretEqual(suppliedSecret, expectedSecret)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return next();
}

/* -------------------- HEALTH -------------------- */

app.get("/health", (_req, res) => {
  return res.json({ status: "ok", service: "admas-api" });
});

app.get("/health/database", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.json({ status: "ok", database: "connected" });
  } catch (error) {
    console.error("Database health check failed:", error);
    return res.status(503).json({ status: "error", database: "unavailable" });
  }
});

/* -------------------- TELEGRAM USER REGISTRATION -------------------- */

const telegramUserSchema = z.object({
  telegramId: z.string().regex(/^\d{1,20}$/),
  telegramUsername: z.string().max(64).nullable().optional(),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().max(100).nullable().optional(),
  language: z.enum(["am", "en"]).default("am"),
});

app.post("/api/users/telegram", botSecretAuth, async (req, res) => {
  const parsed = telegramUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid user data",
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  const data = parsed.data;
  try {
    const user = await prisma.telegramUser.upsert({
      where: { telegramId: BigInt(data.telegramId) },
      create: {
        telegramId: BigInt(data.telegramId),
        telegramUsername: data.telegramUsername ?? null,
        firstName: data.firstName,
        lastName: data.lastName ?? null,
        language: data.language,
      },
      update: {
        telegramUsername: data.telegramUsername ?? null,
        firstName: data.firstName,
        lastName: data.lastName ?? null,
        language: data.language,
      },
    });

    return res.status(200).json({
      message: "Telegram user registered successfully",
      user: {
        id: user.id,
        telegramId: user.telegramId.toString(),
        telegramUsername: user.telegramUsername,
        firstName: user.firstName,
        lastName: user.lastName,
        language: user.language,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error("Telegram registration failed:", error);
    return res.status(500).json({ error: "Could not register user" });
  }
});

/* -------------------- TICKETS -------------------- */

const ticketSchema = z.object({
  telegramId: z.string().regex(/^\d{1,20}$/),
  ticketNumber: z.string().regex(/^\d{3}-\d{7}$/),
  originalSms: z.string().trim().min(1).max(10000),
  expirationDateText: z.string().trim().min(1).max(100),
  drawDateText: z.string().trim().min(1).max(100),
});

app.post("/api/tickets", botSecretAuth, async (req, res) => {
  const parsed = ticketSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid ticket data",
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  const data = parsed.data;
  try {
    const user = await prisma.telegramUser.findUnique({
      where: { telegramId: BigInt(data.telegramId) },
      select: { id: true, isActive: true },
    });

    if (!user || !user.isActive) {
      return res.status(404).json({
        error: "Active Telegram user not found. Send /start first.",
      });
    }

    const ticket = await prisma.lotteryTicket.create({
      data: {
        telegramUserId: user.id,
        ticketNumber: data.ticketNumber,
        originalSms: data.originalSms,
        expirationDateText: data.expirationDateText,
        drawDateText: data.drawDateText,
      },
    });

    return res.status(201).json({
      message: "Ticket saved successfully",
      ticket: {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        expirationDateText: ticket.expirationDateText,
        drawDateText: ticket.drawDateText,
        createdAt: ticket.createdAt,
      },
    });
  } catch (error) {
    if (isPrismaErrorCode(error, "P2002")) {
      return res.status(409).json({
        error: "This ticket has already been saved for this draw.",
      });
    }
    console.error("Ticket save failed:", error);
    return res.status(500).json({ error: "Could not save ticket" });
  }
});

app.get("/api/tickets", botSecretAuth, async (req, res) => {
  const telegramId = req.query.telegramId;
  if (typeof telegramId !== "string" || !/^\d{1,20}$/.test(telegramId)) {
    return res.status(400).json({ error: "Invalid Telegram ID" });
  }

  try {
    const user = await prisma.telegramUser.findUnique({
      where: { telegramId: BigInt(telegramId) },
      select: { id: true, isActive: true },
    });
    if (!user || !user.isActive) {
      return res.status(404).json({ error: "Active user not found" });
    }

    const tickets = await prisma.lotteryTicket.findMany({
      where: { telegramUserId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        ticketNumber: true,
        expirationDateText: true,
        drawDateText: true,
        createdAt: true,
      },
    });
    return res.json({ count: tickets.length, tickets });
  } catch (error) {
    console.error("Ticket retrieval failed:", error);
    return res.status(500).json({ error: "Could not retrieve tickets" });
  }
});

/* -------------------- ADMIN SESSION AUTH -------------------- */

app.post("/api/admin/auth/login", (req, res) => {
  const parsed = z
    .object({
      username: z.string().trim().min(1).max(100),
      password: z.string().min(1).max(200),
    })
    .safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "Username and password are required" });
  }

  const expectedUsername = process.env.ADMIN_USERNAME;
  const expectedPassword = process.env.ADMIN_PASSWORD;
  if (!expectedUsername || !expectedPassword) {
    return res.status(503).json({ error: "Admin login is not configured" });
  }

  const usernameMatches = safeSecretEqual(
    parsed.data.username,
    expectedUsername,
  );
  const passwordMatches = safeSecretEqual(
    parsed.data.password,
    expectedPassword,
  );
  if (!usernameMatches || !passwordMatches) {
    return res.status(401).json({ error: "Invalid username or password" });
  }

  req.session.regenerate((error) => {
    if (error) {
      console.error("Session regeneration failed:", error);
      return res.status(500).json({ error: "Could not create admin session" });
    }

    req.session.adminAuthenticated = true;
    req.session.adminUsername = expectedUsername;
    req.session.save((saveError) => {
      if (saveError) {
        console.error("Session save failed:", saveError);
        return res.status(500).json({ error: "Could not save admin session" });
      }
      return res.json({
        message: "Login successful",
        admin: { username: expectedUsername },
      });
    });
  });
});

app.get("/api/admin/auth/me", (req, res) => {
  if (!req.session.adminAuthenticated) {
    return res.status(401).json({ authenticated: false });
  }
  return res.json({
    authenticated: true,
    admin: { username: req.session.adminUsername },
  });
});

app.post("/api/admin/auth/logout", (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      console.error("Session destruction failed:", error);
      return res.status(500).json({ error: "Could not log out" });
    }
    res.clearCookie("admas.sid", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
    return res.json({ message: "Logged out successfully" });
  });
});

/* -------------------- ADMIN DRAW MANAGEMENT -------------------- */

// Protect only draw-management endpoints. Login/me/logout remain public as needed.
app.use("/api/admin/draws", adminDrawAuth);

const createDrawSchema = z.object({
  drawCode: z.string().trim().min(1).max(80),
  drawDateText: z.string().trim().min(1).max(100),
  sourceReference: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(2000).optional(),
});

app.post("/api/admin/draws", async (req, res) => {
  const parsed = createDrawSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid draw information",
      details: parsed.error.issues,
    });
  }

  try {
    const draw = await prisma.lotteryDraw.create({
      data: {
        drawCode: parsed.data.drawCode,
        drawDateText: parsed.data.drawDateText,
        sourceReference: parsed.data.sourceReference,
        notes: parsed.data.notes,
      },
    });
    return res.status(201).json({ message: "Draft draw created", draw });
  } catch (error) {
    if (isPrismaErrorCode(error, "P2002")) {
      return res
        .status(409)
        .json({ error: "A draw with this code already exists" });
    }
    console.error("Draw creation failed:", error);
    return res.status(500).json({ error: "Could not create draw" });
  }
});

app.get("/api/admin/draws", async (_req, res) => {
  try {
    const draws = await prisma.lotteryDraw.findMany({
      orderBy: { createdAt: "desc" },
      include: { prizes: { orderBy: { sortOrder: "asc" } } },
    });
    return res.json({ count: draws.length, draws });
  } catch (error) {
    console.error("Draw listing failed:", error);
    return res.status(500).json({ error: "Could not retrieve draws" });
  }
});

const createPrizeSchema = z.object({
  prizeName: z.string().trim().min(1).max(100),
  winningNumber: z.string().trim().min(1).max(100),
  prizeAmount: z.preprocess(
    (value) => (typeof value === "number" ? String(value) : value),
    z
      .string()
      .trim()
      .regex(
        /^\d{1,10}(\.\d{1,2})?$/,
        "Prize amount must be non-negative with up to 2 decimal places.",
      )
      .optional(),
  ),
  currency: z.string().trim().length(3).default("ETB"),
  sortOrder: z.number().int().min(0).default(0),
});

app.post("/api/admin/draws/:drawId/prizes", async (req, res) => {
  const parsed = createPrizeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid prize information",
      details: parsed.error.issues,
    });
  }

  try {
    const draw = await prisma.lotteryDraw.findUnique({
      where: { id: req.params.drawId },
      select: { id: true, status: true },
    });
    if (!draw) return res.status(404).json({ error: "Draw not found" });
    if (draw.status !== "DRAFT") {
      return res.status(409).json({ error: "Only draft draws can be edited" });
    }

    const existingPrizeCount = await prisma.drawPrize.count({
      where: { drawId: draw.id },
    });
    if (existingPrizeCount >= 10) {
      return res.status(409).json({
        error: "This draw already has the maximum of 10 prize entries.",
      });
    }

    const prize = await prisma.drawPrize.create({
      data: {
        drawId: draw.id,
        prizeName: parsed.data.prizeName,
        winningNumber: parsed.data.winningNumber,
        prizeAmount: parsed.data.prizeAmount ?? null,
        currency: parsed.data.currency,
        sortOrder: parsed.data.sortOrder,
      },
    });
    return res.status(201).json({
      message: "Prize entry added successfully",
      prize,
      remainingPrizeEntries: Math.max(0, 9 - existingPrizeCount),
    });
  } catch (error) {
    if (isPrismaErrorCode(error, "P2002")) {
      return res
        .status(409)
        .json({ error: "This prize entry already exists for the draw" });
    }
    console.error("Prize creation failed:", error);
    return res.status(500).json({ error: "Could not add prize entry" });
  }
});

/* -------------------- VERIFY DRAW -------------------- */

app.post("/api/admin/draws/:drawId/verify", async (req, res) => {
  const parsed = z
    .object({
      confirmedOfficialSource: z.literal(true),
    })
    .safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error:
        "You must confirm that the results were checked against the official source.",
    });
  }

  try {
    // Avoid the interactive transaction that produced P2028 in this setup.
    // Conditional update prevents duplicate state transitions.
    const draw = await prisma.lotteryDraw.findUnique({
      where: { id: req.params.drawId },
      include: { prizes: true },
    });

    if (!draw) return res.status(404).json({ error: "Draw not found" });
    if (draw.status !== "DRAFT") {
      return res
        .status(409)
        .json({ error: "Only draft draws can be verified" });
    }
    if (draw.prizes.length === 0) {
      return res
        .status(400)
        .json({ error: "Add at least one prize entry before verification" });
    }
   

    const updated = await prisma.lotteryDraw.updateMany({
      where: { id: draw.id, status: "DRAFT" },
      data: { status: "VERIFIED", verifiedAt: new Date() },
    });
    if (updated.count !== 1) {
      return res.status(409).json({
        error:
          "This draw was changed by another request. Refresh and try again",
      });
    }

    const verifiedDraw = await prisma.lotteryDraw.findUnique({
      where: { id: draw.id },
      include: { prizes: { orderBy: { sortOrder: "asc" } } },
    });
    return res.json({
      message: "Draw verified successfully",
      draw: verifiedDraw,
    });
  } catch (error) {
    console.error("Draw verification failed:", error);
    return res.status(500).json({ error: "Could not verify draw" });
  }
});

/* -------------------- PUBLISH DRAW -------------------- */

app.post("/api/admin/draws/:drawId/publish", async (req, res) => {
  try {
    const draw = await prisma.lotteryDraw.findUnique({
      where: { id: req.params.drawId },
      include: { prizes: true },
    });

    if (!draw) return res.status(404).json({ error: "Draw not found" });
    if (draw.status !== "VERIFIED") {
      return res
        .status(409)
        .json({ error: "Only verified draws can be published" });
    }
    if (draw.prizes.length === 0) {
      return res.status(400).json({ error: "This draw has no prize entries" });
    }

    const updated = await prisma.lotteryDraw.updateMany({
      where: { id: draw.id, status: "VERIFIED" },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });
    if (updated.count !== 1) {
      return res.status(409).json({
        error:
          "This draw was changed by another request. Refresh and try again",
      });
    }

    const publishedDraw = await prisma.lotteryDraw.findUnique({
      where: { id: draw.id },
      include: { prizes: { orderBy: { sortOrder: "asc" } } },
    });
    return res.json({
      message: "Draw published successfully",
      draw: publishedDraw,
    });
  } catch (error) {
    console.error("Draw publication failed:", error);
    return res.status(500).json({ error: "Could not publish draw" });
  }
});

/* -------------------- NOT FOUND / ERROR HANDLING -------------------- */

app.use((_req, res) => {
  return res.status(404).json({ error: "Route not found" });
});

app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error("Unhandled API error:", error);
    if (res.headersSent) return;
    return res.status(500).json({ error: "Internal server error" });
  },
);

/* -------------------- START SERVER -------------------- */

const server = app.listen(port, () => {
  console.log(`Admas API running at http://localhost:${port}`);
});

async function shutdown(signal: string) {
  console.log(`${signal} received. Shutting down Admas API...`);
  server.close(async () => {
    try {
      await prisma.$disconnect();
      process.exit(0);
    } catch (error) {
      console.error("Error while disconnecting Prisma:", error);
      process.exit(1);
    }
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
