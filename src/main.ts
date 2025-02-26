import { DemoProvider } from '@app/chat_providers/Demo.ts';
import { YouTubeDonationProvider } from '@app/chat_providers/YouTube.ts';
import { ProviderManager } from '@app/ProviderManager.ts';
import { loadCCCache } from '@app/CurrencyConversion.ts';
import { getProgramConfig } from '@app/MainConfig.ts';

await loadCCCache();

const manager = new ProviderManager();
const config = await getProgramConfig()

await manager.init();

if (config.debug) {
    manager.register(new DemoProvider());
} else {
    manager.register(new YouTubeDonationProvider());
}

await manager.activateAll();

const messageCap = 10;

console.log(`Printing ${messageCap} total debug messages.`);

console.log('---------------- DEBUG MESSAGES ----------------');

let i = 0;
for await (const message of manager.readAll()) {
    if (i++ > messageCap) break;
    if (message.messageType !== 'text') continue;
    console.log(
        `${message.author} (${message.donationCurrency.code} ${
            message.donationAmount.toFixed(message.donationCurrency.digits)
        } | ${message.donationClass}): ${message.message}`,
    );
}

console.log('Program complete');
