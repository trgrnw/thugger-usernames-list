import { Store } from './store.js';
import { Bot } from './bot.js';
const token = process.env.BOT_TOKEN;
const owner = process.env.OWNER_ID || '1900349507';
if (!token || !/^\d+$/.test(owner)) { console.error('Заполни BOT_TOKEN и OWNER_ID в .env'); process.exit(1); }
const controller = new AbortController();
const api = async (method, body) => {
  let response;
  try { response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {method:'POST',headers:{'Content-Type':'application/json'}, body:JSON.stringify(body), signal:AbortSignal.any([controller.signal, AbortSignal.timeout(45000)])}); }
  catch { throw new Error('Нет соединения с Telegram'); }
  const data = await response.json();
  if(!data.ok) { const error = new Error(`Telegram: ${data.error_code}`); error.code = data.error_code; error.retry = data.parameters?.retry_after; throw error; }
  return data.result;
};
const bot = new Bot(new Store(process.env.DATA_FILE || './data/catalog.json', owner), api);
for(const signal of ['SIGINT','SIGTERM']) process.on(signal, () => controller.abort());
let offset = 0;
try {
  const me = await api('getMe', {}); console.log(`Бот @${me.username} запущен`);
  const webhook = await api('getWebhookInfo', {});
  if(webhook.url) throw new Error('У бота включён webhook. Отключи его перед запуском polling.');
  await api('setMyCommands', {commands:[{command:'start',description:'Каталог юзернеймов'},{command:'cancel',description:'Отменить ввод'}]});
  while(!controller.signal.aborted) {
    try {
      const updates = await api('getUpdates', {offset, timeout:30, allowed_updates:['message','callback_query']});
      for(const update of updates) {
        try { await bot.handle(update); }
        catch(error) {
          const m = update.callback_query?.message || update.message;
          if(m && !controller.signal.aborted) await bot.send(m.chat.id, error.code ? 'Telegram временно не принял действие. Попробуй ещё раз.' : error.message).catch(() => {});
        }
        offset = update.update_id + 1;
      }
    } catch(error) {
      if(controller.signal.aborted) break;
      if(error.code === 401 || error.code === 409) throw error;
      console.error(error.message); await new Promise(r => setTimeout(r, Math.min(error.retry || 3, 60)*1000));
    }
  }
} catch(error) { console.error(error.message); process.exitCode = 1; }
