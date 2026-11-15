import { watchFile, unwatchFile } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
let child;
let timer;
const start = () => {
  child = spawn(process.execPath, ['--import', 'tsx', 'apps/api/src/main.ts'], {
    stdio: 'inherit',
  });
};
const restart = () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    child.once('exit', start);
    child.kill('SIGTERM');
  }, 200);
};
const files = await readdir('apps/api/src', { recursive: true });
for (const file of files.filter((file) => file.endsWith('.ts')))
  watchFile(`apps/api/src/${file}`, { interval: 500 }, restart);
start();
process.on('SIGTERM', () => {
  for (const file of files) unwatchFile(`apps/api/src/${file}`);
  child.kill('SIGTERM');
});
