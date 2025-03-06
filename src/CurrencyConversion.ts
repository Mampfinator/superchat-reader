import * as path from '@std/path';
import { code, codes } from 'currency-codes';
import type { CurrencyCodeRecord } from 'currency-codes';
import { default as CurrencySymbolMap } from '@app/CurrencyMap.json' with { type: 'json' };

type Rates = Partial<Record<string, number>>;
export type CurrencyAPIResponse = {
    result: string;
    provider: string;
    documentation: string;
    terms_of_use: string;
    time_last_update_unix: number;
    time_last_update_utc: string;
    time_next_update_unix: number;
    time_next_update_utc: string;
    time_eol_unix: number;
    base_code: string;
    rates: Rates;
};

let ccCache: CurrencyAPIResponse;
export const CC_CACHE_FILEPATH = path.join(Deno.cwd(), 'filecache', 'currency_cache.json');
const ccApi = 'https://open.er-api.com/v6/latest/USD';
// TODO: This needs to be attributed per TOS <a href="https://www.exchangerate-api.com">Rates By Exchange Rate API</a>
// The attribution is present in the console, but will need to be present in the GUI once present as well.

/**
 * Checks if the currency conversion cache is loaded into memory.
 * @returns true if cache is loaded
 */
export function isLoaded() {
    return !!ccCache;
}

/** Checks if the cache file is present and parseable. */
async function isAvailable(): Promise<boolean> {
    try {
        JSON.parse(await Deno.readTextFile(CC_CACHE_FILEPATH));
        return true;
    } catch {
        return false;
    }
}

function throwIfNotLoaded() {
    if (!isLoaded()) throw new Deno.errors.BadResource('Currency Cache was never loaded.');
}

/** Checks if the cache is out of date. */
function isOutOfDate(): boolean {
    throwIfNotLoaded();
    return new Date() > new Date(ccCache.time_next_update_utc);
}

/**
 * Update the currency cache json from Exchange Rate API.
 * Not used by the end-user, they should use loadCCCache instead. */
async function updateCache() {
    await Deno.mkdir(path.dirname(CC_CACHE_FILEPATH), { recursive: true });
    const resp = await fetch(ccApi);
    if (resp.status == 429) {
        console.error('Too many requests to conversion API. Wait 20 minutes and try again.');
        throw new Deno.errors.ConnectionRefused('Too many requests to currency conversion API (how?)');
    }
    if (resp.status != 200) {
        throw new Deno.errors.NotFound('Could not connect to currency conversion API');
    }

    using file = await Deno.open(CC_CACHE_FILEPATH, {
        create: true,
        write: true,
    });
    await resp.body!.pipeTo(file.writable);
}

/**
 * Loads the currency conversion cache from disk if available. If not, loads it from the API.
 * If the cache is out of date, updates it.
 * @param [forceRefresh=false] Force a reload from disk, even if cache is already loaded
 */
export async function loadCCCache(forceRefresh = false) {
    // If not loaded, load cache. If not already saved to disk, update the cache (save for the first time)
    if (!isLoaded() || forceRefresh) {
        if (!await isAvailable()) await updateCache();
        console.log('Rates By Exchange Rate API: https://www.exchangerate-api.com');
        ccCache = JSON.parse(await Deno.readTextFile(CC_CACHE_FILEPATH));
    }
    console.log('Next cache update due at: ' + new Date(ccCache.time_next_update_utc));
    // Return early if not out of date
    if (!isOutOfDate()) return;
    // otherwise update the cache and reload it
    console.log('CC Cache out of date, reloading.');
    await updateCache();
    ccCache = JSON.parse(await Deno.readTextFile(CC_CACHE_FILEPATH));
}

/**
 * Convert input currency amount from one currency to another.
 * @param amount Source currency amount
 * @param from Source currency CodeRecord
 * @param to Destination currency CodeRecord (default USD)
 * @returns The converted amount
 */
export function convertCurrency(
    amount: number,
    from?: CurrencyCodeRecord,
    to: CurrencyCodeRecord = code('USD')!,
): number {
    throwIfNotLoaded();
    if (!from || !to) {
        throw new Deno.errors.InvalidData('Currency Code must be valid, not undefined');
    }

    const factor = 10 ** to.digits;

    const toUSD = ccCache.rates[from.code];
    const fromUSD = ccCache.rates[to.code];
    // Double check that we got the rates. Both use ISO 4217 so we should be fine, but it might happen.
    if (!toUSD || !fromUSD) {
        throw new Deno.errors.InvalidData(`Either From [${from.code}] or To [${to.code}] currency is invalid in cache`);
    }

    // Conversion works by converting to USD and then to the target currency, since the cache is in terms of ratios to
    // USD (to avoid pulling a bunch of hits against the API)
    amount /= toUSD;
    amount *= fromUSD;
    // use Math.floor because conversions are gonna take money, not give extra
    amount = Math.floor(amount * factor) / factor;
    return amount;
}

/** Get the list of codes that are both valid ISO 4217 AND our conversion API knows about. */
export function getValidCodes() {
    throwIfNotLoaded();
    const theirCodes = new Set(codes());
    const ourCodes = new Set(Object.keys(ccCache.rates));
    return theirCodes.intersection(ourCodes);
}

const replaceRegex = /\s*[\d.,]+\s*/;
const iso4217 = /[a-zA-Z]{3}/;
/**
 * Extract the 3-letter ISO 4217 code that matches an input string.
 * @param str input string, such as "$1000" or "CAD 1000"
 * @returns a 3-letter ISO 4217 code, or a blank string if invalid
 */
export function getCurrencyCodeFromString(str: string) {
    const currencySymbol = str.replace(replaceRegex, '') as keyof typeof CurrencySymbolMap;

    if (iso4217.test(currencySymbol)) {
        return code(currencySymbol.toUpperCase());
    }
    return code(CurrencySymbolMap[currencySymbol]?.toUpperCase() ?? '');
}
