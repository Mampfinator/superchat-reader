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
        trueResponse!.body?.cancel();
    },
    ignore: !Deno.env.has('REMOVE_CACHE'),
});

Deno.test(TEST_PREFIX + 'Intersection of npm:currency-codes and api codes', async () => {
    if (!CCC.isLoaded()) {
        await CCC.loadCCCache();
    }

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

Deno.test(TEST_PREFIX + 'Conversions', async (context) => {
    if (!CCC.isLoaded()) {
        await CCC.loadCCCache();
    }
    // TODO : Mock Deno.readTextFile to poison this with known values instead of relying on whatever the cache says?

    await context.step({
        name: 'Big number to small: JPY -> USD',
        fn: () => {
            const startAmount = 100;
            const finalAmount = CCC.convertCurrency(startAmount, code('JPY'), code('USD'));
            assertGreater(startAmount, finalAmount);
        },
    });

    await context.step({
        name: 'Small number to big: USD -> SEK',
        fn: () => {
            const startAmount = 1;
            const finalAmount = CCC.convertCurrency(startAmount, code('USD'), code('SEK'));
            assertGreater(finalAmount, startAmount);
        },
    });

    await context.step({
        name: 'Fail if code is wrong',
        fn: () => {
            const codes1 = new Set(codes());
            const codes2 = new Set(Object.keys(JSON.parse(Deno.readTextFileSync(CCC.CC_CACHE_FILEPATH)).rates));
            const invalidCode = [...(codes1.difference(codes2))][0];
            assertThrows(() => CCC.convertCurrency(1, code(invalidCode)));
            assertThrows(() => CCC.convertCurrency(1, undefined));
        },
    });

    await context.step({
        name: 'conversion correctly truncated',
        fn: () => {
            // This should always return a conversion that has enough sub-digits to be truncated.
            const amount = CCC.convertCurrency(0.1, code('USD'), code('JPY'));
            assertEquals(amount, Math.floor(amount));
        },
    });
});

Deno.test(TEST_PREFIX + 'ISO-4217 Abbrev extraction', async (context) => {
    await context.step({
        name: 'Normal',
        fn: () => {
            assertEquals(CCC.getCurrencyCodeFromString('CA$1')?.code, 'CAD');
            assertEquals(CCC.getCurrencyCodeFromString('$1')?.code, 'USD');
        },
    });

    await context.step({
        name: 'Incorrect capitalization',
        fn: () => {
            assertEquals(CCC.getCurrencyCodeFromString('PhP1')?.code, 'PHP');
        },
    });

    await context.step({
        name: 'Unusual placement of symbol',
        fn: () => {
            assertEquals(CCC.getCurrencyCodeFromString('¥ 10000')?.code, 'JPY');
            assertEquals(CCC.getCurrencyCodeFromString('10000 ¥')?.code, 'JPY');
        },
    });

    await context.step({
        name: 'Symbol missing',
        fn: () => {
            assertEquals(CCC.getCurrencyCodeFromString('10000')?.code, undefined);
        },
    });
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
