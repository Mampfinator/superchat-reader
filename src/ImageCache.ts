import * as path from '@std/path';
import { crypto } from '@std/crypto';
import { expandGlob } from '@std/fs';

export class LocallyCachedImage {
    /** Local file name. Most likely hash of the file contents, SHA-1 */
    localFileName = 'DEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEF.png';
    static readonly cacheLocation = path.join(Deno.cwd(), 'filecache');

    /** Save a remote file to the local disk and return the local cache information */
    static async saveNew(img: Response): Promise<LocallyCachedImage> {
        if (!img.ok) {
            throw new Error('Server returned error: ' + img.status);
        }

        const localcache = new LocallyCachedImage();
        const [type, subtype] = img.headers.get('content-type')!.split('/');

        if (type != 'image') {
            throw new Deno.errors.InvalidData('File is not an image! Refusing to download');
        }
        await Deno.mkdir(this.cacheLocation, { recursive: true });

        const [hashStream, saveStream] = img.body!.tee();

        const digestStr = Array.from(
            new Uint8Array(await crypto.subtle.digest('SHA-1', hashStream)),
        ).map((byte) => ('0' + byte.toString(16)).slice(-2))
            .join('')
            .toUpperCase();

        const cachefileName = path.join(this.cacheLocation, `${digestStr}.${subtype}`);
        localcache.localFileName = cachefileName;

        let tempfile;
        try {
            tempfile = await Deno.open(cachefileName, {
                write: true,
                read: true,
                create: true,
                createNew: true,
            });
        } catch {
            // File already exists, don't write to it.
            return LocallyCachedImage.hydrate(digestStr);
        }

        await saveStream.pipeTo(tempfile.writable);

        localcache.localFileName = cachefileName;
        //throw new Error("Not yet implented");
        return localcache;
    }

    static async hydrate(hash: string): Promise<LocallyCachedImage> {
        const cachedImage = new LocallyCachedImage();
        const cacheFileGlob = path.join(this.cacheLocation, hash) + '*';
        const matches = await Array.fromAsync(expandGlob(cacheFileGlob));
        if (matches.length == 0) {
            throw new Deno.errors.NotFound('Could not rehydrate from local cache ' + hash);
        }
        cachedImage.localFileName = matches[0].path;

        return cachedImage;
    }

    /**
     * @returns the contents of the file as a Base64 `data:` URI.
     */
    public async asBase64Uri(): Promise<string> {
        const content = await Deno.readFile(this.localFileName);
        const decoder = new TextDecoder('utf-8');
        return `data:image/${this.localFileName.split('.').at(-1)};base64,${btoa(decoder.decode(content))}`;
    }
}

if (import.meta.main) {
    const saveNewTests = [
        'https://httpbin.org/image/png', // various types of image
        'https://httpbin.org/image/jpeg', // various types of image
        'https://httpbin.org/image/svg', // various types of image
        'https://httpbin.org/image/webp', // various types of image
        'https://httpbin.org', // Not an image
        'https://httpbin.org/status/404', // Not a 200 OK response
    ];
    const hydrateTests: string[] = [
        'DEADBEFF',
    ];

    for (const url of saveNewTests) {
        try {
            const lci = await LocallyCachedImage.saveNew(await fetch(url));
            hydrateTests.push(path.basename(lci.localFileName));
            console.log(lci);
        } catch (e) {
            console.log((e as Error).message);
        }
    }

    for (const filename of hydrateTests) {
        try {
            const lci = await LocallyCachedImage.hydrate(filename);
            console.log(lci);
            await Deno.remove(lci.localFileName);
        } catch (e) {
            console.log((e as Error).message);
        }
    }
}
