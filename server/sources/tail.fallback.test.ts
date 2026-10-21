// FileTail with a stat that does not help: Linux without statx (WSL1, old seccomp), where Node returns ctime as
// birthtime, and a file system that reuses the inode of a deleted file (ext4). node:fs is swapped only
// in this file, to simulate both on any system.
import { appendFileSync, rmSync, writeFileSync, type Stats } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tempDir } from '../test/fixtures';
import { FileTail } from './tail';

const sim = vi.hoisted(() => ({ birthIsCtime: false, sameIno: false }));

vi.mock('node:fs', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs')>();
  const fake = (st: Stats): Stats => {
    if (sim.birthIsCtime) st.birthtimeMs = st.ctimeMs;
    if (sim.sameIno) st.ino = 1;
    return st;
  };
  return { ...fs, fstatSync: (fd: number) => fake(fs.fstatSync(fd)), statSync: (path: string) => fake(fs.statSync(path)) };
});

/** Waits for the file system clock to advance (ext4 stores times in ticks of a few ms). */
const tick = () => new Promise((ok) => setTimeout(ok, 15));

describe('FileTail com stat que não ajuda', () => {
  let tmp: ReturnType<typeof tempDir>;
  let file: string;
  beforeEach(() => {
    tmp = tempDir();
    file = join(tmp.dir, 'a.jsonl');
  });
  afterEach(() => {
    sim.birthIsCtime = false;
    sim.sameIno = false;
    tmp.cleanup();
  });

  it('Linux sem statx (birthtime = ctime): linhas acrescentadas não contam como troca', async () => {
    sim.birthIsCtime = true;
    writeFileSync(file, '{"a":1}\n');
    const t = new FileTail(file);
    t.seekTail(1024);
    expect(t.read().lines).toEqual(['{"a":1}']);
    for (const n of [2, 3]) {
      await tick();
      appendFileSync(file, `{"a":${n}}\n`);
      expect(t.read()).toMatchObject({ reset: false, lines: [`{"a":${n}}`] });
    }
  });

  it('inode reaproveitado: a troca aparece pelo começo do arquivo, com ou sem birthtime de verdade', async () => {
    sim.sameIno = true;
    // On NTFS, a file recreated with the same name in under 15 s inherits the deleted one's birthtime ("tunneling"): with the
    // simulated inode the same, FileTail has no way to notice the swap. There the inode does not repeat (the file id changes),
    // so only the birthtime = ctime variant applies.
    for (const birthIsCtime of process.platform === 'win32' ? [true] : [false, true]) {
      sim.birthIsCtime = birthIsCtime;
      writeFileSync(file, 'velho-1\n');
      const t = new FileTail(file);
      t.read();
      await tick();
      rmSync(file);
      writeFileSync(file, 'novo-1\nnovo-2\n');
      expect(t.read()).toMatchObject({ reset: true, lines: ['novo-1', 'novo-2'] });
    }
  });
});
