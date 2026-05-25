const path = require("path");
const fs = require("fs");
const ExcelJS = require("exceljs");
const { Telegraf, Markup } = require("telegraf");
const config = require("./config");
const { readDb, withDb, defaultApplicationQuestions } = require("./store");

const http = require('http');

const PORT = process.env.PORT || 3001;

http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot is running');
}).listen(PORT, () => {
  console.log(`HTTP server running on port ${PORT}`);
});

if (!config.botToken) {
  throw new Error("BOT_TOKEN topilmadi. .env faylni toldiring.");
}

const bot = new Telegraf(config.botToken);
const sessions = new Map();
const adminInputState = new Map();

function isAdmin(id) {
  const db = readDb();
  if (Number(id) === Number(config.superAdminId)) return true;
  return Boolean(db.admins[id]);
}

function isSuperAdmin(id) {
  return Number(id) === Number(config.superAdminId);
}

function getQuestionDefs() {
  const db = readDb();
  return Array.isArray(db.applicationQuestions) && db.applicationQuestions.length
    ? db.applicationQuestions
    : defaultApplicationQuestions();
}

function upsertUser(ctx) {
  const tgUser = ctx.from || {};
  withDb((db) => {
    if (!db.users[tgUser.id]) {
      db.users[tgUser.id] = {
        id: tgUser.id,
        username: tgUser.username || "",
        firstName: tgUser.first_name || "",
        lastName: tgUser.last_name || "",
        phone: "",
        createdAt: new Date().toISOString(),
      };
    } else {
      db.users[tgUser.id].username = tgUser.username || db.users[tgUser.id].username || "";
      db.users[tgUser.id].firstName = tgUser.first_name || db.users[tgUser.id].firstName || "";
      db.users[tgUser.id].lastName = tgUser.last_name || db.users[tgUser.id].lastName || "";
    }
  });
}

function mainKeyboard(userId) {
  const db = readDb();
  const b = db.settings.buttons;
  const rows = [[b.apply], [b.agency, b.office], [b.contact]];
  if (isAdmin(userId)) rows.push(["Admin panel"]);
  return Markup.keyboard(rows).resize();
}

function adminPanelKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("Ariza: Ochish", "adm_app_open"),
      Markup.button.callback("Ariza: Yopish", "adm_app_close"),
    ],
    [
      Markup.button.callback("Users", "adm_users"),
      Markup.button.callback("Admins", "adm_admins"),
    ],
    [
      Markup.button.callback("Export Excel", "adm_export"),
      Markup.button.callback("Broadcast", "adm_prompt_broadcast"),
    ],
    [
      Markup.button.callback("Tugma matni", "adm_button_text_menu"),
      Markup.button.callback("Tugma manosi", "adm_button_content_menu"),
    ],
    [Markup.button.callback("Start matni", "adm_prompt_set_start_text")],
    [Markup.button.callback("Ariza savollari", "adm_questions_menu")],
    [Markup.button.callback("Guruhlar", "adm_groups_menu")],
    [
      Markup.button.callback("Add admin", "adm_prompt_add_admin"),
      Markup.button.callback("Remove admin", "adm_prompt_remove_admin"),
    ],
  ]);
}

function buttonTextSelectKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("Agentlik tugmasi", "adm_btn_text_agency"),
      Markup.button.callback("Ofis tugmasi", "adm_btn_text_office"),
    ],
    [Markup.button.callback("Boglanish tugmasi", "adm_btn_text_contact")],
  ]);
}

function buttonContentSelectKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("Agentlik manosi", "adm_btn_content_agency"),
      Markup.button.callback("Ofis manosi", "adm_btn_content_office"),
    ],
    [Markup.button.callback("Boglanish manosi", "adm_btn_content_contact")],
  ]);
}

function questionsSelectKeyboard() {
  const total = getQuestionDefs().length;
  const rows = [];
  for (let i = 1; i <= total; i += 2) {
    const row = [Markup.button.callback(`${i}-savol`, `adm_q_${i}`)];
    if (i + 1 <= total) row.push(Markup.button.callback(`${i + 1}-savol`, `adm_q_${i + 1}`));
    rows.push(row);
  }
  return Markup.inlineKeyboard(rows);
}

function groupsMenuKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("Guruh qoshish", "adm_prompt_add_group"),
      Markup.button.callback("Guruhlar royxati", "adm_list_groups"),
    ],
    [Markup.button.callback("Guruh ochirish", "adm_delete_group_menu")],
  ]);
}

function groupDeleteKeyboard(targets) {
  const rows = targets.map((g, i) => [Markup.button.callback(`${i + 1}. ${g}`, `adm_del_group_${i}`)]);
  return Markup.inlineKeyboard(rows);
}

async function showAdminPanel(ctx) {
  if (!isAdmin(ctx.from.id)) return ctx.reply("Siz admin emassiz.");
  return ctx.reply("Admin panel:", adminPanelKeyboard());
}

function setAdminInput(userId, action) {
  adminInputState.set(userId, action);
}

function clearAdminInput(userId) {
  adminInputState.delete(userId);
}

function startApplication(ctx) {
  sessions.set(ctx.from.id, { mode: "application", index: 0, answers: {} });
  return askCurrentQuestion(ctx);
}

async function askCurrentQuestion(ctx) {
  const state = sessions.get(ctx.from.id);
  if (!state || state.mode !== "application") return;
  const questionDefs = getQuestionDefs();
  const q = questionDefs[state.index];
  if (!q) return;

  if (Array.isArray(q.options) && q.options.length) {
    const rows = [];
    for (let i = 0; i < q.options.length; i += 2) {
      const row = [Markup.button.callback(q.options[i], `ans_${q.key}_${i}`)];
      if (i + 1 < q.options.length) {
        row.push(Markup.button.callback(q.options[i + 1], `ans_${q.key}_${i + 1}`));
      }
      rows.push(row);
    }
    return ctx.reply(q.text, Markup.inlineKeyboard(rows));
  }

  if (q.inline) {
    return ctx.reply(
      q.text,
      Markup.inlineKeyboard([
        [
          Markup.button.callback("Ha", `ans_${q.key}_ha`),
          Markup.button.callback("Yoq", `ans_${q.key}_yoq`),
        ],
      ])
    );
  }

  return ctx.reply(q.text);
}

function prettyApplicationText(app) {
  return [
    "Yangi stajirovka arizasi",
    `Ariza ID: ${app.id}`,
    `Hudud: ${app.answers.region || "-"}`,
    `Tuman/Shahar: ${app.answers.districtCity || "-"}`,
    `Mahalla: ${app.answers.mahalla || "-"}`,
    `F.I.O: ${app.answers.fio || "-"}`,
    `OTM: ${app.answers.university || "-"}`,
    `Yonalish: ${app.answers.major || "-"}`,
    `Kurs: ${app.answers.course || "-"}`,
    `Telefon: ${app.answers.phone || "-"}`,
    `Email: ${app.answers.email || "-"}`,
    `Telegram: ${app.answers.telegramUsername || "-"}`,
    `Chet tillari: ${app.answers.languages || "-"}`,
    `Oldingi tajriba: ${app.answers.experience || "-"}`,
    `Jamoaviy ish: ${app.answers.teamwork || "-"}`,
    `Stajyor sifati: ${app.answers.internQualities || "-"}`,
    `Davlat tizimi haqida: ${app.answers.govMeaning || "-"}`,
    `Qoshimcha izoh: ${app.answers.q13 || "-"}`,
    `17-savol: ${app.answers.q14 || "-"}`,
    `18-savol: ${app.answers.q15 || "-"}`,
    `Resume ref: ${app.resumeRef || "-"}`,
    `User ID: ${app.user.id}`,
    `@${app.user.username || "username yoq"}`,
  ].join("\n");
}

async function submitApplication(ctx) {
  const state = sessions.get(ctx.from.id);
  if (!state) return;

  const app = withDb((db) => {
    const id = db.applications.length + 1;
    const resumeRef = state.answers.resume ? `file_id:${state.answers.resume.file_id}` : "";
    const application = {
      id,
      user: { id: ctx.from.id, username: ctx.from.username || "" },
      answers: state.answers,
      resumeRef,
      createdAt: new Date().toISOString(),
    };
    db.applications.push(application);
    if (state.answers.resume?.file_id) {
      db.files.push({
        applicationId: id,
        userId: ctx.from.id,
        fileId: state.answers.resume.file_id,
        fileName: state.answers.resume.file_name || "",
        mimeType: state.answers.resume.mime_type || "",
        createdAt: new Date().toISOString(),
      });
    }
    if (db.users[ctx.from.id]) {
      db.users[ctx.from.id].phone = state.answers.phone || db.users[ctx.from.id].phone || "";
    }
    return application;
  });

  const db = readDb();
  const targets = Array.isArray(db.settings.groupTargets) ? db.settings.groupTargets : [];
  const fallback = config.groupChatId ? [config.groupChatId] : [];
  const finalTargets = targets.length ? targets : fallback;
  if (finalTargets.length) {
    for (const chatTarget of finalTargets) {
      await ctx.telegram.sendMessage(chatTarget, prettyApplicationText(app));
      if (state.answers.resume?.file_id) {
        await ctx.telegram.sendDocument(chatTarget, state.answers.resume.file_id, {
          caption: `Resume | Ariza ID: ${app.id} | User: ${ctx.from.id}`,
        });
      }
    }
  } else {
    await ctx.reply("Guruh manzili sozlanmagan. Admin paneldan Guruhlar bo'limida guruh qo'shing.");
  }

  sessions.delete(ctx.from.id);
  await ctx.reply("Arizangiz muvaffaqiyatli qabul qilindi.", mainKeyboard(ctx.from.id));
}

async function sendUsers(ctx) {
  const db = readDb();
  const rows = Object.values(db.users).map((u) => {
    const fio = `${u.firstName || ""} ${u.lastName || ""}`.trim() || "-";
    return `ID: ${u.id} | FIO: ${fio} | @${u.username || "-"} | Tel: ${u.phone || "-"}`;
  });
  return ctx.reply(rows.length ? rows.join("\n") : "Foydalanuvchilar topilmadi.");
}

async function sendAdmins(ctx) {
  const db = readDb();
  const rows = Object.keys(db.admins).map((id) => {
    const user = db.users[id] || {};
    const fio = `${user.firstName || ""} ${user.lastName || ""}`.trim() || "-";
    return `ID: ${id} | Role: ${db.admins[id].role} | FIO: ${fio} | @${user.username || "-"} | Tel: ${user.phone || "-"}`;
  });
  return ctx.reply(rows.length ? rows.join("\n") : "Adminlar royxati bosh.");
}

async function runExport(ctx) {
  const db = readDb();
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Applications");
  ws.columns = [
    { header: "Application ID", key: "id", width: 16 },
    { header: "User ID", key: "userId", width: 14 },
    { header: "Username", key: "username", width: 20 },
    { header: "Hudud", key: "region", width: 24 },
    { header: "Tuman/Shahar", key: "districtCity", width: 20 },
    { header: "Mahalla", key: "mahalla", width: 20 },
    { header: "FIO", key: "fio", width: 25 },
    { header: "OTM", key: "university", width: 25 },
    { header: "Yonalish", key: "major", width: 24 },
    { header: "Kurs", key: "course", width: 10 },
    { header: "Telefon", key: "phone", width: 18 },
    { header: "Email", key: "email", width: 25 },
    { header: "Telegram Username", key: "telegramUsername", width: 25 },
    { header: "Chet tillari", key: "languages", width: 20 },
    { header: "Oldingi tajriba", key: "experience", width: 30 },
    { header: "Jamoaviy ish", key: "teamwork", width: 30 },
    { header: "Stajyor sifati", key: "internQualities", width: 30 },
    { header: "Davlat tizimi", key: "govMeaning", width: 30 },
    { header: "Qoshimcha", key: "q13", width: 25 },
    { header: "17-savol", key: "q14", width: 14 },
    { header: "18-savol", key: "q15", width: 14 },
    { header: "Resume Ref", key: "resumeRef", width: 36 },
    { header: "Created At", key: "createdAt", width: 26 },
  ];

  db.applications.forEach((a) => {
    ws.addRow({
      id: a.id,
      userId: a.user?.id || "",
      username: a.user?.username || "",
      ...a.answers,
      resumeRef: a.resumeRef || "",
      createdAt: a.createdAt,
    });
  });

  const outputDir = path.join(__dirname, "..", "data");
  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, `applications-${Date.now()}.xlsx`);
  await workbook.xlsx.writeFile(filePath);
  return ctx.replyWithDocument({ source: filePath });
}

bot.start(async (ctx) => {
  upsertUser(ctx);
  const db = readDb();
  if (!db.admins[config.superAdminId] && config.superAdminId) {
    withDb((inner) => {
      inner.admins[config.superAdminId] = { role: "super", addedAt: new Date().toISOString() };
    });
  }
  const startText = db.settings?.content?.start || "Assalomu alaykum! Stajirovka botiga xush kelibsiz.";
  await ctx.reply(startText, mainKeyboard(ctx.from.id));
});

bot.command("admin", async (ctx) => {
  upsertUser(ctx);
  return showAdminPanel(ctx);
});

bot.command("export", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  return runExport(ctx);
});

bot.on("callback_query", async (ctx) => {
  const data = ctx.callbackQuery.data || "";

  if (data.startsWith("adm_")) {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("Ruxsat yoq");

    if (data === "adm_app_open") {
      withDb((db) => (db.settings.applicationsOpen = true));
      await ctx.answerCbQuery("Ariza ochildi");
      return ctx.reply("Ariza holati: OCHIQ", adminPanelKeyboard());
    }
    if (data === "adm_app_close") {
      withDb((db) => (db.settings.applicationsOpen = false));
      await ctx.answerCbQuery("Ariza yopildi");
      return ctx.reply("Ariza holati: YOPIQ", adminPanelKeyboard());
    }
    if (data === "adm_users") {
      await ctx.answerCbQuery("Users");
      return sendUsers(ctx);
    }
    if (data === "adm_admins") {
      await ctx.answerCbQuery("Admins");
      return sendAdmins(ctx);
    }
    if (data === "adm_export") {
      await ctx.answerCbQuery("Export");
      return runExport(ctx);
    }
    if (data === "adm_prompt_broadcast") {
      setAdminInput(ctx.from.id, "broadcast");
      await ctx.answerCbQuery("Broadcast");
      return ctx.reply("Broadcast matnini yuboring:");
    }
    if (data === "adm_button_text_menu") {
      await ctx.answerCbQuery("Tugma matni");
      return ctx.reply("Qaysi tugma nomini ozgartirasiz?", buttonTextSelectKeyboard());
    }
    if (data === "adm_button_content_menu") {
      await ctx.answerCbQuery("Tugma manosi");
      return ctx.reply("Qaysi tugma bosilganda chiqadigan matnni ozgartirasiz?", buttonContentSelectKeyboard());
    }
    if (data === "adm_questions_menu") {
      await ctx.answerCbQuery("Savollar");
      return ctx.reply("Qaysi savol matnini ozgartirasiz?", questionsSelectKeyboard());
    }
    if (data === "adm_groups_menu") {
      await ctx.answerCbQuery("Guruhlar");
      return ctx.reply("Guruhlar boshqaruvi:", groupsMenuKeyboard());
    }
    if (data === "adm_prompt_add_group") {
      setAdminInput(ctx.from.id, "add_group");
      await ctx.answerCbQuery("Guruh qoshish");
      return ctx.reply("Yangi guruh username yoki chat id yuboring (@group yoki -100...):");
    }
    if (data === "adm_list_groups") {
      await ctx.answerCbQuery("Royxat");
      const db = readDb();
      const targets = Array.isArray(db.settings.groupTargets) ? db.settings.groupTargets : [];
      if (!targets.length) return ctx.reply("Hozircha guruhlar qo'shilmagan.");
      const text = targets.map((g, i) => `${i + 1}. ${g}`).join("\n");
      return ctx.reply(`Guruhlar royxati:\n${text}`);
    }
    if (data === "adm_delete_group_menu") {
      await ctx.answerCbQuery("Ochirish");
      const db = readDb();
      const targets = Array.isArray(db.settings.groupTargets) ? db.settings.groupTargets : [];
      if (!targets.length) return ctx.reply("Ochirish uchun guruh yoq.");
      return ctx.reply("Ochiriladigan guruhni tanlang:", groupDeleteKeyboard(targets));
    }
    if (data.startsWith("adm_del_group_")) {
      const idx = Number(data.replace("adm_del_group_", ""));
      const db = readDb();
      const targets = Array.isArray(db.settings.groupTargets) ? db.settings.groupTargets : [];
      if (Number.isNaN(idx) || idx < 0 || idx >= targets.length) {
        await ctx.answerCbQuery("Notogri tanlov");
        return;
      }
      const deleted = targets[idx];
      withDb((db2) => {
        db2.settings.groupTargets.splice(idx, 1);
      });
      await ctx.answerCbQuery("Ochirildi");
      return ctx.reply(`Guruh ochirildi: ${deleted}`);
    }
    if (data.startsWith("adm_q_")) {
      const qNum = Number(data.replace("adm_q_", ""));
      const total = getQuestionDefs().length;
      if (!qNum || qNum < 1 || qNum > total) {
        await ctx.answerCbQuery("Notogri savol");
        return;
      }
      setAdminInput(ctx.from.id, `set_question_${qNum}`);
      await ctx.answerCbQuery(`${qNum}-savol`);
      return ctx.reply(`${qNum}-savol uchun yangi matnni yuboring:`);
    }
    if (data === "adm_btn_text_agency") {
      setAdminInput(ctx.from.id, "set_button_name_agency");
      await ctx.answerCbQuery("Agentlik tugmasi");
      return ctx.reply("Agentlik tugmasi uchun yangi nom yuboring:");
    }
    if (data === "adm_btn_text_office") {
      setAdminInput(ctx.from.id, "set_button_name_office");
      await ctx.answerCbQuery("Ofis tugmasi");
      return ctx.reply("Ofis tugmasi uchun yangi nom yuboring:");
    }
    if (data === "adm_btn_text_contact") {
      setAdminInput(ctx.from.id, "set_button_name_contact");
      await ctx.answerCbQuery("Boglanish tugmasi");
      return ctx.reply("Boglanish tugmasi uchun yangi nom yuboring:");
    }
    if (data === "adm_btn_content_agency") {
      setAdminInput(ctx.from.id, "set_button_content_agency");
      await ctx.answerCbQuery("Agentlik manosi");
      return ctx.reply("Agentlik tugmasi bosilganda chiqadigan matnni yuboring:");
    }
    if (data === "adm_btn_content_office") {
      setAdminInput(ctx.from.id, "set_button_content_office");
      await ctx.answerCbQuery("Ofis manosi");
      return ctx.reply("Ofis tugmasi bosilganda chiqadigan matnni yuboring:");
    }
    if (data === "adm_btn_content_contact") {
      setAdminInput(ctx.from.id, "set_button_content_contact");
      await ctx.answerCbQuery("Boglanish manosi");
      return ctx.reply("Boglanish tugmasi bosilganda chiqadigan matnni yuboring:");
    }
    if (data === "adm_prompt_set_start_text") {
      setAdminInput(ctx.from.id, "set_start_text");
      await ctx.answerCbQuery("Start matni");
      return ctx.reply("/start bosilganda chiqadigan yangi matnni yuboring:");
    }
    if (data === "adm_prompt_set_group") {
      setAdminInput(ctx.from.id, "set_group");
      await ctx.answerCbQuery("Guruh");
      return ctx.reply("Guruh username yoki chat id yuboring (@group yoki -100...):");
    }
    if (data === "adm_prompt_add_admin") {
      if (!isSuperAdmin(ctx.from.id)) {
        await ctx.answerCbQuery("Faqat super admin");
        return ctx.reply("Faqat asosiy admin qosha oladi.");
      }
      setAdminInput(ctx.from.id, "add_admin");
      await ctx.answerCbQuery("Add admin");
      return ctx.reply("Qoshiladigan admin Telegram ID yuboring:");
    }
    if (data === "adm_prompt_remove_admin") {
      if (!isSuperAdmin(ctx.from.id)) {
        await ctx.answerCbQuery("Faqat super admin");
        return ctx.reply("Faqat asosiy admin ochira oladi.");
      }
      setAdminInput(ctx.from.id, "remove_admin");
      await ctx.answerCbQuery("Remove admin");
      return ctx.reply("Ochiriladigan admin Telegram ID yuboring:");
    }

    return ctx.answerCbQuery();
  }

  if (!data.startsWith("ans_")) return ctx.answerCbQuery();

  const state = sessions.get(ctx.from.id);
  if (!state || state.mode !== "application") return ctx.answerCbQuery("Sessiya topilmadi.");
  const questionDefs = getQuestionDefs();
  const parts = data.split("_");
  const key = parts[1];
  const val = parts[2];
  const currentQuestion = questionDefs[state.index];
  if (currentQuestion && Array.isArray(currentQuestion.options) && currentQuestion.options.length) {
    const optionIndex = Number(val);
    if (Number.isNaN(optionIndex) || optionIndex < 0 || optionIndex >= currentQuestion.options.length) {
      await ctx.answerCbQuery("Notogri tanlov");
      return;
    }
    state.answers[key] = currentQuestion.options[optionIndex];
  } else {
    state.answers[key] = val === "ha" ? "Ha" : "Yoq";
  }
  state.index += 1;
  sessions.set(ctx.from.id, state);
  await ctx.answerCbQuery("Qabul qilindi");
  if (state.index >= questionDefs.length) return submitApplication(ctx);
  return askCurrentQuestion(ctx);
});

bot.on("message", async (ctx) => {
  upsertUser(ctx);
  const db = readDb();
  const txt = ctx.message.text;

  if (txt && txt === db.settings.buttons.agency) {
    return ctx.reply(db.settings.content.agency, mainKeyboard(ctx.from.id));
  }
  if (txt && txt === db.settings.buttons.office) {
    return ctx.reply(db.settings.content.office, mainKeyboard(ctx.from.id));
  }
  if (txt && txt === db.settings.buttons.contact) {
    return ctx.reply(db.settings.content.contact, mainKeyboard(ctx.from.id));
  }
  if (txt && txt === "Admin panel") {
    return showAdminPanel(ctx);
  }

  const pendingAdminAction = adminInputState.get(ctx.from.id);
  if (pendingAdminAction && isAdmin(ctx.from.id)) {
    if (!txt) return ctx.reply("Iltimos matn yuboring.");

    if (pendingAdminAction === "set_button_name_agency") {
      withDb((db2) => (db2.settings.buttons.agency = txt.trim()));
      clearAdminInput(ctx.from.id);
      return ctx.reply("Agentlik tugmasi nomi yangilandi.", adminPanelKeyboard());
    }
    if (pendingAdminAction === "set_button_name_office") {
      withDb((db2) => (db2.settings.buttons.office = txt.trim()));
      clearAdminInput(ctx.from.id);
      return ctx.reply("Ofis tugmasi nomi yangilandi.", adminPanelKeyboard());
    }
    if (pendingAdminAction === "set_button_name_contact") {
      withDb((db2) => (db2.settings.buttons.contact = txt.trim()));
      clearAdminInput(ctx.from.id);
      return ctx.reply("Boglanish tugmasi nomi yangilandi.", adminPanelKeyboard());
    }
    if (pendingAdminAction === "set_button_content_agency") {
      withDb((db2) => (db2.settings.content.agency = txt.trim()));
      clearAdminInput(ctx.from.id);
      return ctx.reply("Agentlik tugmasi manosi yangilandi.", adminPanelKeyboard());
    }
    if (pendingAdminAction === "set_button_content_office") {
      withDb((db2) => (db2.settings.content.office = txt.trim()));
      clearAdminInput(ctx.from.id);
      return ctx.reply("Ofis tugmasi manosi yangilandi.", adminPanelKeyboard());
    }
    if (pendingAdminAction === "set_button_content_contact") {
      withDb((db2) => (db2.settings.content.contact = txt.trim()));
      clearAdminInput(ctx.from.id);
      return ctx.reply("Boglanish tugmasi manosi yangilandi.", adminPanelKeyboard());
    }
    if (pendingAdminAction === "set_start_text") {
      withDb((db2) => {
        if (!db2.settings.content) db2.settings.content = {};
        db2.settings.content.start = txt.trim();
      });
      clearAdminInput(ctx.from.id);
      return ctx.reply("Start matni yangilandi.", adminPanelKeyboard());
    }
    if (pendingAdminAction === "set_group" || pendingAdminAction === "add_group") {
      const newGroup = txt.trim();
      withDb((db2) => {
        if (!Array.isArray(db2.settings.groupTargets)) db2.settings.groupTargets = [];
        if (!db2.settings.groupTargets.includes(newGroup)) db2.settings.groupTargets.push(newGroup);
        db2.settings.groupTarget = newGroup;
      });
      clearAdminInput(ctx.from.id);
      return ctx.reply("Guruh saqlandi.", adminPanelKeyboard());
    }
    if (pendingAdminAction.startsWith("set_question_")) {
      const qNum = Number(pendingAdminAction.replace("set_question_", ""));
      const total = getQuestionDefs().length;
      if (!qNum || qNum < 1 || qNum > total) {
        clearAdminInput(ctx.from.id);
        return ctx.reply("Savol raqami notogri.", adminPanelKeyboard());
      }
      withDb((db2) => {
        if (!Array.isArray(db2.applicationQuestions) || db2.applicationQuestions.length !== total) {
          db2.applicationQuestions = defaultApplicationQuestions();
        }
        db2.applicationQuestions[qNum - 1].text = txt.trim();
      });
      clearAdminInput(ctx.from.id);
      return ctx.reply(`${qNum}-savol matni yangilandi.`, adminPanelKeyboard());
    }
    if (pendingAdminAction === "add_admin") {
      const id = Number(txt.trim());
      if (!id) return ctx.reply("ID notogri, qayta yuboring:");
      withDb((db2) => {
        db2.admins[id] = { role: "normal", addedAt: new Date().toISOString() };
      });
      clearAdminInput(ctx.from.id);
      return ctx.reply(`Admin qoshildi: ${id}`, adminPanelKeyboard());
    }
    if (pendingAdminAction === "remove_admin") {
      const id = Number(txt.trim());
      if (!id) return ctx.reply("ID notogri, qayta yuboring:");
      withDb((db2) => delete db2.admins[id]);
      clearAdminInput(ctx.from.id);
      return ctx.reply(`Admin ochirildi: ${id}`, adminPanelKeyboard());
    }
    if (pendingAdminAction === "broadcast") {
      const messageText = txt.trim();
      if (!messageText) return ctx.reply("Bosh xabar yuborib bolmaydi.");
      const db2 = readDb();
      let sent = 0;
      for (const user of Object.values(db2.users)) {
        try {
          await ctx.telegram.sendMessage(user.id, messageText);
          sent += 1;
        } catch (_e) {}
      }
      clearAdminInput(ctx.from.id);
      return ctx.reply(`Broadcast yakunlandi. Yuborildi: ${sent}`, adminPanelKeyboard());
    }
  }

  if (txt && txt === db.settings.buttons.apply) {
    if (!db.settings.applicationsOpen) return ctx.reply("Hozirda ariza topshirish yopiq.");
    return startApplication(ctx);
  }

  const state = sessions.get(ctx.from.id);
  if (!state || state.mode !== "application") return;
  const questionDefs = getQuestionDefs();
  const q = questionDefs[state.index];
  if (!q || q.inline) return;

  if (q.file) {
    const document = ctx.message.document;
    if (!document) return ctx.reply("Iltimos, resume fayl yuboring (PDF / DOC / DOCX).");
    const allowed = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (!allowed.includes(document.mime_type)) return ctx.reply("Faqat PDF, DOC, DOCX format qabul qilinadi.");
    state.answers[q.key] = {
      file_id: document.file_id,
      file_name: document.file_name,
      mime_type: document.mime_type,
    };
  } else {
    state.answers[q.key] = txt || "";
  }

  state.index += 1;
  sessions.set(ctx.from.id, state);
  if (state.index >= questionDefs.length) return submitApplication(ctx);
  return askCurrentQuestion(ctx);
});

bot.launch().then(() => {
  console.log("Bot ishga tushdi.");
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
