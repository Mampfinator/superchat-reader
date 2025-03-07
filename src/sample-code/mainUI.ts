import { WebUI } from 'https://deno.land/x/webui@2.5.3/mod.ts';
import { ProviderManager } from '@app/ProviderManager.ts';
import { DemoProvider } from '@app/chat_providers/Demo.ts';
import { LocallyCachedImage } from '@app/ImageCache.ts';
import { ConfigurationBuilder } from '@app/ConfigurationBuilder.ts';
import { sleep } from '@app/util.ts';
import { FileHandler } from '@app/FileHandler.ts';
import { default as embedded } from '@app/UISnippets/dir.ts';

const mainWindow = new WebUI();

const manager = new ProviderManager();
await manager.init();

const demoprov = new DemoProvider();
const democonfig = new ConfigurationBuilder();

manager.register(demoprov);
const fileHandler = new FileHandler();

const SUPPORTED_MIME_TYPES = {
    'html': 'text/html',
    'css': 'text/css',
    'js': 'application/javascript',
} as Record<string, string>;

fileHandler.router
    .add(
        '/image-cache/:file',
        async ({ file }) => {
            const location = LocallyCachedImage.cacheLocation;

            const subtype = file.split('.').pop();
            // we only support caching images (as of now)
            const type = 'image';

            const path = `${location}/${file}`;
            try {
                const fileContent = await Deno.readFile(path);

                return new Response(fileContent, {
                    headers: new Headers({
                        'Content-Type': `${type}/${subtype}`,
                    }),
                });
            } catch {
                console.error(`No such file: ${path}`);
                return new Response('Not found', { status: 404 });
            }
        },
    )
    .add('/', async (_, path) => {
        const file = await embedded.get(path.slice(1));

        if (!file) {
            return new Response('Not found', { status: 404 });
        }

        const mimeType = SUPPORTED_MIME_TYPES[path.split('.').pop()!]!;

        const content = await file.text();
        return new Response(content, {
            headers: new Headers({
                'Content-Type': mimeType,
            }),
        });
    });

mainWindow.setFileHandler(fileHandler.handler);

const cb = new ConfigurationBuilder()
    .addButton('click here to boop', {
        callback: () => {
            console.log('BOOP');
        },
    })
    .addCheckbox('check', {})
    .addSlider('slider', {
        callback: async (value) => {
            await sleep(500);
            console.log('slider value:', value);
        },
    })
    .addParagraph("This is a paragraph. It's a paragraph of text. Very wow.")
    .addTextBox('Type here!', {})
    .addTextBox('Type your number here', { type: 'number' });

cb.bind(mainWindow);

manager.register(new DemoProvider());

await manager.activate('demo');
demoprov.configure(democonfig);
democonfig.bind(mainWindow);

mainWindow.setSize(800, 400);
await mainWindow.show('index.html');

// FIXME: this sleep is ugly, but required - otherwise we get a weird segfault from the script call below.
// There has to be a better way to wait for the main HTML to be ready.
await sleep(1500);

await mainWindow.script(`
    const container = document.querySelector("#plugin-config");
    container.innerHTML += \`${cb.render()}\`
`);

for await (const message of manager.readAll()) {
    if (!mainWindow.isShown) break;
    if (message.messageType === 'text') {
        await mainWindow.script(`
            const container = document.querySelector("#message-container"); 
            container.innerHTML += \`<donation-text-message 
                author="${message.author}" 
                currency="${message.donationCurrency.code}" 
                amount="${message.donationAmount}"
            >
                ${message.message}
            </donation-text-message>\`;
        `);
    } else {
        await mainWindow.script(`
            const container = document.querySelector("#message-container");
            container.innerHTML += \`<donation-image-message
                author="${message.author}"
                currency="${message.donationCurrency.code}"
                amount="${message.donationAmount}"
                image="${await (message.message as LocallyCachedImage).asBase64Uri()}
            ></donation-image-message>\`
        `);
    }
}

await WebUI.wait();
