export const sleep = (ms: number): Promise<void> => {
    return new Promise((res) => setTimeout(res, ms));
};

// deno-lint-ignore no-explicit-any
export type Constructor<T> = new (...args: any[]) => T;

/**
 * Combines multiple async iterables into one, while also allowing you to remove or add iterables during use.
 * When any iterable is exhausted, it is automatically removed. When there are no more iterables to process. the iterator ends.
 */
export class Combine<T> implements AsyncIterable<T> {
    async *[Symbol.asyncIterator](): AsyncGenerator<T> {
        const promises = new Map();

        for (const [key, iterator] of this.iterables.entries()) {
            promises.set(key, iterator.next().then((result) => [key, result]));
        }
        while (promises.size > 0) {
            const iterables = new Set(this.iterables.keys());
            for (const iteratorId of promises.keys()) {
                iterables.delete(iteratorId);
            }

            if (iterables.size > 0) {
                for (const iteratorId of iterables) {
                    promises.set(
                        iteratorId,
                        this.iterables.get(iteratorId)!.next().then((result) => [iteratorId, result]),
                    );
                }
            }

            const [iteratorId, result] = await Promise.race(promises.values());
            promises.delete(iteratorId);

            // we only want to yield items for iterators we still care about, and we only want to yield actual items.
            // the most common case for a value being undefined is a generator function that does not have a return statement,
            // so we special case that but don't care about other `undefined` values.
            if ((!result.done && result.value !== undefined) && this.iterables.has(iteratorId)) {
                yield result.value;
                promises.set(iteratorId, this.iterables.get(iteratorId)!.next().then((result) => [iteratorId, result]));
            }

            // a `return` in a generator function yields whatever is return with done: true, so we handle
            // the value *before* removing the iterator.
            if (result.done) {
                this.remove(iteratorId);
            }
        }
    }

    private readonly iterables: Map<string, AsyncIterator<T>> = new Map();

    public add(key: string, iterable: AsyncIterator<T>): this {
        this.iterables.set(key, iterable);
        return this;
    }

    public remove(key: string): AsyncIterator<T> | undefined {
        const iterable = this.iterables.get(key);
        this.iterables.delete(key);
        return iterable;
    }
}
