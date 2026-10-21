// The files the Habblaud World server keeps as exact copies (protocol.ts and city.ts, with the SHA-256 checked
// there) import nothing and use neither Node nor DOM: copied byte by byte, they compile on the other side. It lives here (not next
// to them, in shared/) because it needs to read the disk.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(join(import.meta.dirname, '..', '..', 'shared', 'world', file), 'utf8');

describe('arquivos copiados para o servidor do mundo', () => {
  for (const file of ['protocol.ts', 'city.ts']) {
    it(`${file}: sem imports, sem Node nem DOM, com o aviso no topo`, () => {
      const src = read(file);
      expect(src).not.toMatch(/^\s*import\s/m);
      expect(src).not.toMatch(/\brequire\(|\bprocess\.|\bwindow\.|\bdocument\./);
      expect(src.startsWith('// AVISO')).toBe(true);
    });
  }
});
