import { ConfigurationBuilder } from '@app/ConfigurationBuilder.ts';
import { WebUI } from 'https://deno.land/x/webui@2.5.3/mod.ts';
import UISnippets from '@app/UISnippets/dir.ts';

if (import.meta.main) {
    const win = new WebUI();
    const builderScript = await (await UISnippets.load('config-custom-elements.html')).text();

    const cb = new ConfigurationBuilder()
        .addButton('click here to boop', {})
        .addButton('Click to exit', {
            callback: () => {
                win.close();
            },
        })
        .addCheckbox('check: Starts checked', { value: true })
        .addCheckbox('check: Starts unchecked', {})
        .addSlider('slider', {
            range: [2, 20],
            value: 6,
            step: 2,
        })
        .addTextBox('Textbox: blank', { type: 'text' })
        .addTextBox('Textbox: filled', { type: 'text', value: 'pre-filled' })
        .addTextBox('Textbox: placeholder', { type: 'text', placeholder: 'Enter text here' })
        .addTextBox('Numberbox: blank', { type: 'number' })
        .addTextBox('Numberbox: filled', { type: 'number', value: 1234 })
        .addTextBox('Numberbox: placeholder', { type: 'number', placeholder: 'Enter text here' });

    const html = `<html>
            <body>
                ${cb.render()}
                ${builderScript}
                <script src="webui.js" defer></script>
            </body>
        </html>`;
    cb.bind(win);
    win.setSize(400, 600);

    // We don't care about errors
    win.show(html).catch(() => {});

    await WebUI.wait();
    console.log('exit program');
}
