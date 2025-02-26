import * as path from '@std/path';
import { code } from 'currency-codes';
import type { CurrencyCodeRecord } from 'currency-codes';
import { assertEquals, assertGreater } from '@std/assert';
import { default as CurrencySymbolMap } from '@app/CurrencyMap.json' with { type: 'json' };

let ccCache: CurrencyAPIResponse;
export const CC_CACHE_FILEPATH = path.join(Deno.cwd(), 'filecache', 'currency_cache.json');
const ccApi = 'https://open.er-api.com/v6/latest/USD';
// TODO: This needs to be attributed per TOS <a href="https://www.exchangerate-api.com">Rates By Exchange Rate API</a>
// The attribution is present in the console, but will need to be present in the GUI once present as well.

if (import.meta.main) {
    await loadCCCache();
    const php = convertCurrency(1, code('USD'), code('PHP'));
    const usdToArs = convertCurrency(1, code('USD'), code('ARS'));
    const phpToYen = convertCurrency(100, code('PHP'), code('JPY'));
    const yenToUsd = convertCurrency(100, code('JPY'));
    console.log(`  1 USD is ${php} PHP`);
    console.log(`  1 USD is ${usdToArs} ARS`);
    console.log(`100 PHP is ${phpToYen} JPY`);
    console.log(`100 JPY is ${yenToUsd} USD`);
}

/**
 * Loads the currency conversion cache from disk if available. If not, loads it from the API.
 * If the cache is out of date, updates it.
 */
export async function loadCCCache() {
    if (!await isAvailable()) await updateCache();
    console.log('Rates By Exchange Rate API: https://www.exchangerate-api.com');
    ccCache = JSON.parse(await Deno.readTextFile(CC_CACHE_FILEPATH));
    console.log(
        'Next cache update due at: ' +
            new Date(ccCache.time_next_update_utc),
    );
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
    if (!ccCache) {
        throw new Deno.errors.BadResource('Currency cache has not yet been initialized.');
    }
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

/** Checks if the cache is out of date. */
function isOutOfDate(): boolean {
    if (!ccCache) {
        throw new Deno.errors.BadResource('Currency Cache was never loaded.');
    }
    return new Date() > new Date(ccCache.time_next_update_utc);
}

/** Checks if the cache file is present. */
async function isAvailable(): Promise<boolean> {
    try {
        JSON.parse(await Deno.readTextFile(CC_CACHE_FILEPATH));
        return true;
    } catch {
        return false;
    }
}

/** Update the currency cache json from Exchange Rate API  */
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
    file.truncate();
    await resp.body!.pipeTo(file.writable);
}

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

type Rates = Partial<Record<string, number>>;

export function getCurrencyCodeFromString(str: string) {
    const replaceRegex = /\s*[\d.,]+\s*/;
    const iso4217 = /[a-zA-Z]{3}/;
    const currencySymbol = str.replace(replaceRegex, '') as keyof typeof CurrencySymbolMap;

    if (iso4217.test(currencySymbol)) {
        return code(currencySymbol.toUpperCase());
    }
    return code(CurrencySymbolMap[currencySymbol]?.toUpperCase() ?? '');
}

Deno.test('Currency Code Test', () => {
    assertEquals(getCurrencyCodeFromString('CA$1')?.code, 'CAD');
    assertEquals(getCurrencyCodeFromString('$1')?.code, 'USD');
    assertEquals(getCurrencyCodeFromString('A$1')?.code, 'AUD');
    assertEquals(getCurrencyCodeFromString('PhP1')?.code, 'PHP');
    assertEquals(getCurrencyCodeFromString('¥ 10000')?.code, 'JPY');
    assertEquals(getCurrencyCodeFromString('10000 ¥')?.code, 'JPY');
});

Deno.test('Able to load cache', async () => {
    await loadCCCache();
    assertEquals(null != ccCache, true);
});

Deno.test('ARS is weaker than USD', async () => {
    if (!ccCache) {
        await loadCCCache();
    }
    const usdAmount = 1;
    const arsAmount = convertCurrency(usdAmount, code('USD'), code('ARS'));
    assertGreater(arsAmount, usdAmount);
});

Deno.test('USD number is smaller than JPY', async () => {
    if (!ccCache) {
        await loadCCCache();
    }
    const jpyAmount = 100;
    const usdAmount = convertCurrency(jpyAmount, code('JPY'));
    assertGreater(jpyAmount, usdAmount);
});
