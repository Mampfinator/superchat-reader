import * as CCC from '@app/CurrencyConversion.ts';
import { assert, assertEquals, assertGreater, assertRejects, assertThrows } from '@std/assert';
import { code, codes } from 'currency-codes';
import { FakeTime } from '@std/testing/time';
const TEST_PREFIX = 'CCC: ';

Deno.test(TEST_PREFIX + 'Fail to operate when not loaded', () => {
    assertThrows(() => CCC.convertCurrency(1, code('JPY')));
});

Deno.test({
    name: TEST_PREFIX + 'load cache',
    fn: async (context) => {
        // Setup
        try {
            Deno.removeSync(CCC.CC_CACHE_FILEPATH);
        } catch {
            // this is setup, erroring out is fine (desired state is file missing)
        }
        // Make sure file is actually gone
        assertThrows(() => Deno.lstatSync(CCC.CC_CACHE_FILEPATH));
        const nativeFetch = fetch;
        let trueResponse: Response | null = null;
        let spoofResponseCode = 0;

        // Shim fetch with our own that returns fake failures
        globalThis['fetch'] = async (input: URL | RequestInfo, init?: RequestInit & { client?: Deno.HttpClient }) => {
            if (!trueResponse) {
                trueResponse = await nativeFetch(input, init);
                if (trueResponse.status != 200) {
                    throw new Error(`Actual API returned a non-OK code: ${trueResponse.statusText}`);
                }
            }
            if (spoofResponseCode != 0) {
                return new Response(trueResponse.body, { status: spoofResponseCode });
            } else {
                return trueResponse;
            }
        };

        spoofResponseCode = 429; // Too many requests
        await context.step({
            name: 'API failure: too many requests',
            fn: async () => {
                await assertRejects(CCC.loadCCCache);
            },
        });

        spoofResponseCode = 418; // I'm a teapot
        await context.step({
            name: 'API failure: General',
            fn: async () => {
                await assertRejects(CCC.loadCCCache);
            },
        });

        spoofResponseCode = 0; // Restore to zero if otherwise set
        await context.step({
            name: 'Cache downloads correctly',
            fn: () => {
                CCC.loadCCCache();
                Deno.lstatSync(CCC.CC_CACHE_FILEPATH);
            },
        });

        const faketime = new FakeTime('4000-01-01');
        await context.step({
            name: 'Cache is out of date',
            fn: () => CCC.loadCCCache(),
        });
        faketime.restore();

        // This forces a reload from disk, which at this point will be the same as a normal reload
        await context.step({
            name: 'Normal loading',
            fn: () => {
                CCC.loadCCCache(true);
                assert(CCC.isLoaded());
            },
        });

        // Reset fetch to default
        globalThis['fetch'] = nativeFetch;
        console.log('fetch reset to default');
        trueResponse!.body?.cancel();
    },
    ignore: !Deno.env.has('REMOVE_CACHE') && false,
});

Deno.test(TEST_PREFIX + 'Intersection of npm:currency-codes and api codes', () => {
    const codes1 = new Set(codes());
    const codes2 = new Set(Object.keys(JSON.parse(Deno.readTextFileSync(CCC.CC_CACHE_FILEPATH)).rates));
    const intersection = CCC.getValidCodes();
    const iso4217 = /[a-zA-Z]{3}/;

    // Tests: intersection is smaller in both cases, and all the codes are three letters
    assertGreater(codes1.size, intersection.size);
    assertGreater(codes2.size, intersection.size);
    for (const code of intersection) {
        assert(iso4217.test(code), `Unexpected code: ${code}`);
    }
});

Deno.test(TEST_PREFIX + 'Conversion, big number to small: JPY -> USD', async () => {
    if (!CCC.isLoaded()) {
        await CCC.loadCCCache();
    }
    const startAmount = 100;
    const finalAmount = CCC.convertCurrency(startAmount, code('JPY'), code('USD'));
    assertGreater(startAmount, finalAmount);
});

Deno.test(TEST_PREFIX + 'Conversion, small number to big: USD -> SEK', async () => {
    if (!CCC.isLoaded()) {
        await CCC.loadCCCache();
    }
    const startAmount = 1;
    const finalAmount = CCC.convertCurrency(startAmount, code('USD'), code('SEK'));
    assertGreater(finalAmount, startAmount);
});

Deno.test(TEST_PREFIX + 'Fail to convert if code is wrong', () => {
    const codes1 = new Set(codes());
    const codes2 = new Set(Object.keys(JSON.parse(Deno.readTextFileSync(CCC.CC_CACHE_FILEPATH)).rates));
    const invalidCode = [...(codes1.difference(codes2))][0];
    assertThrows(() => CCC.convertCurrency(1, code(invalidCode)));
    assertThrows(() => CCC.convertCurrency(1, undefined));
});

Deno.test(TEST_PREFIX + 'ISO-4217 Abbrev extraction', () => {
    assertEquals(CCC.getCurrencyCodeFromString('CA$1')?.code, 'CAD');
    assertEquals(CCC.getCurrencyCodeFromString('$1')?.code, 'USD');
    assertEquals(CCC.getCurrencyCodeFromString('A$1')?.code, 'AUD');
    assertEquals(CCC.getCurrencyCodeFromString('PhP1')?.code, 'PHP');
    assertEquals(CCC.getCurrencyCodeFromString('¥ 10000')?.code, 'JPY');
    assertEquals(CCC.getCurrencyCodeFromString('10000 ¥')?.code, 'JPY');
    assertEquals(CCC.getCurrencyCodeFromString('10000')?.code, undefined);
});

if (import.meta.main) {
    await CCC.loadCCCache();
    const php = CCC.convertCurrency(1, code('USD'), code('PHP'));
    const usdToArs = CCC.convertCurrency(1, code('USD'), code('ARS'));
    const phpToYen = CCC.convertCurrency(100, code('PHP'), code('JPY'));
    const yenToUsd = CCC.convertCurrency(100, code('JPY'));
    console.log(`  1 USD is ${php} PHP`);
    console.log(`  1 USD is ${usdToArs} ARS`);
    console.log(`100 PHP is ${phpToYen} JPY`);
    console.log(`100 JPY is ${yenToUsd} USD`);
}
