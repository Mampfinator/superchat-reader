import { Router } from '@app/FileHandler.ts';
import { assertSpyCall, spy } from '@std/testing/mock';
import { assertEquals, assertThrows } from '@std/assert';

function doNothingFunction(_variables: Record<string, string | undefined>, _path: string) {
    return Promise.resolve(undefined);
}

Deno.test({
    name: 'Router tests',
    async fn(context) {
        const dnf1 = spy(doNothingFunction);
        const r = new Router()
            .add('/', dnf1)
            .add('/one', dnf1)
            .add('/one/two/three', dnf1)
            .add('/:captOne', dnf1)
            .add('/long/route', dnf1, true);

        await context.step({
            name: 'fail to add colliding route',
            fn() {
                assertThrows(() => {
                    r.add('/one/two/three', dnf1);
                });
            },
        });

        await context.step({
            name: 'Successfully add "colliding" route that allows for remainders',
            fn() {
                r.add('/one/two/three', dnf1, true);
            },
        });

        let callCount = 0;
        await context.step({
            name: 'root match',
            fn() {
                const route = '/';
                r.route(route);
                assertSpyCall(dnf1, callCount++, {
                    args: [{}, route, ''],
                });
            },
        });

        await context.step({
            name: 'single segment match',
            fn() {
                const route = '/one';
                r.route(route);
                assertSpyCall(dnf1, callCount++, {
                    args: [{}, route, ''],
                });
            },
        });

        await context.step({
            name: 'mutli segment match',
            fn() {
                const route = '/one/two/three';
                r.route(route);
                assertSpyCall(dnf1, callCount++, {
                    args: [{}, route, ''],
                });
            },
        });

        await context.step({
            name: '"colliding" match with remainders',
            fn() {
                const route = '/one/two/three/four';
                r.route(route);
                assertSpyCall(dnf1, callCount++, {
                    args: [{}, route, '/four'],
                });
            },
        });

        await context.step({
            name: 'capturing segment match',
            fn() {
                const route = '/captMe';
                r.route(route);
                assertSpyCall(dnf1, callCount++, {
                    args: [{ captOne: 'captMe' }, route, ''],
                });
            },
        });

        await context.step({
            name: 'remainder match (no remainder)',
            fn() {
                const route = '/long/route';
                r.route(route);
                assertSpyCall(dnf1, callCount++, {
                    args: [{}, route, ''],
                });

                // Check with a trailing slash that should not be part of the remainder
                r.route(route + '/');
                assertSpyCall(dnf1, callCount++, {
                    args: [{}, route + '/', ''],
                });
            },
        });

        await context.step({
            name: 'remainder match',
            fn() {
                const route = '/long/route/that/allows/remainders';
                r.route(route);
                assertSpyCall(dnf1, callCount++, {
                    args: [{}, route, '/that/allows/remainders'],
                });
            },
        });

        await context.step({
            name: '404',
            async fn() {
                const route = '/route/that/doesnt/exist';
                const resp = await r.route(route);
                assertEquals(resp?.status, 404);
                console.log(resp?.statusText);
            },
        });
    },
});
