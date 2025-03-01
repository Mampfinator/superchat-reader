import { ConfigurationBuilder } from '@app/ConfigurationBuilder.ts';
import { DonationClass, DonationMessage, DonationProvider } from '@app/DonationProvider.ts';
import { SAVE_PATH, SavedConfig } from '@app/SavedConfig.ts';
import { sleep } from '@app/util.ts';
import generateWords from '@biegomar/lorem';
import { code } from 'currency-codes';

export class DemoProvider implements DonationProvider {
    readonly id = 'demo';
    readonly name = 'Demo Provider';
    readonly version = '1.0';

    messages: DonationMessage[] = [];
    active = false;
    immediateMessage = false;

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
            let sleptfor = 0
            // Keep looping until: immediate message requested OR
            // constant stream is enabled and we've slept long enough
            while (!this.immediateMessage &&  (!this.config.constantStream || sleptfor < this.config.delay)) {
                await sleep(250);
                sleptfor += 250
            }
            if (!this.active) {
                return;
            }
            this.immediateMessage = false
            const message: DonationMessage = {
                author: this.config.demoUsername,
                message: generateWords(
                    this.config.minWords + Math.floor(Math.random() * (this.config.maxWords - this.config.minWords)),
                ),
                donationClass: DonationClass.Blue,
                donationCurrency: code('USD')!, // USD currency exists, this will never be undefined
                donationAmount: 0,
                messageType: 'text',
            };

            // Generate a random amount and truncate it to the correct digit count
            message.donationAmount = Math.random() * 100 *
                10 ** message.donationCurrency.digits;
            message.donationAmount = Math.floor(message.donationAmount);
            message.donationAmount /= 10 ** message.donationCurrency.digits;

            yield message;
        }
    }

    configure(cb: ConfigurationBuilder): void {
        cb.addCheckbox(
            "Enabled",
            {
                startValue: this.active,
                callback: async (state) => {
                    if (state && !this.active) {
                        await this.activate()
                    } else if (!state && this.active) {
                        await this.deactivate()
                    } else {
                        console.warn(`Provider in weird state. check: ${state} state: ${this.active}`)
                    }
                }
            }
        ).addTextBox(
            "Username",
            {
                startValue: this.config.demoUsername,
                callback: (newVal) => {
                    this.config.demoUsername = newVal
                }
            }
        ).addTextBox (
            "Minimum Words",
            {
                startValue: String(this.config.minWords),
                callback: (newVal) => {
                    const newMin = Number(newVal)
                    if (!Number.isNaN(newMin) && newMin < this.config.maxWords && newMin > 0) {
                        this.config.minWords = newMin
                    }
                }
            }
        ).addTextBox (
            "Maximum Words",
            {
                startValue: String(this.config.maxWords),
                callback: (newVal) => {
                    const newMax = Number(newVal)
                    if (!Number.isNaN(newMax) && newMax > this.config.minWords && newMax < 100) {
                        this.config.maxWords = newMax
                    }
                }
            }
        ).addCheckbox(
            "Constant messages",
            {
                startValue: this.config.constantStream,
                callback: (state) => {
                    this.config.constantStream = state
                }
            }
        ).addSlider(
            "Message Delay (ms)",
            {
                range: [250, 10_000],
                step: 250,
                startValue: this.config.delay,
                callback: (newVal) => {
                    this.config.delay = newVal
                }
            }
        ).addButton(
            "Send message",
            {
                callback: () => {
                    this.immediateMessage = true
                }
            }
        )
    }
}

class DemoConfig extends SavedConfig {
    [SAVE_PATH] = 'demo.json';
    demoUsername = 'Demo User';
    minWords = 5;
    maxWords = 25;
    delay = 1000;
    constantStream = false;

    override validate() {
        if (this.minWords >= this.maxWords) {
            throw new Error(this.constructor.name + ': minWords must be < maxword');
        }
        if (this.delay < 100) {
            throw new Error(this.constructor.name + ': Delay < 100ms is too fast. Refusing.');
        }
    }
}
