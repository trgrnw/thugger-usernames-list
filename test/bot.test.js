import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.js';
import { Bot } from '../src/bot.js';
function setup(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(),'usernames-')); t.after(() => fs.rmSync(dir,{recursive:true,force:true})); return new Store(path.join(dir,'catalog.json'),1900349507); }
test('store protects all mutations and persists valid catalog', t => {
  const s = setup(t); assert.throws(() => s.account(1,'fake'));
  const a = s.account(1900349507,'Основной');
  const i = s.save(1900349507,{name:'@Example',accountId:a.id,status:'На продажу'});
  assert.equal(i.name,'example'); assert.equal(new Store(s.file,1900349507).data.items.length,1);
  assert.throws(() => s.save(1,i)); assert.throws(() => s.remove(1,i.id)); assert.throws(() => s.removeAccount(1,a.id));
  assert.throws(() => s.save(1900349507,{...i,id:undefined})); assert.throws(() => s.removeAccount(1900349507,a.id));
  s.remove(1900349507,i.id); s.removeAccount(1900349507,a.id); assert.equal(s.data.accounts.length,0);
});
test('forged admin callbacks cannot change data; public users can browse', async t => {
  const s = setup(t), calls = []; const b = new Bot(s, async (method,data) => { calls.push({method,data}); });
  const a = s.account(1900349507,'Main'); const i = s.save(1900349507,{name:'example',accountId:a.id,status:'В коллекции'});
  for(const data of ['admin','adm:confirm:'+i.id,'adm:account','adm:delaccount:'+a.id,'choose:'+a.id,'status:0']) await b.handle({callback_query:{id:'q',from:{id:2},message:{chat:{id:2,type:'private'}},data}});
  assert.equal(s.data.items.length,1); assert.equal(s.data.accounts.length,1);
  await b.handle({message:{from:{id:2},chat:{id:2,type:'private'},text:'/start'}});
  const home = calls.at(-1).data; assert.ok(!JSON.stringify(home).includes('Админ-раздел'));
});
test('owner can add an item through the complete button wizard', async t => {
  const s = setup(t); const a = s.account(1900349507,'Main'); const b = new Bot(s,async () => {});
  const message = {from:{id:1900349507},chat:{id:1900349507,type:'private'}};
  const click = data => b.handle({callback_query:{id:'q',from:message.from,message,data}});
  const say = text => b.handle({message:{...message,text}});
  await click('adm:add'); await say('@hello_world'); await click('choose:'+a.id); await click('status:1'); await say('100 TON'); await say('Связь с владельцем');
  assert.equal(s.data.items[0].price,'100 TON'); assert.equal(s.data.items[0].accountId,a.id);
});
