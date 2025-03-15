import { CurrencyCodeRecord } from 'currency-codes';
import { ConfigurationBuilder, ElementDescriptor, renderElementDescriptor } from '@app/ConfigurationBuilder.ts';
import { LocallyCachedImage } from '@app/ImageCache.ts';

export interface DonationProvider {
    readonly id: string;
    readonly name: string;
    readonly version: string;
    /** Activate the provider. Return value indicates success. */
    activate(): Promise<boolean>;
    /** Deactivate the provider. Return value indicates success. */
    deactivate(): Promise<boolean>;
    /**
     * Wait for new messages from the provider. Implemented via an ansynchronus generator style.
     */
    process(): AsyncGenerator<DonationMessage>;
    configure(cb: ConfigurationBuilder): void;
}

export type MessageType = 'text' | 'image';

type DonationMessageBase = {
    donationAmount: number;
    donationCurrency: CurrencyCodeRecord;
    donationClass: DonationClass;
    author: string; // Visible username
    authorID?: string; // If provided by platform
    authorAvatar?: LocallyCachedImage; // reference to on-disk cache instead of storing multiple times
};

interface DonationTextMessage extends DonationMessageBase {
    messageType: 'text';
    message: string;
}

interface DonationImageMessage extends DonationMessageBase {
    messageType: 'image';
    message: LocallyCachedImage;
}

export type DonationMessage = DonationTextMessage | DonationImageMessage;

export async function renderDonationMessage(message: DonationMessage): Promise<string> {
    let element: ElementDescriptor;
    const commonAttributes = {
        author: message.author,
        currency: message.donationCurrency.code,
        amount: message.donationAmount,
        donationClass: message.donationClass,
    } as Record<string, string | number>;

    if (message.authorAvatar) {
        commonAttributes.avatarUri = await message.authorAvatar.asBase64Uri();
    }

    if (message.messageType === 'text') {
        element = {
            tagName: 'donation-text-message',
            attr: {
                ...commonAttributes,
            },
            content: message.message,
        };
    } else {
        element = {
            tagName: 'donation-image-message',
            attr: {
                ...commonAttributes,
                image: await message.message.asBase64Uri(),
            },
        };
    }

    return renderElementDescriptor(element);
}

export enum DonationClass {
    Blue = 'Blue',
    LightBlue = 'LightBlue',
    Green = 'Green',
    Yellow = 'Yellow',
    Orange = 'Orange',
    Magenta = 'Magenta',
    Red = 'Red',
}
