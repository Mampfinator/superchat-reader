// THIS FILE IS A MESS BECAUSE SO IS YOUTUBE.JS I'LL FIX BOTH EVENTUALLY
// deno-lint-ignore-file no-explicit-any
import { IRequestOrchestrator } from 'youtube.js';
import { FetchOptions, FetchReturn, FetchTransform } from 'youtube.js/dist/scraping/scraping.interfaces.js';
import { Err, err, Ok, ok, Result } from 'neverthrow';
import { FetchError, FetchErrorCode } from 'youtube.js/dist/scraping/errors/FetchError.js';
import { getSetCookies, setCookie } from 'https://deno.land/std@0.224.0/http/mod.ts';

type Awaitable<T> = T | Promise<T>;

type RequestQueueItem = {
    callback: () => Promise<string>;
    transform?: (value: string) => Awaitable<Result<any, any>>;
    resolve: (value: Result<any, FetchError>) => void;
    reject: (error?: FetchError) => void;
};

type ItemMetadata = {
    retries: number;
    options: FetchOptions<any>;
    reasons: Error[];
};

function mergeHeaders(a: Headers, b: Headers): Headers {
    const result = new Headers(a);
    for (const [key, value] of b) {
        result.set(key, value);
    }
    return result;
}

export type DenoOrchestratorOptions = {
    interval?: number;
    retries?: number;
};

export class DenoOrchestrator implements IRequestOrchestrator {
    private readonly queue: RequestQueueItem[] = [];
    private readonly metadata = new WeakMap<RequestQueueItem, ItemMetadata>();

    private interval?: number;

    private readonly defaultHeaders = new Headers({
        'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
        Cookie: '',
    });

    private applyCookies(response: Response) {
        const cookies = getSetCookies(response.headers);
        for (const cookie of cookies) {
            setCookie(this.defaultHeaders, cookie);
        }
    }

    private readonly options: Required<DenoOrchestratorOptions>;

    constructor(options: DenoOrchestratorOptions = {}) {
        this.options = {
            interval: options.interval ?? 1250,
            retries: options.retries ?? 3,
        };
    }

    async init(): Promise<Result<void, Error>> {
        try {
            const home = await fetch('https://www.youtube.com', {
                headers: new Headers(this.defaultHeaders),
            });

            this.applyCookies(home);

            const upgraded = await fetch(
                'https://www.youtube.com/upgrade_visitor_cookie',
                {
                    method: 'POST',
                    body: JSON.stringify({ params: { eom: 1 } }),
                },
            );

            this.applyCookies(upgraded);

            const saveConsent = await fetch('https://consent.youtube.com/save', {
                method: 'POST',
                body: JSON.stringify({
                    params: {
                        gl: 'GB',
                        m: 0,
                        pc: 'yt',
                        x: 5,
                        src: 2,
                        hl: 'en',
                        /**
                         * from some preliminary testing, this appears to be a constant for `Reject All`.
                         */
                        bl: 529290703,
                        set_eom: true,
                    },
                }),
            });

            this.applyCookies(saveConsent);

            this.interval = setInterval(() => {
                this.processQueue();
            }, this.options.interval);

            return ok(undefined);
        } catch (error) {
            return err(error as Error);
        }
    }

    fetch<TTransform extends FetchTransform | undefined = undefined>(
        options: FetchOptions<TTransform>,
    ): FetchReturn<TTransform> {
        const { promise, resolve, reject } = Promise.withResolvers<Result<any, Error>>();

        const item: RequestQueueItem = {
            callback: async () => {
                const response = await fetch(options.url, {
                    method: options.method,
                    headers: mergeHeaders(this.defaultHeaders, new Headers(options.headers)),
                    body: typeof options.body === 'object' ? JSON.stringify(options.body) : options.body,
                });

                this.applyCookies(response);

                return response.text();
            },
            transform: options.transform,
            resolve,
            reject,
        };

        const meta: ItemMetadata = {
            retries: 0,
            options,
            reasons: [],
        };

        this.queue.push(item);
        this.metadata.set(item, meta);

        return promise as Promise<any>;
    }

    async processQueue() {
        const next = this.queue.shift();
        if (!next) {
            return;
        }

        const meta = this.metadata.get(next)!;

        try {
            const response = await next.callback();
            const transformed = next.transform ? await next.transform(response) : response;
            if (transformed instanceof Ok || transformed instanceof Err) {
                next.resolve(transformed);
            } else {
                next.resolve(ok(transformed));
            }
        } catch (error) {
            if (error instanceof FetchError) {
                next.reject(error);
                return;
            }

            meta.retries++;
            meta.reasons.push(error as Error);

            if (meta.retries > this.options.retries) {
                next.reject(
                    new FetchError(
                        FetchErrorCode.RetriesExceeded,
                        meta.options,
                        meta.reasons,
                    ),
                );
            } else {
                this.queue.unshift(next);
            }
        }
    }

    destroy(): Promise<void> {
        clearInterval(this.interval);
        return Promise.resolve();
    }
}
