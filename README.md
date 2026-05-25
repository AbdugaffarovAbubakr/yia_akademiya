# Stajirovka Telegram Bot

Ushbu bot stajirovka uchun arizalarni yig'ish, admin boshqaruvi va `.xlsx` eksportni bajaradi.

## 1) O'rnatish

```bash
npm install
```

## 2) Sozlash

`.env.example` faylni `.env` ga nusxa qilib to'ldiring:

```env
BOT_TOKEN=your_bot_token
SUPER_ADMIN_ID=123456789
# ixtiyoriy (yoki bot ichida /set_group orqali sozlaysiz)
GROUP_CHAT_ID=
```

- `SUPER_ADMIN_ID`: asosiy admin Telegram ID.
- `GROUP_CHAT_ID`: ixtiyoriy. Agar bo'sh qoldirilsa, admin `/set_group @username` bilan sozlaydi.

## 3) Ishga tushirish

```bash
npm start
```

## 4) Foydalanuvchi oqimi

- `/start`:
  - `📝 Ariza yuborish`
  - `🏢 Agentlik haqida`
  - `🏫 Amaliyot ofisi haqida`
  - `📞 Bog'lanish`
- Ariza ochiq bo'lsa 16 bosqichli so'rovnoma.
- 14-15 savollar `Ha/Yo'q` inline tugmalar bilan.
- 16-savol resume fayl (PDF/DOC/DOCX).

## 5) Admin buyruqlari

- `/admin` - buyruqlar ro'yxati
- `/set_agency <matn>`
- `/set_office <matn>`
- `/set_contact <matn>`
- `/set_button <agency|office|contact> <yangi nom>`
- `/set_group <@username yoki -100...>`
- `/app_open`
- `/app_close`
- `/add_admin <telegram_id>` (faqat asosiy admin)
- `/remove_admin <telegram_id>` (faqat asosiy admin)
- `/admins`
- `/users`
- `/broadcast <xabar>`
- `/export` - barcha arizalar `.xlsx` fayl

## 6) Ma'lumotlar saqlanishi

`data/db.json` ichida:
- settings
- users
- admins
- applications
- files (resume reference)

## 7) Eslatma

- Excelga resume faylning o'zi emas, `Resume Ref` yoziladi.
- Guruhga esa ariza matni + resume fayl yuboriladi.
