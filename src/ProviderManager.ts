import { DonationMessage, DonationProvider } from '@app/DonationProvider.ts';
import { Combine } from '@app/util.ts';
import { getProgramConfig, ProgramConfigInterface } from '@app/MainConfig.ts';

/**
 * Indicates that a requested provider was not registered.
 */
export class ProviderNotFound extends Error {
    constructor(id: string) {
        super(`Provider with ID ${id} not found.`);
    }
}

/**
 * Central point for managing all chat providers.
 */
export class ProviderManager {
    private readonly providers = new Map<string, DonationProvider>();
    private config!: ProgramConfigInterface;
    private combine = new Combine<DonationMessage>();

    public async init() {
        this.config = await getProgramConfig();
    }

    public register(
        provider: DonationProvider,
    ) {
        if (this.providers.has(provider.id)) {
            throw new Error(`Provider ${provider.name} (${provider.id}) already registered.`);
        }
        // if we find a new provider, assume we want it enabled by default.
        if (!this.config.enabledProviders[provider.id]) this.config.enabledProviders[provider.id] = true;
        this.providers.set(provider.id, provider);
    }

    /**
     * Activate the provider with the given ID.
     * @param id provider to activate
     * @returns true if activation was successful, false otherwise
     * @throws {ProviderNotFound} If the provider with the given ID does not exist.
     */
    public async activate(id: string): Promise<boolean> {
        const provider = this.providers.get(id);
        if (!provider) {
            throw new ProviderNotFound(id);
        }

        const success = await provider.activate();
        if (success) {
            this.combine.add(id, provider.process());
        }
        return success;
    }

    /**
     * Activate all providers that should be active according to the config.
     */
    public async activateAll() {
        for (const provider of this.getActiveProviderIds()) {
            try {
                const success = await this.activate(provider);
                if (!success) {
                    console.error(`Failed to activate provider ${provider}.`);
                }
            } catch (error) {
                if (!(error instanceof ProviderNotFound)) {
                    throw error;
                }

                console.warn(`Provider with ID ${provider} not found. Skipping.`);
            }
        }
    }

    /**
     * Deactivate the provider with the given ID.
     * @param id provider to deactivate
     * @returns true if deactivation was successful, false otherwise
     * @throws {ProviderNotFound} If the provider with the given ID does not exist.
     */
    public async deactivate(id: string): Promise<boolean> {
        const provider = this.providers.get(id);
        if (!provider) {
            throw new ProviderNotFound(id);
        }
        this.config.enabledProviders[id] = false;
        this.combine.remove(id);
        return await provider.deactivate();
    }

    /**
     * Deactivate all currently active providers.
     */
    public async deactivateAll() {
        for (const provider of this.getActiveProviderIds()) {
            try {
                const success = await this.deactivate(provider);
                if (!success) {
                    console.error(`Failed to deactivate provider ${provider}.`);
                }
            } catch (error) {
                if (!(error instanceof ProviderNotFound)) {
                    throw error;
                }

                console.warn(`Provider with ID ${provider} not found. Skipping.`);
            }
        }
    }

    public getActiveProviderIds(): string[] {
        return Object.entries(this.config.enabledProviders).filter(([_, isActive]) => isActive).map(([id, _]) => id);
    }

    /**
     * Read all donation messages from all active providers. If a provider is activated/deactivated while
     * reading, the stream will be updated automatically.
     */
    public readAll(): Combine<DonationMessage> {
        return this.combine;
    }
}
