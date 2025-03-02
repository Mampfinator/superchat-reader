import { ConfigurationBuilder } from '@app/ConfigurationBuilder.ts';
import { DonationClass, DonationMessage, DonationProvider } from '@app/DonationProvider.ts';
import { SAVE_PATH, SavedConfig } from '@app/SavedConfig.ts';
import { sleep } from '@app/util.ts';
import generateWords from '@biegomar/lorem';
import { code, codes } from 'currency-codes';
import { CC_CACHE_FILEPATH, convertCurrency, CurrencyAPIResponse } from '@app/CurrencyConversion.ts';

const DONATION_THRESHOLDS = [
    [0, DonationClass.Blue],
    [2, DonationClass.LightBlue],
    [5, DonationClass.Green],
    [10, DonationClass.Yellow],
    [20, DonationClass.Orange],
    [50, DonationClass.Magenta],
    [100, DonationClass.Red],
] as const;

function getRandomAmount() {
    const tier = Math.floor(Math.random() * DONATION_THRESHOLDS.length);
    const min = DONATION_THRESHOLDS[tier][0];
    const max = DONATION_THRESHOLDS[tier + 1]?.[0] ?? 500;

    return [Math.random() * (max - min) + min, DONATION_THRESHOLDS[tier][1]] as const;
}

export class DemoProvider implements DonationProvider {
    readonly id = 'demo';
    readonly name = 'Demo Provider';
    readonly version = '1.0';

    messages: DonationMessage[] = [];
    active = false;

    config!: DemoConfig;

    async activate() {
        this.config = await SavedConfig.getOrCreate(DemoConfig);
        console.log(
            `Username: ${this.config.demoUsername}\n` +
                `Will generate between ${this.config.minWords} and ${this.config.maxWords} words.`,
        );
        this.active = true;
        console.log('Demo provider activated');
        return Promise.resolve(true);
    }

    deactivate() {
        this.active = false;
        console.log('Demo provider deactivated');
        return Promise.resolve(true);
    }

    async *process() {
        while (this.active) {
            await sleep(this.config.delay);
            if (!this.active) {
                return;
            }

            const currencyCache = JSON.parse(await Deno.readTextFile(CC_CACHE_FILEPATH)) as CurrencyAPIResponse;
            const cacheCodes = new Set(Object.keys(currencyCache.rates));
            const currencyCodes = new Set(codes());
            const validCodes = [...currencyCodes.intersection(cacheCodes)];

            let [donationAmount, donationClass] = getRandomAmount();
            const donationCurrencyCode = validCodes[Math.floor(Math.random() * validCodes.length)]!;
            const donationCurrency = code(donationCurrencyCode)!;
            const fromUsd = convertCurrency(donationAmount, code('USD')!, donationCurrency);

            donationAmount *= fromUsd;
            donationAmount *= 10 ** donationCurrency.digits;
            donationAmount = Math.floor(donationAmount);
            donationAmount /= 10 ** donationCurrency.digits;

            const message: DonationMessage = {
                author: this.config.demoUsername,
                message: generateWords(
                    this.config.minWords + Math.floor(Math.random() * (this.config.maxWords - this.config.minWords)),
                ),
                donationClass,
                donationCurrency,
                donationAmount,
                messageType: 'text',
            };

            yield message;
        }
    }

    configure(cb: ConfigurationBuilder): void {
    }
}

class DemoConfig extends SavedConfig {
    [SAVE_PATH] = 'demo.json';
    demoUsername = 'Demo User';
    minWords = 5;
    maxWords = 25;
    delay = 1000;

    override validate() {
        if (this.minWords >= this.maxWords) {
            throw new Error(this.constructor.name + ': minWords must be < maxword');
        }
        if (this.delay < 100) {
            throw new Error(this.constructor.name + ': Delay < 100ms is too fast. Refusing.');
        }
    }
}
