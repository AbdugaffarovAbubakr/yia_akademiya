const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "data", "db.json");

const defaultApplicationQuestions = () => [
  {
    key: "region",
    text: "1) Qaysi hududdansiz? Quyidagilardan birini tanlang:",
    options: [
      "Qoraqalpog'iston R",
      "Andijon viloyati",
      "Buxoro viloyati",
      "Jizzax viloyati",
      "Qashqadaryo viloyati",
      "Namangan viloyati",
      "Navoiy viloyati",
      "Samarqand viloyati",
      "Sirdaryo viloyati",
      "Surxondaryo viloyati",
      "Toshkent viloyati",
      "Farg'ona viloyati",
      "Xorazm viloyati",
      "Toshkent shahar"
    ]
  },
  { key: "districtCity", text: "2) Tuman/shaharingizni yozing:" },
  { key: "mahalla", text: "3) Mahalla nomini kiriting:" },
  { key: "fio", text: "4) F.I.O ni kiriting:" },
  { key: "university", text: "5) OTM nomini kiriting:" },
  { key: "major", text: "6) Talim yonalishini kiriting:" },
  { key: "course", text: "7) Kursingizni kiriting:" },
  { key: "phone", text: "8) Telefon raqamingizni kiriting:" },
  { key: "email", text: "9) Email manzilingizni kiriting:" },
  { key: "telegramUsername", text: "10) Telegram username kiriting (@...):" },
  { key: "languages", text: "11) Chet tillari:" },
  { key: "experience", text: "12) Oldingi tajriba (volontyorlik, stajirovka va h.k.):" },
  { key: "teamwork", text: "13) Jamoaviy ish tajribasi (misol bilan):" },
  { key: "internQualities", text: "14) Stajyor qanday sifatga ega bolishi kerak?" },
  { key: "govMeaning", text: "15) Davlat tashkilotida ishlash nimani anglatadi?" },
  { key: "q13", text: "16) Qoshimcha izohlaringiz (ixtiyoriy):" },
  { key: "q14", text: "17) 6 oy davomida muntazam qatnasha olasizmi?", inline: true },
  { key: "q15", text: "18) Ofisda ishlash formatiga rozimisiz?", inline: true },
  { key: "resume", text: "19) Resume yuboring (PDF / DOC / DOCX):", file: true },
];

const defaultDb = () => ({
  settings: {
    applicationsOpen: true,
    groupTarget: "",
    groupTargets: [],
    buttons: {
      apply: "📝 Ariza yuborish",
      agency: "🏢 Agentlik haqida",
      office: "🏫 Amaliyot ofisi haqida",
      contact: "📞 Bog'lanish",
    },
    content: {
      start:
        "Assalomu alaykum! Stajirovka botiga xush kelibsiz.",
      agency:
        "Agentlik haqida ma'lumot hozircha kiritilmagan. Admin paneldan yangilang.",
      office:
        "Amaliyot ofisi haqida ma'lumot hozircha kiritilmagan. Admin paneldan yangilang.",
      contact:
        "Telefon: +998 XX XXX XX XX\nTelegram: https://t.me/username",
    },
  },
  users: {},
  admins: {},
  applicationQuestions: defaultApplicationQuestions(),
  applications: [],
  files: [],
});

function ensureDb() {
  if (!fs.existsSync(DB_PATH)) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(defaultDb(), null, 2), "utf8");
  }
}

function readDb() {
  ensureDb();
  const db = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  if (!db.settings.groupTargets || !Array.isArray(db.settings.groupTargets)) {
    db.settings.groupTargets = [];
  }
  if (!db.settings.content) db.settings.content = {};
  if (!db.settings.content.start) {
    db.settings.content.start = "Assalomu alaykum! Stajirovka botiga xush kelibsiz.";
  }
  if (db.settings.groupTarget && !db.settings.groupTargets.includes(db.settings.groupTarget)) {
    db.settings.groupTargets.push(db.settings.groupTarget);
  }
  if (!db.applicationQuestions || !Array.isArray(db.applicationQuestions)) {
    db.applicationQuestions = defaultApplicationQuestions();
  } else {
    const defaults = defaultApplicationQuestions();
    if (db.applicationQuestions.length !== defaults.length) {
      const existingByKey = {};
      db.applicationQuestions.forEach((q) => {
        if (q && q.key) existingByKey[q.key] = q;
      });
      db.applicationQuestions = defaults.map((d) => {
        const ex = existingByKey[d.key];
        if (!ex) return d;
        return {
          ...d,
          text: ex.text || d.text,
        };
      });
    }
  }
  writeDb(db);
  return db;
}

function writeDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf8");
}

function withDb(fn) {
  const db = readDb();
  const result = fn(db);
  writeDb(db);
  return result;
}

module.exports = { readDb, writeDb, withDb, defaultApplicationQuestions };
