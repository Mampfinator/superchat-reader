import { crypto } from '@std/crypto/crypto';
import UISnippets from '@app/UISnippets/dir.ts';
import { WebUI } from 'https://deno.land/x/webui@2.5.3/mod.ts';
import { z as zod, ZodError } from 'zod';
import { Constructor } from '@app/util.ts';

// #region Main builder
export class ConfigurationBuilder {
    private valid = true;
    private issues: zod.ZodIssue[] = [];
    // deno-lint-ignore no-explicit-any
    private elements: ConfigElementBase<any>[] = [];

    /**
     * Adds a checkbox to the configuration panel.
     * @param label The text to display next to the checkbox
     * @param callback A function to be called when the value changes
     */
    addCheckbox(label: string, options: zod.input<typeof ConfigCheckboxOptions>): this {
        return this.addElement(ConfigCheckbox, label, options);
    }

    /**
     * Add a slider with min and max values to the configuration panel
     * @param label The text to display next to the slider
     * @param min Minimum value
     * @param max Maximum value
     * @param callback The function to call when the value changes
     */
    addSlider(label: string, options: ConfigSliderOptions): this {
        return this.addElement(ConfigSlider, label, options);
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
        return this.addElement(ConfigTextBox, label, options);
    }

    /**
     * Add a clickable button to the configuration panel
     * @param label The text to display on the button
     * @param callback The function to call when the button is clicked
     */
    addButton(label: string, options: ConfigButtonOptions): this {
        return this.addElement(ConfigButton, label, options);
    }

    addParagraph(content: zod.input<typeof ConfigParagraphOptions>): this {
        return this.addElement(ConfigPragraph, content);
    }

    private addElement<
        T extends ConfigElementBase<zod.Schema>,
        C extends Constructor<T>,
        P extends ConstructorParameters<C>,
    >(constructor: C, ...parameters: P): this {
        try {
            this.elements.push(new constructor(...parameters));
        } catch (e) {
            this.invalidate(constructor, e);
        }
        return this;
    }

    // deno-lint-ignore ban-types no-explicit-any
    private invalidate(constructor: Function, error: any) {
        if (!(error instanceof ZodError)) {
            throw error;
        }

        for (const issue of error.issues) {
            console.warn(`${error.name} [${issue.code}]: ${issue.message}`);
            this.issues.push(issue);
        }
        console.warn(`Could not add ${constructor.name}.`);
        this.valid = false;
    }

    /**
     * Build the configuration panel for display
     * @returns An HTML string for rendering
     */
    render(): string {
        if (!this.valid) {
            throw new Deno.errors.InvalidData('Built configuration not valid. Refusing to render.');
        }
        let content = '<div>';
        for (const elem of this.elements) {
            const tagStr = renderElementDescriptor(elem.build());
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

type ElementDescriptor = {
    tagName: string;
    attr: Record<string, string | number | boolean>;
    content?: string | ElementDescriptor | ElementDescriptor[];
};

function renderElementDescriptor(descriptor: ElementDescriptor): string {
    const { tagName, attr, content } = descriptor;
    let tagStr = `<${tagName} `;
    for (const [name, value] of Object.entries(attr)) {
        tagStr += `${name}="${value}" `;
    }
    tagStr += '>';
    if (content) {
        if (typeof content === 'string') {
            tagStr += content;
        } else if (Array.isArray(content)) {
            for (const elem of content) {
                tagStr += renderElementDescriptor(elem);
            }
        } else {
            tagStr += renderElementDescriptor(content);
        }
    }
    tagStr += `</${tagName}>`;
    return tagStr;
}

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
    abstract build(): ElementDescriptor;
    abstract bind(wui: WebUI): void;
}

// #region Checkbox element
const ConfigCheckboxOptions = zod.object({
    value: zod.boolean().optional().default(false),
    callback: zod.function()
        .args(zod.boolean())
        .optional()
        .default(() => console.log),
});
type ConfigCheckboxOptions = zod.input<typeof ConfigCheckboxOptions>;

/** Dynamically handled checkbox for configuration */
class ConfigCheckbox extends ConfigElementBase<typeof ConfigCheckboxOptions> {
    constructor(label: string, options: ConfigCheckboxOptions) {
        super(label, ConfigCheckboxOptions, options);
    }

    build(): ElementDescriptor {
        return {
            tagName: 'config-checkbox',
            attr: {
                label: this.label,
                uuid: this.callbackIdentifier,
                value: this.options.value ?? false,
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
    value: zod.number().optional().default(0),
    callback: zod.function()
        .args(zod.number())
        .default(() => console.log),
    range: zod.tuple([zod.number().nonnegative(), zod.number().nonnegative()]).default([0, 10]),
    step: zod.number().nonnegative().optional().default(1),
}).superRefine(({ range, value }, ctx) => {
    const [rangeMin, rangeMax] = range;
    if (rangeMin >= rangeMax) {
        ctx.addIssue({
            code: 'custom',
            message: 'range min must be smaller than max',
            fatal: true,
        });
    }
    if (value < rangeMin) {
        ctx.addIssue({
            code: 'too_small',
            message: 'value must be within range',
            inclusive: true,
            minimum: rangeMin,
            type: 'number',
        });
    } else if (value > rangeMax) {
        ctx.addIssue({
            code: 'too_big',
            message: 'value must be within range',
            inclusive: true,
            maximum: rangeMax,
            type: 'number',
        });
    }
});

type ConfigSliderOptions = zod.input<typeof ConfigSliderOptions>;

/** Dynamically handled slider for configuration */
class ConfigSlider extends ConfigElementBase<typeof ConfigSliderOptions> {
    constructor(label: string, options: ConfigSliderOptions) {
        super(label, ConfigSliderOptions, options);
    }

    build(): ElementDescriptor {
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
        type: zod.literal('text').optional().default('text'),
        value: zod.string().optional(),
        callback: zod.function()
            .args(zod.string())
            .optional()
            .default(() => console.log),
    }),
    zod.object({
        placeholder: zod.string().optional(),
        type: zod.literal('number'),
        value: zod.number().optional(),
        callback: zod.function()
            .args(zod.number())
            .optional()
            .default(() => console.log),
    }),
]);
type ConfigTextBoxOptions = zod.input<typeof ConfigTextBoxOptions>;

/** Dynamically handled textbox for configuration */
class ConfigTextBox extends ConfigElementBase<typeof ConfigTextBoxOptions> {
    constructor(label: string, options: ConfigTextBoxOptions) {
        super(label, ConfigTextBoxOptions, options);
    }

    build(): ElementDescriptor {
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
    callback: zod
        .function()
        .optional()
        .default(() => () => console.log('Boop')),
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
        wui.bind(this.callbackIdentifier, () => {
            this.options.callback();
        });
    }
}
// #endregion

const ConfigParagraphOptions = zod.string();
type ConfigParagraphOptions = zod.input<typeof ConfigParagraphOptions>;

/** Static paragraph element for displaying information */
class ConfigPragraph extends ConfigElementBase<typeof ConfigParagraphOptions> {
    constructor(options: ConfigParagraphOptions) {
        super('', ConfigParagraphOptions, options);
    }

    build(): ElementDescriptor {
        return {
            tagName: 'p',
            attr: {
                class: 'config-text',
            },
            content: this.options,
        };
    }

    bind(_: WebUI): void {
        return;
    }
}
