import { SAVE_PATH, SavedConfig } from '@app/SavedConfig.ts';

let programConfig: ProgramConfig | undefined;

export async function getProgramConfig(forceReload = false) {
    if (!programConfig || forceReload) {
        programConfig = await SavedConfig.getOrCreate(ProgramConfig);
    }
    return programConfig;
}

enum LogLevel {
    ERROR = 'error',
    WARN = 'warn',
    INFO = 'info',
    ALL = 'all',
}

const MIN_WIDTH = Symbol('MIN WIDTH');
const MIN_HEIGHT = Symbol('MIN HEIGHT');
class ProgramConfig extends SavedConfig {
    [SAVE_PATH] = 'mainConfig.json';
    readonly [MIN_HEIGHT] = 400;
    readonly [MIN_WIDTH] = 600;
    debug = false;
    logLevel = LogLevel.INFO;
    public readonly enabledProviders: Record<string, boolean> = {};
    sizeWidth = 800;
    sizeHeight = 400;

    override validate(): void {
        // Non-critical validation failures
        if (this.sizeWidth < this[MIN_WIDTH]) {
            this.sizeWidth = this[MIN_WIDTH];
        }
        if (this.sizeHeight < this[MIN_HEIGHT]) {
            this.sizeHeight = this[MIN_HEIGHT];
        }

        // Critical validation failures
        if (!Object.values(LogLevel).includes(this.logLevel.toLowerCase() as LogLevel)) {
            const options = Object.values(LogLevel).join(', ');
            throw new Error(`Program Config invalid: logLevel must be one of [${options}]`);
        }
    }

    /** Returns non-configurable minimums.*/
    getMinimumWindowSize(): [width: number, height: number] {
        return [this[MIN_WIDTH], this[MIN_HEIGHT]];
    }
}
export type ProgramConfigInterface = ProgramConfig;
