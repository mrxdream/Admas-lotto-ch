import "dotenv/config";
import { Bot } from "grammy";
import { InlineKeyboard } from "grammy";
const token = process.env.BOT_TOKEN;
const apiBaseUrl = process.env.API_BASE_URL;
const apiSecret = process.env.BOT_API_SECRET;

if (!token || !apiBaseUrl || !apiSecret) {
  throw new Error(
    "Missing BOT_TOKEN, API_BASE_URL, or BOT_API_SECRET in apps/bot/.env",
  );
}

const bot = new Bot(token);

bot.command("mytickets", async (ctx) => {
  const telegramId = String(ctx.from.id);

  try {
    const response = await fetch(
      `${apiBaseUrl}/api/tickets?telegramId=${encodeURIComponent(telegramId)}`,
      {
        headers: {
          "x-bot-api-secret": apiSecret,
        },
      },
    );

    const result = (await response.json()) as {
      error?: string;
      count?: number;
      tickets?: {
        ticketNumber: string;
        expirationDateText: string;
        drawDateText: string;
      }[];
    };

    if (!response.ok) {
      console.error("Could not retrieve tickets:", response.status, result);
      await ctx.reply("ትኬቶችዎን ማምጣት አልተቻለም። እባክዎ /start ብለው እንደገና ይሞክሩ።");
      return;
    }

    const tickets = result.tickets ?? [];

    if (tickets.length === 0) {
      await ctx.reply(
        "🎟️ እስካሁን ያስቀመጡት ትኬት የለም።\n\n" +
          "የአድማስ ሎተሪ SMS መልዕክትዎን ያስተላልፉና ትኬትዎን ያስቀምጡ።",
      );
      return;
    }

    const message = [
      `🎟️ የእርስዎ የተቀመጡ ትኬቶች (${tickets.length})`,
      "",
      ...tickets.flatMap((ticket, index) => [
        `${index + 1}. ትኬት: ${ticket.ticketNumber}`,
        `የማብቂያ ቀን: ${ticket.expirationDateText}`,
        `የዕጣ የወጪ ቀን: ${ticket.drawDateText}`,
        "",
      ]),
    ].join("\n");

    await ctx.reply(message);
  } catch (error) {
    console.error("My tickets request failed:", error);
    await ctx.reply("አገልግሎቱ ለጊዜው አይገኝም። እባክዎ ቆይተው ይሞክሩ።");
  }
});

bot.command("start", async (ctx) => {
  const user = ctx.from;

  if (!user) {
    await ctx.reply("Could not identify your Telegram account.");
    return;
  }

  try {
    const response = await fetch(`${apiBaseUrl}/api/users/telegram`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bot-api-secret": apiSecret,
      },
      body: JSON.stringify({
        telegramId: String(user.id),
        telegramUsername: user.username ?? null,
        firstName: user.first_name,
        lastName: user.last_name ?? null,
        language: "am",
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("Registration failed:", response.status, result);
      await ctx.reply("ይቅርታ! ምዝገባዎን ማጠናቀቅ አልተቻለም። እባክዎ ቆይተው እንደገና ይሞክሩ።");
      return;
    }

    await ctx.reply(
      `ሰላም ${user.first_name}! 🎉\n\n` +
        "ወደ Admas Lottery Checker እንኳን በደህና መጡ!\n\n" +
        "የሎተሪ ትኬቶችዎን ለማስቀመጥ እና የውጤት ማሳወቂያዎችን ለማግኘት ይህን ቦት መጠቀም ይችላሉ።\n\n" +
        "በቀጣይ የትኬት ማስገቢያ ባህሪያትን እንጨምራለን።",
    );
  } catch (error) {
    console.error("Could not reach the API:", error);
    await ctx.reply("አገልግሎቱ ለጊዜው አይገኝም። እባክዎ ቆይተው ይሞክሩ።");
  }
});

type PendingTicket = {
  ticketNumber: string;
  originalSms: string;
  expirationDateText: string;
  drawDateText: string;
};

const pendingTickets = new Map<string, PendingTicket>();

const ethiopianDate =
  "(?:መስከረም|ጥቅምት|ኅዳር|ህዳር|ታኅሣሥ|ታህሳስ|ጥር|የካቲት|መጋቢት|ሚያዝያ|ግንቦት|ሰኔ|ሐምሌ|ነሐሴ|ጳጉሜ)";
const datePattern = new RegExp(
  `${ethiopianDate}\\s+\\d{1,2}/\\d{4}\\s*ዓ\\s*\\.\\s*ም\\.?`,
);

function parseLotterySms(text: string): PendingTicket | null {
  const ticketMatch = text.match(/\b\d{3}-\d{7}\b/);
  const dates = text.match(new RegExp(datePattern, "g"));

  if (!ticketMatch || !dates || dates.length < 2) {
    return null;
  }

  const expirationMarker = /የሚያበቃበት\s*ቀን/;
  const drawMarker = /የሚወጣበት\s*ቀን/;

  const expirationSection = text.split(expirationMarker)[1];
  const drawSection = text.split(drawMarker)[1];

  const expirationDate = expirationSection?.match(datePattern)?.[0];
  const drawDate = drawSection?.match(datePattern)?.[0];

  if (!expirationDate || !drawDate) {
    return null;
  }

  return {
    ticketNumber: ticketMatch[0],
    originalSms: text,
    expirationDateText: expirationDate.trim(),
    drawDateText: drawDate.trim(),
  };
}

bot.on("message:text", async (ctx) => {
  const text = ctx.message.text.trim();

  if (text.startsWith("/")) {
    return;
  }

  const ticket = parseLotterySms(text);

  if (!ticket) {
    await ctx.reply(
      "የሎተሪ መልዕክቱን በትክክል ማንበብ አልቻልኩም።\n\n" +
        "እባክዎ የአድማስ ሎተሪ SMS መልዕክቱን ያስተላልፉ። የትኬት ቁጥሩና ሁለቱ ቀኖች በግልጽ መታየት አለባቸው።",
    );
    return;
  }

  const userKey = String(ctx.from.id);
  pendingTickets.set(userKey, ticket);

  const keyboard = new InlineKeyboard()
    .text("✅ አረጋግጥና አስቀምጥ", "ticket:confirm")
    .text("❌ ሰርዝ", "ticket:cancel");

  await ctx.reply(
    "🎟️ የትኬት መረጃ ተገኝቷል።\n\n" +
      `የትኬት ቁጥር: ${ticket.ticketNumber}\n` +
      `የማብቂያ ቀን: ${ticket.expirationDateText}\n` +
      `የዕጣ የወጪ ቀን: ${ticket.drawDateText}\n\n` +
      "እባክዎ መረጃው ትክክል መሆኑን ያረጋግጡ። ቀኖቹ ከዋናው መልዕክት እንደተጻፉ ተቀምጠዋል።",
    { reply_markup: keyboard },
  );
});

bot.callbackQuery("ticket:confirm", async (ctx) => {
  const userKey = String(ctx.from.id);
  const ticket = pendingTickets.get(userKey);

  if (!ticket) {
    await ctx.answerCallbackQuery({
      text: "የማረጋገጫ ጊዜው አልፏል። SMS መልዕክቱን እንደገና ይላኩ።",
      show_alert: true,
    });
    return;
  }

  await ctx.answerCallbackQuery();

  try {
    const response = await fetch(`${apiBaseUrl}/api/tickets`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bot-api-secret": apiSecret,
      },
      body: JSON.stringify({
        telegramId: userKey,
        ...ticket,
      }),
    });

    const result = (await response.json()) as {
      message?: string;
      error?: string;
    };

    if (response.status === 409) {
      pendingTickets.delete(userKey);
      await ctx.editMessageText("ℹ️ ይህ ትኬት ከዚህ በፊት ተቀምጧል።");
      return;
    }

    if (!response.ok) {
      console.error("Ticket registration failed:", response.status, result);
      await ctx.reply("ትኬቱን ማስቀመጥ አልተቻለም። እባክዎ ቆይተው እንደገና ይሞክሩ።");
      return;
    }

    pendingTickets.delete(userKey);
    await ctx.editMessageText(
      "✅ ትኬትዎ በተሳካ ሁኔታ ተቀምጧል!\n\n" +
        `የትኬት ቁጥር: ${ticket.ticketNumber}\n` +
        `የዕጣ የወጪ ቀን: ${ticket.drawDateText}`,
    );
  } catch (error) {
    console.error("Could not reach ticket API:", error);
    await ctx.reply("አገልግሎቱ ለጊዜው አይገኝም። እባክዎ ቆይተው ይሞክሩ።");
  }
});

bot.callbackQuery("ticket:cancel", async (ctx) => {
  pendingTickets.delete(String(ctx.from.id));
  await ctx.answerCallbackQuery({ text: "ተሰርዟል።" });
  await ctx.editMessageText("የትኬት ማስቀመጥ ተሰርዟል።");
});

bot.catch((error) => {
  console.error("Telegram bot error:", error);
});

bot.start();
console.log("Admas Telegram bot is running.");
