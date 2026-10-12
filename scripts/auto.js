import { spawn, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
if(!existsSync('.env')) { console.error('Создай .env по образцу .env.example и добавь BOT_TOKEN.'); process.exit(1); }
const git = (...args) => execFileSync('git', args, {encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
let child, stopping = false, updating = false, restartTimer;
function start() {
  if(stopping) return;
  child = spawn(process.execPath, ['--env-file=.env','src/index.js'], {stdio:'inherit'});
  child.on('exit', () => { child = undefined; if(!stopping && !updating) restartTimer = setTimeout(start, 5000); });
}
async function stopChild() {
  clearTimeout(restartTimer);
  if(!child) return;
  const target = child;
  await new Promise(resolve => {
    const timer = setTimeout(() => target.kill('SIGKILL'), 5000);
    target.once('exit', () => { clearTimeout(timer); resolve(); }); target.kill('SIGTERM');
  });
}
start();
const timer = setInterval(async () => {
  if(stopping || updating) return; updating = true;
  try {
    if(git('status','--porcelain')) { console.log('Есть локальные правки. Автообновление пропущено.'); return; }
    git('fetch','origin','main');
    if(git('rev-parse','HEAD') === git('rev-parse','origin/main')) return;
    // Check that update is a fast-forward before stopping the current bot.
    git('merge-base','--is-ancestor','HEAD','origin/main');
    await stopChild();
    try { git('merge','--ff-only','origin/main'); console.log('Код обновлён из GitHub.'); }
    finally { if(!stopping) start(); }
  } catch { console.log('Не удалось обновиться из GitHub. Проверь интернет и доступ к репозиторию.'); }
  finally { updating = false; }
}, 30000);
for(const signal of ['SIGINT','SIGTERM']) process.on(signal, async () => { stopping = true; clearInterval(timer); await stopChild(); process.exit(0); });
