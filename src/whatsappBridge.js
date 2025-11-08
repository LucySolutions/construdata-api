import TelegramBot from "node-telegram-bot-api";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;

export const startTelegramBridge = () => {
  if (!BOT_TOKEN || !N8N_WEBHOOK_URL) {
    console.error("❌ Faltan variables de entorno: TELEGRAM_BOT_TOKEN o N8N_WEBHOOK_URL");
    return;
  }

  const bot = new TelegramBot(BOT_TOKEN, { polling: true });
  console.log("🤖 Telegram bot escuchando mensajes...");

  bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    try {
      // Prepara el payload que irá a n8n
      const payload = {
        chat_id: chatId,
        user: msg.from,
        message: msg,
      };

      // Envía el mensaje completo al flujo n8n
      const response = await axios.post(N8N_WEBHOOK_URL, payload);

      // Respuesta de n8n
      const reply = response.data?.reply || "✅ Mensaje recibido correctamente.";
      await bot.sendMessage(chatId, reply);
    } catch (error) {
      console.error("❌ Error enviando mensaje a n8n:", error.message);
      await bot.sendMessage(chatId, "⚠️ Hubo un error procesando tu mensaje.");
    }
  });
};
