import { WebUI } from 'https://deno.land/x/webui@2.5.3/mod.ts';
import UISnippets from '@app/UISnippets/dir.ts';
import { ProviderManager } from '@app/ProviderManager.ts';
import { DemoProvider } from '@app/chat_providers/Demo.ts';
import { LocallyCachedImage } from '@app/ImageCache.ts';
import { ConfigurationBuilder } from '@app/ConfigurationBuilder.ts';
import { sleep } from '@app/util.ts';

let mainWindowHtml = await (await UISnippets.load('index.html')).text();
const mainWindowCss = await (await UISnippets.load('index.css')).text();
const builderScript = await (await UISnippets.load('config-custom-elements.html')).text();

mainWindowHtml = mainWindowHtml.replace(/\s*css-builtin {.*?}/, mainWindowCss);
mainWindowHtml = mainWindowHtml.replace(/<script-config-builder \/>/, builderScript);

const mainWindow = new WebUI();

const manager = new ProviderManager();
await manager.init();

const demoprov = new DemoProvider();
const democonfig = new ConfigurationBuilder();

manager.register(demoprov);

await manager.activate('demo');
demoprov.configure(democonfig);
mainWindowHtml = mainWindowHtml.replace('<config />', democonfig.render());
democonfig.bind(mainWindow);

mainWindow.setSize(800, 400);
await mainWindow.show(mainWindowHtml);

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
