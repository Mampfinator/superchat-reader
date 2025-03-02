import { crypto } from '@std/crypto/crypto';
import UISnippets from '@app/UISnippets/dir.ts';
import { WebUI } from 'https://deno.land/x/webui@2.5.3/mod.ts';

export class ConfigurationBuilder {
    private elements: ConfigElementBase[] = [];

    /**
     * Adds a checkbox to the configuration panel.
     * @param label The text to display next to the checkbox
     * @param callback A function to be called when the value changes
     */
    addCheckbox(label: string, callback: (newValue: boolean) => void): this {
        this.elements.push(new ConfigCheckbox(label, callback));
        return this;
    }

    /**
     * Add a slider with min and max values to the configuration panel
     * @param label The text to display next to the slider
     * @param min Minimum value
     * @param max Maximum value
     * @param callback The function to call when the value changes
     */
    addSlider(
        label: string,
        min: number,
        max: number,
        step = 1,
        defaultVal: number | null = null,
        callback: (newValue: number) => void,
    ): this {
        this.elements.push(new ConfigSlider(label, min, max, step, defaultVal, callback));
        return this;
    }

    /**
     * Add a textboxt to the configuration panel, where the user can input any text
     * TODO: Probably make validate just a regex
     * @param label The text to display next to the textbox
     * @param defaultVal The default value of the textbox
     * @param callback The function to call when the value changes, after validation
     * @param validate The function to call when the value changes, to validate the new value
     */
    addTextBox(
        label: string,
        defaultVal: string,
        callback: (newValue: string) => void,
        validate: (newValue: string) => string = (v) => v,
    ): this {
        this.elements.push(new ConfigTextBox(label, defaultVal, callback, validate));
        return this;
    }

    /**
     * Add a clickable button to the configuration panel
     * @param label The text to display on the button
     * @param callback The function to call when the button is clicked
     */
    addButton(label: string, callback: () => void): this {
        this.elements.push(new ConfigButton(label, callback));
        return this;
    }

    /**
     * Build the configuration panel for display
     * @returns An HTML string for rendering
     */
    build(): string {
        let content = '<div>';
        for (const elem of this.elements) {
            content += elem.render();
        }
        content += '</div>';

        return content;
    }

    bind(wui: WebUI): void {
        for (const elem of this.elements) {
            elem.bind(wui);
        }
    }
}

const CheckboxHtmlSnippet = await (await UISnippets.load('checkbox.html')).text();
const ButtonHtmlSnippet = await (await UISnippets.load('button.html')).text();
const SliderHtmlSnippet = await (await UISnippets.load('slider.html')).text();
const TextboxHtmlSnippet = await (await UISnippets.load('textbox.html')).text();

/** Items that all elements in the configuration panel share */
abstract class ConfigElementBase {
    /**
     * HTML snippet that defines the rendered config element. Has keys like {label} that will be replaced
     * during the render phase.
     */
    abstract readonly snippet: string;
    /** Dictionary of replacements to perform on the HTML snippet. */
    readonly replacementKeys: { [x: string]: string | number };
    readonly replacementRegex: RegExp;
    /** Unique ID to assign to webUI bindings */
    readonly callbackIdentifier;
    /** Function to be called when the element is interacted with */
    // deno-lint-ignore no-explicit-any
    abstract readonly callback: (...args: any[]) => void;

    /**
     * @param label Element label, typically displayed next to the element
     * @param replaceObject Map of key-value pairs to replace inside the snippet. {label} and {callbackID} are
     * automatically provided.
     */
    constructor(label: string, replaceObject: { [x: string]: string | number } = {}) {
        this.callbackIdentifier = crypto.randomUUID().replaceAll('-', '_');
        replaceObject['callbackID'] = this.callbackIdentifier;
        replaceObject['label'] = label;
        this.replacementKeys = replaceObject;
        const innerRegex = Object.keys(this.replacementKeys).join('|');
        this.replacementRegex = new RegExp(`{(${innerRegex})}`, 'gi');
    }

    /** Render the element to HTML */
    render(): string {
        return this.snippet.replaceAll(this.replacementRegex, (str) => {
            str = str.replaceAll(/[{}]/g, '');
            return String(this.replacementKeys[str]!);
        });
    }

    abstract bind(wui: WebUI): void;
}

/** Dynamically handled checkbox for configuration */
export class ConfigCheckbox extends ConfigElementBase {
    snippet = CheckboxHtmlSnippet;

    constructor(label: string, readonly callback: (newValue: boolean) => void) {
        super(label);
    }

    bind(wui: WebUI): void {
        wui.bind(`checked_${this.callbackIdentifier}`, ({ arg }) => {
            const checkStatus = arg.boolean(0);
            this.callback(checkStatus);
        });
    }
}

/** Dynamically handled slider for configuration */
export class ConfigSlider extends ConfigElementBase {
    snippet = SliderHtmlSnippet;

    constructor(
        label: string,
        readonly min: number,
        readonly max: number,
        readonly step: number,
        readonly defaultVal: number | null,
        readonly callback: (newValue: number) => void,
    ) {
        if (min >= max) {
            throw new Deno.errors.InvalidData(`Min must be less than max [${min} !< ${max}]`);
        }
        if (!defaultVal) {
            defaultVal = min;
        }
        super(label, { min, max, step, defaultVal });
    }

    bind(wui: WebUI): void {
        wui.bind(`slider_${this.callbackIdentifier}`, ({ arg }) => {
            const value = arg.number(0);
            this.callback(value);
        });
    }
}

/** Dynamically handled textbox for configuration */
export class ConfigTextBox extends ConfigElementBase {
    snippet = TextboxHtmlSnippet;

    constructor(
        label: string,
        readonly defaultVal: string,
        readonly callback: (newValue: string) => void,
        readonly validate: (newValue: string) => string,
    ) {
        super(label, {
            defaultVal,
        });
    }

    bind(wui: WebUI): void {
        wui.bind(`textbox_${this.callbackIdentifier}`, ({ arg }) => {
            this.callback(arg.string(0));
        });
    }
}

/** Dynamically handled button for configuration */
export class ConfigButton extends ConfigElementBase {
    snippet = ButtonHtmlSnippet;

    constructor(label: string, readonly callback: () => void) {
        super(label);
    }

    bind(wui: WebUI): void {
        wui.bind(this.callbackIdentifier, this.callback);
    }
}

if (import.meta.main) {
    const cb = new ConfigurationBuilder();
    cb.addButton('click here to boop', () => {
        console.log('BOOP');
    });
    cb.addCheckbox('check', (newVal) => {
        console.log(newVal);
    });
    cb.addSlider('slider', 0, 10, 1, undefined, (newVal) => {
        console.log(newVal);
    });
    cb.addTextBox('Type here!', 'pls', (str) => {
        console.log(str);
    });
    const win = new WebUI();
    const html = `<html><head><script src="webui.js"></script></head>
            <body>
                ${cb.build()}
            </body>
        </html>`;
    cb.bind(win);
    // We don't care about errors
    win.show(html).catch(() => {});

    await WebUI.wait();
}
