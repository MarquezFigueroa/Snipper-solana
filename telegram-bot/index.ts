import { Telegraf } from 'telegraf';

const bot = new Telegraf(process.env.BOT_TOKEN!); // Asegúrate de configurar BOT_TOKEN en tus variables de entorno

bot.start((ctx: { reply: (arg0: string) => any; }) => ctx.reply('Welcome! This is the Solana Sniper Bot.'));
bot.help((ctx: { reply: (arg0: string) => any; }) => ctx.reply('Send me a command to control the bot.'));

// Aquí puedes agregar comandos específicos para operar el bot
bot.command('snipe', (ctx: { reply: (arg0: string) => void; }) => {
  // Lógica para iniciar el sniping
  ctx.reply('Sniping initiated!');
});

bot.launch();
