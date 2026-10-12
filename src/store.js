import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
export const statuses = ['В коллекции', 'На продажу', 'Планирую NFT', 'NFT', 'Продан'];
export function username(value) {
  const v = value.trim().replace(/^@/, '');
  if (!/^[a-zA-Z][a-zA-Z0-9_]{3,31}$/.test(v)) throw new Error('Юзернейм: 4–32 символа, латинские буквы, цифры и _. Первый символ — буква.');
  return v.toLowerCase();
}
export class Store {
  constructor(file, owner) {
    this.file = file; this.owner = String(owner);
    this.data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { accounts: [], items: [] };
    if (!Array.isArray(this.data.accounts) || !Array.isArray(this.data.items)) throw new Error('Некорректный файл каталога');
  }
  change(actor, fn) {
    if (String(actor) !== this.owner) throw new Error('Изменять каталог может только владелец.');
    const next = structuredClone(this.data); const result = fn(next);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temp = this.file + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(next, null, 2), { mode: 0o600 });
    fs.renameSync(temp, this.file); this.data = next; return result;
  }
  account(actor, name) {
    name = name.trim(); if (!name || name.length > 80) throw new Error('Название аккаунта: от 1 до 80 символов.');
    return this.change(actor, d => {
      if (d.accounts.some(a => a.name.toLowerCase() === name.toLowerCase())) throw new Error('Такой аккаунт уже есть.');
      const a = { id: randomUUID().slice(0, 8), name }; d.accounts.push(a); return a;
    });
  }
  save(actor, item) {
    return this.change(actor, d => {
      if (!d.accounts.some(a => a.id === item.accountId)) throw new Error('Аккаунт не найден.');
      const name = username(item.name);
      if (!statuses.includes(item.status)) throw new Error('Неизвестный статус.');
      if (d.items.some(i => i.name === name && i.id !== item.id)) throw new Error('Этот юзернейм уже добавлен.');
      const existing = item.id && d.items.find(i => i.id === item.id);
      if (item.id && !existing) throw new Error('Запись не найдена.');
      const value = { id: item.id || randomUUID().slice(0, 8), name, accountId: item.accountId, status: item.status, price: String(item.price || '').slice(0, 100), note: String(item.note || '').slice(0, 500), updatedAt: new Date().toISOString() };
      if (existing) Object.assign(existing, value); else d.items.push(value); return value;
    });
  }
  remove(actor, id) { return this.change(actor, d => { d.items = d.items.filter(i => i.id !== id); }); }
  removeAccount(actor, id) { return this.change(actor, d => {
    if (d.items.some(i => i.accountId === id)) throw new Error('Сначала перенеси или удали юзернеймы этого аккаунта.');
    d.accounts = d.accounts.filter(a => a.id !== id);
  }); }
}
