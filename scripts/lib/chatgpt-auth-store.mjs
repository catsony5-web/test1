import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, writeFile, unlink } from 'node:fs/promises';
import { renameSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';

const ENTROPY = 'personal-budget-chatgpt-local-v1';

// Credential bytes travel through stdin, never process arguments or environment.
function dpapi(operation, value) {
  if (process.platform !== 'win32') throw new Error('이 기기의 보호된 인증 저장소를 지원하지 않습니다.');
  const method = operation === 'protect' ? 'Protect' : 'Unprotect';
  const command = `Add-Type -AssemblyName System.Security; $ErrorActionPreference='Stop'; try { $b=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $e=[Text.Encoding]::UTF8.GetBytes('${ENTROPY}'); $r=[Security.Cryptography.ProtectedData]::${method}($b,$e,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($r)); } catch { exit 1 }`;
  return new Promise((accept, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    let result = '', settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (error) reject(new Error('Windows 인증 정보 보호 작업을 완료하지 못했습니다.'));
      else accept(Buffer.from(result, 'base64'));
    };
    const timer = setTimeout(() => { child.kill(); finish(true); }, 15000);
    child.stdout.on('data', (chunk) => {
      result += chunk.toString('utf8');
      if (result.length > 8 * 1024 * 1024) { child.kill(); finish(true); }
    });
    child.once('error', () => finish(true));
    child.stdin.on('error', () => finish(true));
    child.once('close', (code) => finish(code !== 0 || !result || !/^[A-Za-z0-9+/=]*$/.test(result)));
    child.stdin.end(Buffer.from(value).toString('base64'));
  });
}

export const windowsCredentialProtection = {
  protect: (value) => dpapi('protect', value),
  unprotect: (value) => dpapi('unprotect', value)
};

// A kernel-owned pipe disappears on process exit, so crashes cannot leave a stale
// lock or allow two runtimes to race a rotating refresh token.
async function lockDirectory(directory) {
  const key = createHash('sha256').update(directory.toLowerCase()).digest('hex');
  const address = process.platform === 'win32' ? `\\\\.\\pipe\\ledger-chatgpt-${key}` : `\0ledger-chatgpt-${key}`;
  if (!['win32', 'linux'].includes(process.platform)) throw new Error('이 운영체제의 인증 저장소 잠금을 지원하지 않습니다.');
  const server = createServer((socket) => socket.destroy());
  await new Promise((accept, reject) => {
    server.once('error', () => reject(new Error('다른 가계부 서버가 이 ChatGPT 인증 저장소를 사용 중입니다.')));
    server.listen(address, accept);
  });
  server.unref();
  return () => new Promise((accept) => server.close(accept));
}

export async function createProtectedAuthStore({ directory, protection = windowsCredentialProtection } = {}) {
  if (!directory) {
    if (process.platform !== 'win32' || !process.env.LOCALAPPDATA) throw new Error('Windows 인증 정보 저장 위치를 확인할 수 없습니다.');
    directory = join(process.env.LOCALAPPDATA, 'PersonalBudget', 'ChatGPT');
  }
  directory = resolve(directory);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  directory = await realpath(directory);
  const unlock = await lockDirectory(directory);
  const file = join(directory, 'profiles.dpapi');
  let closed = false;
  return {
    async read() {
      if (closed) throw new Error('인증 저장소가 닫혔습니다.');
      let envelope;
      try { envelope = await readFile(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
      if (envelope.length > 8 * 1024 * 1024) throw new Error('인증 저장소 크기를 확인해 주세요.');
      try { return JSON.parse((await protection.unprotect(envelope)).toString('utf8')); }
      catch { throw new Error('인증 저장소를 읽지 못했습니다. 기존 파일을 보존했습니다.'); }
    },
    async write(value, assertCurrent = () => {}) {
      if (closed) throw new Error('인증 저장소가 닫혔습니다.');
      const encrypted = await protection.protect(Buffer.from(JSON.stringify(value), 'utf8'));
      const temporary = join(directory, `profiles-${randomUUID()}.tmp`);
      try {
        await writeFile(temporary, encrypted, { mode: 0o600, flag: 'wx', flush: true });
        assertCurrent();
        // No asynchronous gap between cancellation/ownership validation and commit.
        renameSync(temporary, file);
      } finally { await unlink(temporary).catch((error) => { if (error.code !== 'ENOENT') throw error; }); }
    },
    async close() { if (!closed) { closed = true; await unlock(); } }
  };
}
