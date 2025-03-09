import { DemoProvider } from '@app/chat_providers/Demo.ts';
import { YouTubeDonationProvider } from '@app/chat_providers/youtube/YouTubeProvider.ts';
import { ProviderManager } from '@app/ProviderManager.ts';
import { loadCCCache } from '@app/CurrencyConversion.ts';

await loadCCCache();

const manager = new ProviderManager();

await manager.init();

const isProduction = true;

if (!isProduction) {
    manager.register(new DemoProvider());
} else {
    manager.register(new YouTubeDonationProvider());
}

await manager.activateAll();

const messageCap = 4;

console.log(`Printing ${messageCap} total debug messages.`);

console.log('---------------- DEBUG MESSAGES ----------------');

let i = 0;
for await (const message of manager.readAll()) {
    if (i++ > messageCap) break;
    if (message.messageType !== 'text') continue;
    console.log(`${message.author}: ${message.message}`);
}
