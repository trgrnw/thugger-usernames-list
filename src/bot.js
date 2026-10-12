import { statuses, username } from './store.js';
const button = (text, callback_data) => ({ text, callback_data });
const esc = s => String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
export class Bot {
  constructor(store, api) { this.store = store; this.api = api; this.sessions = new Map(); }
  admin(id) { return String(id) === this.store.owner; }
  async send(chat, text, rows = []) { await this.api('sendMessage', { chat_id: chat, text, parse_mode: 'HTML', reply_markup: { inline_keyboard: rows } }); }
  async home(chat, actor) {
    this.sessions.delete(actor);
    await this.send(chat, '👑 <b>Каталог юзернеймов</b>\n\nВыбирай аккаунт или просматривай всю коллекцию.\nПривязки к аккаунтам указаны владельцем каталога.', [[button('📚 Все юзернеймы', 'list:all:0')], [button('👤 Аккаунты', 'accounts'), button('🔎 Поиск', 'search')], [button('💸 На продажу', 'list:sale:0'), button('📊 Статистика', 'stats')], ...(this.admin(actor) ? [[button('⚙️ Админ-раздел', 'admin')]] : [])]);
  }
  async list(chat, scope, page = 0) {
    let items = this.store.data.items.filter(i => scope === 'all' || (scope === 'sale' ? i.status === 'На продажу' : i.accountId === scope)).sort((a,b) => a.name.localeCompare(b.name));
    page = Math.max(0, Math.min(Number(page) || 0, Math.max(0, Math.ceil(items.length / 8) - 1)));
    const rows = items.slice(page * 8, page * 8 + 8).map(i => [button('@' + i.name + ' · ' + i.status, 'item:' + i.id)]);
    const nav = []; if(page > 0) nav.push(button('←', `list:${scope}:${page - 1}`)); if((page + 1)*8 < items.length) nav.push(button('→', `list:${scope}:${page + 1}`));
    if(nav.length) rows.push(nav); rows.push([button('🏠 Меню', 'home')]);
    await this.send(chat, `📚 <b>${esc(this.store.data.accounts.find(a => a.id === scope)?.name || (scope === 'sale' ? 'На продажу' : 'Все юзернеймы'))}</b>\nВсего: ${items.length}\nСтраница ${page + 1}/${Math.max(1, Math.ceil(items.length / 8))}`, rows);
  }
  async handle(update) {
    const q = update.callback_query; const m = q?.message || update.message; const actor = q?.from?.id || m?.from?.id;
    if (!m || !actor) return;
    if (q && q.id !== 'internal') await this.api('answerCallbackQuery', { callback_query_id: q.id });
    const chat = m.chat.id;
    if (m.chat.type !== 'private') { await this.send(chat, 'Открой бота в личных сообщениях.'); return; }
    const action = q?.data || ''; const text = update.message?.text?.trim();
    if(text?.startsWith('/start') || text === '/cancel' || action === 'home') return this.home(chat, actor);
    if(text === '/admin') return this.handle({ callback_query: { from: {id:actor}, message:m, data:'admin', id:'internal' } });
    // Authorization applies to every admin action and to every persistence operation.
    if(action.startsWith('adm:') || action === 'admin') {
      if(!this.admin(actor)) return this.send(chat, '⛔ Изменять каталог может только владелец.');
      this.sessions.delete(actor);
      if(action === 'admin') return this.send(chat, '⚙️ <b>Админ-раздел</b>\nДля изменения записи открой её карточку.\nВсе названия аккаунтов, цены и заметки видны посетителям.', [[button('➕ Аккаунт', 'adm:account')], [button('➕ Юзернейм', 'adm:add')], [button('🗑 Удалить пустой аккаунт', 'adm:accounts')], [button('🏠 Меню', 'home')]]);
      if(action === 'adm:account') { this.sessions.set(actor, {step:'account'}); return this.send(chat, 'Напиши публичное название аккаунта. Например: Основной — @example.\n/cancel — отмена'); }
      if(action === 'adm:add' || action.startsWith('adm:edit:')) {
        if(!this.store.data.accounts.length) return this.send(chat, 'Сначала добавь аккаунт.', [[button('➕ Аккаунт', 'adm:account')]]);
        const item = action.startsWith('adm:edit:') ? this.store.data.items.find(i => i.id === action.split(':')[2]) : undefined;
        if(action.startsWith('adm:edit:') && !item) return this.send(chat, 'Запись не найдена.');
        this.sessions.set(actor, {step:'name', item: item ? {...item} : {}});
        return this.send(chat, 'Введи юзернейм с @ или без. При редактировании введи его заново.\n/cancel — отмена');
      }
      if(action === 'adm:accounts') return this.send(chat, 'Выбери пустой аккаунт для удаления.', this.store.data.accounts.filter(a => !this.store.data.items.some(i => i.accountId === a.id)).map(a => [button(a.name, 'adm:delaccount:' + a.id)]).concat([[button('Назад', 'admin')]]));
      if(action.startsWith('adm:delaccount:')) { this.store.removeAccount(actor, action.split(':')[2]); return this.send(chat, 'Аккаунт удалён.', [[button('Назад', 'admin')]]); }
      if(action.startsWith('adm:delete:')) return this.send(chat, 'Удалить юзернейм из каталога?', [[button('Да, удалить', 'adm:confirm:' + action.split(':')[2])], [button('Отмена', 'home')]]);
      if(action.startsWith('adm:confirm:')) { this.store.remove(actor, action.split(':')[2]); return this.send(chat, 'Запись удалена.', [[button('Меню', 'home')]]); }
    }
    const s = this.sessions.get(actor);
    if(action.startsWith('choose:') || action.startsWith('status:')) {
      if(!this.admin(actor) || !s) return this.send(chat, 'Открой добавление или редактирование заново.');
      if(action.startsWith('choose:') && s.step === 'choose') {
        const id = action.split(':')[1]; if(!this.store.data.accounts.some(a => a.id === id)) return;
        s.item.accountId = id; s.step = 'status';
        return this.send(chat, 'Выбери статус.', statuses.map((v,i) => [button(v, 'status:' + i)]));
      }
      if(action.startsWith('status:') && s.step === 'status') {
        const status = statuses[Number(action.split(':')[1])]; if(!status) return;
        s.item.status = status; s.step = 'price'; return this.send(chat, 'Напиши цену с валютой (например: 100 TON) или «-», если цены нет.');
      }
      return;
    }
    if(action === 'accounts') return this.send(chat, '👤 <b>Аккаунты</b>\nВыбери аккаунт, чтобы посмотреть его юзернеймы.', this.store.data.accounts.map(a => [button(a.name + ' · ' + this.store.data.items.filter(i => i.accountId === a.id).length, 'list:' + a.id + ':0')]).concat([[button('Меню', 'home')]]));
    if(action.startsWith('list:')) { const [,scope,page] = action.split(':'); return this.list(chat, scope, page); }
    if(action === 'stats') return this.send(chat, `📊 <b>Статистика</b>\nАккаунтов: ${this.store.data.accounts.length}\nЮзернеймов: ${this.store.data.items.length}\n\n${statuses.map(v => `${v}: ${this.store.data.items.filter(i => i.status === v).length}`).join('\n')}`, [[button('Меню', 'home')]]);
    if(action.startsWith('item:')) {
      const i = this.store.data.items.find(i => i.id === action.split(':')[1]); if(!i) return this.send(chat, 'Запись уже удалена.');
      return this.send(chat, `<b>@${esc(i.name)}</b>\n👤 Аккаунт: ${esc(this.store.data.accounts.find(a => a.id === i.accountId)?.name || '—')}\n📌 ${esc(i.status)}\n💰 Цена: ${esc(i.price || 'Не указана')}\n📝 ${esc(i.note || 'Без заметки')}\n\nПривязка указана владельцем каталога.`, [[{text:'Открыть в Telegram',url:'https://t.me/' + i.name}], ...(this.admin(actor) ? [[button('✏️ Изменить', 'adm:edit:' + i.id), button('🗑 Удалить', 'adm:delete:' + i.id)]] : []), [button('Меню', 'home')]]);
    }
    if(action === 'search') { this.sessions.set(actor, {step:'search'}); return this.send(chat, 'Введи юзернейм или часть названия.\n/cancel — отмена'); }
    if(text && s) {
      if(s.step === 'search') {
        const found = this.store.data.items.filter(i => i.name.includes(text.replace(/^@/, '').toLowerCase()));
        return this.send(chat, `Найдено: ${found.length}${found.length > 20 ? '. Показаны первые 20, уточни поиск.' : ''}`, found.slice(0,20).map(i => [button('@' + i.name, 'item:' + i.id)]).concat([[button('Меню', 'home')]]));
      }
      if(!this.admin(actor)) { this.sessions.delete(actor); return; }
      if(s.step === 'account') { this.store.account(actor, text); this.sessions.delete(actor); return this.send(chat, '✅ Аккаунт добавлен.', [[button('Добавить юзернейм', 'adm:add'),button('Меню', 'home')]]); }
      if(s.step === 'name') {
        s.item.name = username(text); s.step = 'choose';
        return this.send(chat, 'На каком аккаунте хранится этот юзернейм?', this.store.data.accounts.map(a => [button(a.name, 'choose:' + a.id)]));
      }
      if(s.step === 'price') { if(text.length > 100) return this.send(chat, 'Цена должна быть короче 100 символов.'); s.item.price = text === '-' ? '' : text; s.step = 'note'; return this.send(chat, 'Напиши публичную заметку (до 500 символов) или «-».'); }
      if(s.step === 'note') { if(text.length > 500) return this.send(chat, 'Заметка должна быть короче 500 символов.'); s.item.note = text === '-' ? '' : text; this.store.save(actor, s.item); this.sessions.delete(actor); return this.send(chat, '✅ Юзернейм сохранён.', [[button('Ещё один', 'adm:add'),button('Меню', 'home')]]); }
    }
    if(!action) return this.home(chat, actor);
  }
}
