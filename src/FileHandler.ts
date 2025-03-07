interface Route<P extends string> {
    name: string;
    matcher: RegExp;
    fn: Callback<P>;
    specificity: number;
    groups?: PathVariables<P>;
}

type Awaitable<T> = T | Promise<T>;

type Callback<P extends string> = (variables: PathVariables<P>, path: string) => Awaitable<Response | undefined>;

const multipleSlash = /\/+/g;
const trailingSlash = /(?<=[^])\/$/;
const captureGroup = /\/:([^/]+)/g;

export class Router {
    private routes: Route<string>[] = [];

    private sanitize(path: string) {
        return new URL('http://localhost/' + path)
            .pathname
            .replace(multipleSlash, '/')
            .replace(trailingSlash, '');
    }

    add<P extends string>(path: P, fn: Callback<P>) {
        const name = this.sanitize(path);
        const r = '^' + name
            .replaceAll(captureGroup, '/(?<$1>[^/]+)');
        const specificity = name.matchAll(multipleSlash).toArray().length;

        this.routes.push({
            name,
            matcher: new RegExp(r),
            specificity,
            fn,
        } as unknown as Route<string>);
        return this;
    }

    async route(path: string): Promise<Response | undefined> {
        const name = this.sanitize(path);
        const matchingRoutes = this.routes
            .filter((v) => {
                return v.matcher.test(name);
            })
            .sort((a, b) => b.specificity - a.specificity);

        const route = matchingRoutes[0];
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
