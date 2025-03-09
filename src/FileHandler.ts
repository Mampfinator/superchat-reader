interface Route<P extends string> {
    name: string;
    matcher: RegExp;
    fn: Callback<P>;
    specificity: RouteSpecificity;
    groups?: PathVariables<P>;
}

interface RouteSpecificity {
    /** Number of URL path fragments. Higher: more specific */
    segments: number;
    /** Number of capturing fragments. Lower: more specific */
    captures: number;
    /**
     * Whether the route allows partial matching. Lower: more specific.
     * @example 1: // /path/to will also match /path/to/file
     * @example 0: // /path/to only matches /path/to
     * @example -1: // Only used in comparison.
     */
    partiallyMatches: number;
}

function compareSpecificity(a: RouteSpecificity, b: RouteSpecificity) {
    const comparison = {
        segments: b.segments - a.segments,
        captures: a.captures - b.captures,
        partiallyMatches: a.partiallyMatches - b.partiallyMatches,
    } as RouteSpecificity;

    if (comparison.segments != 0) {
        return comparison.segments;
    } else if (comparison.captures != 0) {
        return comparison.captures;
    } else {
        return comparison.partiallyMatches;
    }
}

type Awaitable<T> = T | Promise<T>;

type Callback<P extends string> = (variables: PathVariables<P>, path: string) => Awaitable<Response | undefined>;

const multipleSlash = /\/+/g;
const trailingSlash = /(?<=[^])\/$/;
const captureGroup = /\/:([^/]+)/g;
const segmentCounter = /\/[^/]+/g;

export class Router {
    private routes: Route<string>[] = [];

    private sanitize(path: string) {
        return new URL('http://localhost/' + path)
            .pathname
            .replace(multipleSlash, '/')
            .replace(trailingSlash, '');
    }

    add<P extends string>(path: P, fn: Callback<P>, partialMatch = false) {
        const name = this.sanitize(path);
        const trailer = partialMatch ? '' : '$';
        const nameWithGroups = name.replaceAll(captureGroup, '/(?<$1>[^/]+)');
        const matcher = new RegExp(`^${nameWithGroups}${trailer}`);
        const specificity = {
            segments: name.matchAll(segmentCounter).toArray().length,
            captures: name.matchAll(captureGroup).toArray().length,
            partiallyMatches: partialMatch ? 1 : 0,
        } as RouteSpecificity;

        this.routes.push({
            name,
            matcher,
            specificity,
            fn,
        } as unknown as Route<string>);
        return this;
    }

    async route(path: string): Promise<Response | undefined> {
        const name = this.sanitize(path);
        const route = this.routes
            .filter((v) => {
                return v.matcher.test(name);
            })
            .sort((a, b) => compareSpecificity(a.specificity, b.specificity))[0];

        if (route) {
            const groups = name.match(route.matcher)?.groups;
            return await route.fn(groups ?? {}, path);
        }
    }
}

type Split<S extends string, D extends string> = string extends S ? string[]
    : S extends '' ? []
    : S extends `${infer T}${D}${infer U}` ? [T, ...Split<U, D>]
    : [S];

type UrlParts<T extends string> = Split<T, '/'>;
type Variables<Parts extends readonly (string | never)[]> = {
    [K in keyof Parts]: Parts[K] extends `:${infer V}` ? V : never;
};

type StringRecord<T extends readonly string[]> = { [K in number as T[K] extends undefined ? never : T[K]]: string };
type PathVariables<T extends string> = StringRecord<Variables<UrlParts<T>>>;

export class FileHandler {
    public readonly router = new Router();
    public readonly waitForRoute: Promise<void>;
    private readonly resolve: () => void;
    private hasRunOnce = false;

    constructor() {
        const { promise, resolve } = Promise.withResolvers<void>();
        this.waitForRoute = promise;
        this.resolve = resolve;
    }

    private async responseToHttpMessage(response: Response): Promise<string> {
        const { status, statusText, headers } = response;
        const header = [...headers.entries()].map(([key, value]) => `${key}: ${value}`).join('\r\n');
        const text = await response.text();
        return `HTTP/1.1 ${status} ${statusText}\r\n${header}\r\n\r\n${text}`;
    }

    public readonly handler = async (url: URL): Promise<string | Uint8Array> => {
        const path = url.pathname;
        const response = await this.router.route(path);
        if (response) {
            return this.responseToHttpMessage(response);
        } else {
            return this.responseToHttpMessage(await fetch(url));
        }
    };

    public async readFileToResponse(path: string): Promise<Response | undefined> {
        try {
            const fileContent = await Deno.readFile(path);
            return new Response(fileContent, {
                headers: new Headers({
                    // TODO: infer mime type
                    'Content-Type': 'text/plain',
                }),
            });
        } catch {
            console.error(`No such file: ${path}`);
            return undefined;
        }
    }
}
