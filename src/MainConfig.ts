import { SAVE_PATH, SavedConfig } from '@app/SavedConfig.ts';

let programConfig: ProgramConfig | undefined;

export async function getProgramConfig(forceReload = false) {
    if (!programConfig || forceReload) {
        programConfig = await SavedConfig.getOrCreate(ProgramConfig)
    }
    return programConfig
}

enum LogLevel {
    ERROR = "error",
    WARN = "warn",
    INFO = "info",
    ALL = "all",
}

class ProgramConfig extends SavedConfig {
    [SAVE_PATH] = "mainConfig.json"
    debug = false
    logLevel = LogLevel.INFO

    override validate(): void {
        if (!Object.values(LogLevel).includes(this.logLevel.toLowerCase() as LogLevel)) {
            const options = Object.values(LogLevel).join(', ')
            throw new Error(`Program Config invalid: logLevel must be one of [${options}]`)
        }
    }
}