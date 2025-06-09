import { WebUI } from 'https://deno.land/x/webui@2.5.3/mod.ts';
import UISnippets from '@app/UISnippets/dir.ts';
import { ProviderManager } from '@app/ProviderManager.ts';
import { DemoProvider } from '@app/chat_providers/Demo.ts';
import { ConfigurationBuilder } from '@app/ConfigurationBuilder.ts';
import { MessageServer } from '../MessageServer.ts';

let mainWindowHtml = await (await UISnippets.load('index.html')).text();
const mainWindowCss = await (await UISnippets.load('index.css')).text();
const builderScript = await (await UISnippets.load('config-custom-elements.html')).text();

mainWindowHtml = mainWindowHtml.replace(/\s*css-builtin {.*?}/, mainWindowCss);
mainWindowHtml = mainWindowHtml.replace(/<script-config-builder \/>/, builderScript);

const mainWindow = new WebUI();

// TODO: add configuration for the message server port.
const server = new MessageServer(12000);

const manager = new ProviderManager();
await manager.init();

const demoprov = new DemoProvider();
const democonfig = new ConfigurationBuilder();

manager.register(demoprov);

await manager.activate('demo');
demoprov.configure(democonfig);
mainWindowHtml = mainWindowHtml.replace('<config />', democonfig.render());
democonfig.bind(mainWindow);

// incredibly hacky temporary script insert.
const [pre, post] = mainWindowHtml.split(`<script src="webui.js"></script>`);
mainWindowHtml = [
    pre,
    `<script src="webui.js"></script>`,
    `<script defer>
        (async () => {
            await new Promise(async res => {
                while (!(globalThis.webui?.isConnected())) {
                    await new Promise(sleep => setTimeout(sleep, 100));
                }

                res();
            });

            const socket = new WebSocket("ws://localhost:12000");
        
            socket.addEventListener("open", () => {
                console.log("WebSocket connected.");
            });
            
            socket.addEventListener("close", () => {
                console.warn("Disconnected from message server.");
            });
        
            socket.addEventListener("error", console.error);

            socket.addEventListener("message", event => {
                const message = JSON.parse(event.data);

                const container = document.querySelector("#message-container");
                if (message.messageType === 'text') {
                    container.innerHTML +=\`<donation-text-message 
                        author="\${message.author}"
                        currency="\${message.donationCurrency.code}" 
                        amount="\${message.donationAmount}"
                    >
                        \${message.message}
                    </donation-text-message>\`;
                } else {
                    container.innerHTML += \`<donation-image-message
                        author="\${message.author}"
                        currency="\${message.donationCurrency.code}"
                        amount="\${message.donationAmount}"
                        image="\${message.image}
                    ></donation-image-message>\`;
                }
            });
        })();
    </script>`,
    post,
].join('');

mainWindow.setSize(800, 400);
await mainWindow.show(mainWindowHtml);

await server.ready;

for await (const message of manager.readAll()) {
    if (!mainWindow.isShown) break;

    let payload: object;
    if (message.messageType === 'image') {
        payload = {
            ...message,
            image: message.message.asBase64Uri(),
        };
    } else {
        payload = message;
    }

    server.broadcast(payload);
}

await WebUI.wait();
