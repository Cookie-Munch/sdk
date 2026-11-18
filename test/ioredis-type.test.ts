import { describe, it, expectTypeOf } from 'vitest';
import { ioredisStore, type RightsIoredisClient } from '../src/rights.js';

// The shape ioredis declares for get/set/del (overloads), without depending on ioredis itself.
interface IoredisLike {
  get(key: string): Promise<string | null>;
  set(key: string | Buffer, value: string | Buffer | number, callback?: (e: Error | null, r?: 'OK') => void): Promise<'OK'>;
  set(key: string | Buffer, value: string | Buffer | number, secondsToken: 'EX', seconds: number | string, callback?: (e: Error | null, r?: 'OK') => void): Promise<'OK'>;
  del(...args: Array<string | Buffer>): Promise<number>;
}

describe('Upcify: ioredisStore takes a real ioredis client', () => {
  it('an ioredis-shaped client is assignable', () => {
    expectTypeOf<IoredisLike>().toMatchTypeOf<RightsIoredisClient>();
    const store = ioredisStore({} as IoredisLike);
    expectTypeOf(store.get).toBeFunction();
  });
});
