import { crypto } from '@std/crypto/crypto';
import UISnippets from '@app/UISnippets/dir.ts';
import { WebUI } from 'https://deno.land/x/webui@2.5.3/mod.ts';
import { z as zod } from 'zod';

// #region Main builder
export class ConfigurationBuilder {
    // deno-lint-ignore no-explicit-any
    private elements: ConfigElementBase<any>[] = [];

    /**
     * Adds a checkbox to the configuration panel.
     * @param label The text to display next to the checkbox
     * @param callback A function to be called when the value changes
     */
    addCheckbox(label: string, options: zod.input<typeof ConfigCheckboxOptions>): this {
        this.elements.push(new ConfigCheckbox(label, options));
        return this;
    }

    /**
     * Add a slider with min and max values to the configuration panel
     * @param label The text to display next to the slider
     * @param min Minimum value
     * @param max Maximum value
     * @param callback The function to call when the value changes
     */
    addSlider(label: string, options: ConfigSliderOptions): this {
        this.elements.push(new ConfigSlider(label, options));
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
    addTextBox(label: string, options: ConfigTextBoxOptions): this {
        this.elements.push(new ConfigTextBox(label, options));
        return this;
    }

    /**
     * Add a clickable button to the configuration panel
     * @param label The text to display on the button
     * @param callback The function to call when the button is clicked
     */
    addButton(label: string, options: ConfigButtonOptions): this {
        this.elements.push(new ConfigButton(label, options));
        return this;
    }

    /**
     * Build the configuration panel for display
     * @returns An HTML string for rendering
     */
    render(): string {
        let content = '<div>';
        for (const elem of this.elements) {
            const { tagName, attr } = elem.build();
            let tagStr = `<${tagName} `;
            for (const [name, value] of Object.entries(attr)) {
                tagStr += `${name}="${value}" `;
            }
            tagStr += `></${tagName}>`;
            content += tagStr;
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
// #endregion

type BuildReturnType = { tagName: string; attr: Record<string, string | number | boolean> };
/** Items that all elements in the configuration panel share */
abstract class ConfigElementBase<Schema extends zod.Schema> {
    /** Unique ID to assign to webUI bindings */
    readonly callbackIdentifier;
    protected options: zod.infer<Schema>;

    /**
     * @param label Element label, typically displayed next to the element
     * @param replaceObject Map of key-value pairs to replace inside the snippet. {label} and {callbackID} are
     * automatically provided.
     */
    constructor(readonly label: string, schema: Schema, options: zod.input<Schema>) {
        this.callbackIdentifier = crypto.randomUUID().replaceAll('-', '_');
        const parsed = schema.parse(options);
        this.options = parsed;
    }

    /** Render the element to tag metadata */
    abstract build(): BuildReturnType;
    abstract bind(wui: WebUI): void;
}

// #region Checkbox element
const ConfigCheckboxOptions = zod.object({
    value: zod.boolean().optional(),
    callback: zod.function()
        .args(zod.boolean())
        .returns(zod.void())
        .optional()
        .default(() => console.log),
});
type ConfigCheckboxOptions = zod.input<typeof ConfigCheckboxOptions>;

/** Dynamically handled checkbox for configuration */
class ConfigCheckbox extends ConfigElementBase<typeof ConfigCheckboxOptions> {
    constructor(label: string, options: ConfigCheckboxOptions) {
        super(label, ConfigCheckboxOptions, options);
    }

    build(): BuildReturnType {
        return {
            tagName: 'config-checkbox',
            attr: {
                label: this.label,
                uuid: this.callbackIdentifier,
            },
        };
    }

    bind(wui: WebUI): void {
        wui.bind(`checked_${this.callbackIdentifier}`, ({ arg }) => {
            const checkStatus = arg.boolean(0);
            this.options.callback(checkStatus);
        });
    }
}
// #endregion

// #region Slider element
const ConfigSliderOptions = zod.object({
    value: zod.number(),
    callback: zod.function()
        .args(zod.number())
        .returns(zod.void())
        .default(() => console.log),
    range: zod.tuple([zod.number().nonnegative(), zod.number().nonnegative()]).default([0, 10]).superRefine(
        ([min, max], ctx) => {
            if (min >= max) {
                ctx.addIssue({
                    code: 'custom',
                    message: 'min must be smaller than max',
                    fatal: true,
                });
            }
        },
    ),
    step: zod.number().nonnegative(),
});

type ConfigSliderOptions = zod.input<typeof ConfigSliderOptions>;

/** Dynamically handled slider for configuration */
class ConfigSlider extends ConfigElementBase<typeof ConfigSliderOptions> {
    constructor(label: string, options: ConfigSliderOptions) {
        super(label, ConfigSliderOptions, options);
    }

    build(): BuildReturnType {
        return {
            tagName: 'config-slider',
            attr: {
                label: this.label,
                uuid: this.callbackIdentifier,
                min: this.options.range[0],
                max: this.options.range[1],
                step: this.options.step,
                startValue: this.options.value,
            },
        };
    }

    bind(wui: WebUI): void {
        wui.bind(`slider_${this.callbackIdentifier}`, ({ arg }) => {
            const value = arg.number(0);
            this.options.callback(value);
        });
    }
}
// #endregion

// #region Textbox element
const ConfigTextBoxOptions = zod.union([
    zod.object({
        placeholder: zod.string().optional(),
        type: zod.literal('text'),
        value: zod.string().optional(),
        callback: zod.function()
            .args(zod.string())
            .returns(zod.void())
            .optional()
            .default(() => console.log),
    }),
    zod.object({
        placeholder: zod.string().optional(),
        type: zod.literal('number'),
        value: zod.number().optional(),
        callback: zod.function()
            .args(zod.number())
            .returns(zod.void())
            .optional()
            .default(() => console.log),
    }),
]);
type ConfigTextBoxOptions = zod.input<typeof ConfigTextBoxOptions>;

/** Dynamically handled textbox for configuration */
class ConfigTextBox extends ConfigElementBase<typeof ConfigTextBoxOptions> {
    constructor(label: string, options: ConfigTextBoxOptions) {
        super(label, ConfigTextBoxOptions, options);
        Object.assign(this.options, options);
    }

    build(): BuildReturnType {
        return {
            tagName: 'config-textbox',
            attr: {
                label: this.label,
                uuid: this.callbackIdentifier,
                value: this.options.value ?? '',
                placeholder: this.options.placeholder ?? '',
                type: this.options.type ?? 'text',
            },
        };
    }

    bind(wui: WebUI): void {
        wui.bind(`textbox_${this.callbackIdentifier}`, ({ arg }) => {
            if (this.options.type === 'number') {
                this.options.callback(arg.number(0));
            } else {
                this.options.callback(arg.string(0));
            }
        });
    }
}
// #endregion

// #region Button element
const ConfigButtonOptions = zod.object({
    callback: zod.function().returns(zod.void()).optional().default(console.log),
});
type ConfigButtonOptions = zod.input<typeof ConfigButtonOptions>;

/** Dynamically handled button for configuration */
class ConfigButton extends ConfigElementBase<typeof ConfigButtonOptions> {
    constructor(label: string, options: ConfigButtonOptions) {
        super(label, ConfigButtonOptions, options);
    }

    build() {
        return {
            tagName: 'config-button',
            attr: {
                uuid: this.callbackIdentifier,
                label: this.label,
            },
        };
    }

    bind(wui: WebUI): void {
        wui.bind(this.callbackIdentifier, () => this.options.callback());
    }
}
// #endregion

// #region Debug
if (import.meta.main) {
    const cb = new ConfigurationBuilder();
    const win = new WebUI();
    const builderScript = await (await UISnippets.load('config-custom-elements.html')).text();

    cb.addButton('click here to boop', {})
        .addCheckbox('check', {})
        .addSlider('slider', {
            range: [2, 20],
            value: 12,
            step: 2,
        })
        .addTextBox('Type here!', { type: 'text' })
        .addTextBox('Number here!', { type: 'number' })
        .addButton('Click to exit', {
            callback: () => {
                win.close();
            },
        });

    const html = `<html>
            <body>
                ${cb.render()}
                ${builderScript}
                <script src="webui.js" defer></script>
            </body>
        </html>`;
    cb.bind(win);
    // We don't care about errors
    win.show(html).catch(() => {});

    await WebUI.wait();
    console.log('exit program');
}
// #endregion
