import { DemoProvider } from '@/chat_providers/Demo.ts';
import { YouTubeDonationProvider } from '@/chat_providers/YouTube.ts';
import { ProviderManager } from '@/ProviderManager.ts';
import { loadCCCache } from '@/CurrencyConversion.ts';

await loadCCCache();

const manager = new ProviderManager();

await manager.init();

const isProduction = Deno.env.get("NODE_ENV") === "production";

if (!isProduction) {
    manager.register(new DemoProvider());
} else {
    manager.register(new YouTubeDonationProvider());
}

await manager.activateAll();


const cap = Math.ceil(Math.random() * 50);

console.log(`Printing ${cap} total debug messages.`);

console.log("---------------- DEBUG MESSAGES ----------------");

let i = 0;
for await (const message of manager.readAll()) {
    if (i++ > cap) break;
    if (message.messageType !== "text") continue;
    console.log(`${message.author}: ${message.message}`);
}