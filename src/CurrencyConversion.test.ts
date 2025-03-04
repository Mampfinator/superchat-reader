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
        let lastStatus: number = 0;

        // Shim fetch with our own that returns fake failures
        globalThis['fetch'] = async (input: URL | RequestInfo, init?: RequestInit & { client?: Deno.HttpClient }) => {
            let resp: Response;
            if (!trueResponse) {
                trueResponse = await nativeFetch(input, init);
                if (trueResponse.status != 200) {
                    throw new Error(`Actual API returned a non-OK code: ${trueResponse.statusText}`);
                }
                resp = new Response(trueResponse.body, { status: 429 });
                console.log('spoofing response 429');
            } else if (lastStatus == 429) {
                resp = new Response(trueResponse.body, { status: 418 });
                console.log('spoofing response 418');
            } else {
                resp = trueResponse;
                console.log('Giving true response');
            }
            lastStatus = resp.status;
            return resp;
        };

        await context.step('API failure: too many requests', async () => {
            await assertRejects(CCC.loadCCCache);
        });

        await context.step('API failure: General', async () => {
            await assertRejects(CCC.loadCCCache);
        });

        await context.step('Cache downloads correctly', CCC.loadCCCache);

        const faketime = new FakeTime('4000-01-01');
        await context.step('Cache is out of date', CCC.loadCCCache);
        faketime.restore();

        // Reset fetch to default
        globalThis['fetch'] = nativeFetch;
        console.log('fetch reset to default');
        Deno.lstatSync(CCC.CC_CACHE_FILEPATH);
        assertEquals(CCC.isLoaded(), true);
        trueResponse!.body?.cancel();
    },
    ignore: !Deno.env.has('REMOVE_CACHE') && false,
});

Deno.test(TEST_PREFIX + 'Just load cache', async () => {
    await CCC.loadCCCache();
    assert(CCC.isLoaded());
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
