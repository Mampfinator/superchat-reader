import { join } from '@std/path';

const SHOULD_SAVE = Symbol('shouldSave');
export const SAVE_PATH = Symbol('savePath');
const HAS_BEEN_PROXIED = Symbol('hasBeenProxied');

/**
 * Base class for all on-disk automatically saving configs.
 *
 * @example
 * ```ts
 * class ExampleConfig extends SavedConfig {
 *      [SAVE_PATH] = "filename.json"
 *      public example = "Hello World!";
 *      public another = 123;
 * }
 *
 * const config = await SavedConfig.load(ExampleConfig);
 *
 * // Setting a property automatically causes a synchronous save.
 * config.example = "Goodbye World!";
 * ```
 */
export abstract class SavedConfig {
    /* Directory on disk where configuration is saved. */
    static configPath = join(Deno.cwd(), 'config');
    /* Internally used to keep track of whether a save/load is currently in progress. */
    private [SHOULD_SAVE] = false;
    /* Filename to save config to. Must be defined in cctor, will throw an error if set afterwards. */
    protected abstract [SAVE_PATH]: string;

    constructor() {
        const replacePropertiesWithProxy = <T>(target: T) => {
            if (!target || (target as { [HAS_BEEN_PROXIED]?: boolean })[HAS_BEEN_PROXIED]) {
                return;
            }
            for (const [key, value] of Object.entries(target as object)) {
                if (typeof value === 'object') {
                    // I can't think of a better way to cast this, so this will have to do.
                    // deno-lint-ignore no-explicit-any
                    (target as any)[key] = new Proxy(value, {
                        set: setCallback,
                    });

                    replacePropertiesWithProxy(value);
                }
            }

            // since this property is *only* used for preventing duplicate work and should only ever be defined,
            // never written to, we completely hide and freeze it.
            Object.defineProperty(target, HAS_BEEN_PROXIED, {
                value: true,
                enumerable: false,
                configurable: false,
                writable: false,
            });
        };

        // deno-lint-ignore no-explicit-any
        const setCallback = <T>(target: T, prop: string | symbol, value: any): boolean => {
            // I'm, honestly not sure why this is needed but I assume it's something to do
            // with child class initializers. Without it, the complicated test case fails,
            // so I'll just leave it in for now - Eats
            replacePropertiesWithProxy(target);

            // Enforce CCTOR-only setting of SAVE_PATH
            if (this[SAVE_PATH] && prop == SAVE_PATH) {
                throw new Error('Setting [SAVE_PATH] not allowed outside of cctor');
            }
            // Symbol keys can't be persisted to disk, and they're used for internal state tracking as well.
            // Set it, but then skip out on saving and validation.
            if (typeof prop === 'symbol') {
                target[prop as keyof typeof target] = value;
                return true;
            }

            // Store the current value.
            const oldvalue = target[prop as keyof typeof target];
            try {
                // Set the value (can't forget to do that)
                if (value && typeof value === 'object') {
                    // The object we're given here was fully instantiated and might itself have object-type properties.
                    // So we look for those and replace them with our setter Proxy.
                    replacePropertiesWithProxy(value);
                    // if the value is an object, we want to trap any sets to it similar to how we trap
                    // sets on the root object.
                    target[prop as keyof typeof target] = new Proxy(value, {
                        set: (target, prop, value) => {
                            return setCallback(target, prop, value);
                        },
                    });
                } else {
                    target[prop as keyof typeof target] = value;
                }

                if (this[SHOULD_SAVE]) {
                    // Only validate if saving is enabled. If saving is disabled, we're probably operating
                    // in internal plumbing and a validation pass will happen afterwards.
                    this.validate();
                }
            } catch (e) {
                // Validation failed. Reset to old value, print the error to the console, and return false
                target[prop as keyof typeof target] = oldvalue;
                console.error((e as Error).message);
                return false;
            }
            if (this[SHOULD_SAVE]) this.save();
            return true;
        };

        return new Proxy(this, {
            set: setCallback,
        });
    }

    /**
     * Save the config to disk at the path specified by `savePath`.
     * This is automatically called every time a property is set.
     */
    public save(): void {
        const savePath = this.getSavePath();

        // ensure config folder exists
        Deno.mkdirSync(SavedConfig.configPath, { recursive: true });
        Deno.writeTextFileSync(savePath, JSON.stringify(this, undefined, 2));
    }

    private getSavePath(): string {
        return join(SavedConfig.configPath, this[SAVE_PATH]);
    }

    /**
     * Load the config from disk, or create a new one if it doesn't exist.
     *
     * Constructing a config class directly without going through `load` will lead to unexpected behaviour.
     * @param savePath Path to load config from
     * @param constructor Config class to construct
     */
    public static async getOrCreate<
        T extends SavedConfig,
        // deno-lint-ignore no-explicit-any
        C extends new (...args: any[]) => T,
        P extends ConstructorParameters<C>,
    >(constructor: C, ...args: P): Promise<InstanceType<C>> {
        // Create a new config object to load onto
        const config = new constructor(...args) as InstanceType<C>;
        // Disable saving while loading the file so we don't overwrite anything.
        config[SHOULD_SAVE] = false;

        let fileContents = '{}';
        try {
            fileContents = await Deno.readTextFile(config.getSavePath());
        } catch {
            // File doesn't exist, create it. Safe to do, will never overwrite user data unless for some reason
            // they're running the script directly with write permissions but not read permissions
            config.save();
        }

        try {
            const json = JSON.parse(fileContents);
            for (const [key, value] of Object.entries(json)) {
                Reflect.set(config as object, key, value);
            }
        } catch (error) {
            // Failed to parse the saved file. Return the default config with saving off.
            // TODO never fix this typo
            // file doesn't exist or old JSON is corruped; we wanna create a new config instead.
            console.warn(`Error loading config for ${constructor.name}: ${error}. Using defaults instead.`);
            return config;
        }

        config.validate();
        // We're done setting up, re-enable saving.
        config[SHOULD_SAVE] = true;
        return config;
    }

    /**
     * Check that the config file is valid. Throw an error if not.
     */
    validate() {
        // Default validate doesn't actually do anything
    }
}
