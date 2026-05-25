require("dotenv").config();

const config = {
  botToken: process.env.BOT_TOKEN || "",
  groupChatId: process.env.GROUP_CHAT_ID || "",
  superAdminId: Number(process.env.SUPER_ADMIN_ID || 0),
};

module.exports = config;
