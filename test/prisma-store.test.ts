import { describe, it, expect } from 'vitest';
import { prismaStore, RIGHTS_STORE_PRISMA_MODEL } from '../src/rights.js';

describe('prismaStore (LinkHub CM-L2)', () => {
  it('reads through $queryRawUnsafe and writes through $executeRawUnsafe, with positional params', async () => {
    const calls: Array<[string, string, unknown[]]> = [];
    const rows = new Map<string, string>();
    const prisma = {
      async $queryRawUnsafe(sql: string, ...p: unknown[]) {
        calls.push(['query', sql, p]);
        const v = rows.get(String(p[0]));
        return v === undefined ? [] : [{ value: v }];
      },
      async $executeRawUnsafe(sql: string, ...p: unknown[]) {
        calls.push(['execute', sql, p]);
        if (sql.startsWith('INSERT')) rows.set(String(p[0]), String(p[1]));
        if (sql.startsWith('DELETE') && p.length) rows.delete(String(p[0]));
        return 1;
      },
    };
    const store = prismaStore(prisma);
    await store.set('req:1', '{"a":1}', { ttlSeconds: 60 });
    expect(await store.get('req:1')).toBe('{"a":1}');
    await store.delete('req:1');
    expect(await store.get('req:1')).toBeNull();
    expect(calls.filter(([k]) => k === 'query').every(([, sql]) => sql.startsWith('SELECT'))).toBe(true);
    expect(calls.filter(([k]) => k === 'execute').map(([, sql]) => sql.split(' ')[0])).toEqual(['INSERT', 'DELETE', 'DELETE']);
    expect(RIGHTS_STORE_PRISMA_MODEL).toContain('@@map("cookiemunch_rights_store")');
  });
});
