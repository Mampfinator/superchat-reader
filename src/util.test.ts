import { assertEquals } from '@std/assert/equals';
import { assert } from '@std/assert/assert';
import { Combine, sleep } from '@app/util.ts';

async function* generate<T>(delay: number, ...items: T[]): AsyncGenerator<T> {
    while (items.length > 0) {
        await sleep(delay);
        yield items.shift()!;
    }
}

const collect = async <T>(iterator: AsyncIterable<T>) => {
    const out = [];

    for await (const item of iterator) {
        out.push(item);
    }

    return out;
};

Deno.test({
    name: 'Combine: preserves item order',
    async fn() {
        const combine = new Combine<number>();

        combine.add('generate1', generate(10, 1, 2, 3, 5));
        combine.add('generate2', generate(35, 4, 6));

        const result = await collect(combine);

        for (let i = 0; i < result.length; i++) {
            assertEquals(result[i], i + 1);
        }
    },
});

Deno.test({
    name: 'Combine: iterators are removed and added while running',
    async fn() {
        const combine = new Combine<number>();

        combine.add('generate1', generate(10, 1, 2, 3));

        const items = [];

        for await (const item of combine) {
            items.push(item);

            if (items.length === 2) {
                combine.add('generate2', generate(35, 4, 5));
            }

            // implementation detail: because of how `generate` works, a `done: true` is yielded only after all its elements are exhausted.
            if (items.length === 4) {
                //@ts-expect-error accessing internal property for testing
                const generate1 = combine.iterables.get('generate1');
                assert(!generate1, 'iterable not removed when exhausted');
            }
        }

        assertEquals(items.length, 5);
    },
});
