import { crypto } from '@std/crypto/crypto';
import { WebUI } from 'https://deno.land/x/webui@2.5.3/mod.ts';
import { z as zod, ZodError } from 'zod';
import { Constructor } from '@app/util.ts';
import { DonationProvider } from '@app/DonationProvider.ts';

// #region Main builder
export class ConfigurationBuilder {
    private valid = true;
    private issues: { path: (string | number)[]; code: string; message: string }[] = [];
    // deno-lint-ignore no-explicit-any
    private elements: ConfigElementBase<any>[] = [];

    constructor(private readonly provider?: DonationProvider) {}

    /**
     * Adds a checkbox to the configuration panel.
     * @param label The text to display next to the checkbox
     * @returns `this` (for chaining)
     */
    addCheckbox(label: string, options: ConfigCheckboxOptions): this {
        return this.addElement(ConfigCheckbox, label, options);
    }

    /**
     * Add a slider with min and max values to the configuration panel
     * @param label The text to display next to the slider
     * @returns `this` (for chaining)
     */
    addSlider(label: string, options: ConfigSliderOptions): this {
        return this.addElement(ConfigSlider, label, options);
    }

    /**
     * Add a textboxt to the configuration panel, where the user can input any text
     * @param label The text to display next to the textbox
     * @returns `this` (for chaining)
     */
    addTextBox(label: string, options: ConfigTextBoxOptions): this {
        return this.addElement(ConfigTextBox, label, options);
    }

    /**
     * Add a clickable button to the configuration panel
     * @param label The text to display on the button
     * @returns `this` (for chaining)
     */
    addButton(label: string, options: ConfigButtonOptions): this {
        return this.addElement(ConfigButton, label, options);
    }

    /**
     * Add a static paragraph of text to the configuration panel.
     * @param content Any valid HTML string
     * @returns `this` (for chaining)
     */
    addParagraph(content: zod.input<typeof ConfigParagraphOptions>): this {
        return this.addElement(ConfigPragraph, content);
    }

    /**
     * Add an arbitrary element to the builder. Internal only.
     * @param constructor Relevant element constructor function
     * @param parameters Constructor parameters
     * @returns `this` (for chaining)
     */
    private addElement<
        T extends ConfigElementBase<zod.Schema>,
        C extends Constructor<T>,
        P extends ConstructorParameters<C>,
    >(constructor: C, ...parameters: P): this {
        try {
            this.elements.push(new constructor(...parameters));
        } catch (e) {
            this.invalidate(constructor.name, e);
        }
        return this;
    }

    /**
     * Invalidate the builder element due to
     * @param cName Constructor name, displayed in console
     * @param error error that caused the issue
     */
    private invalidate(cName: string, error: unknown) {
        // Log to console and invalidate right away
        console.warn(`Could not add ${cName}.`);
        this.valid = false;
        // rethrow any non Zod errors
        if (!(error instanceof ZodError)) throw error;

        for (const issue of error.issues) {
            console.warn(
                `Error configuring "${this.provider?.name ?? 'unknown'}" (${
                    this.provider?.id ?? 'unknown'
                }): ${cName}.${issue.path.join('.')} [${issue.code}]: ${issue.message}`,
            );
            this.issues.push({ ...issue, path: [cName, ...issue.path] });
        }
    }

    /**
     * Build the configuration panel for display
     * @returns An HTML string for rendering
     */
    // TODO: Make this render an error instead of throwing
    render(): string {
        if (!this.valid) {
            return renderElementDescriptor({
                tagName: 'details',
                attr: { class: 'config-error-container' },
                content: [
                    {
                        tagName: 'summary',
                        attr: { class: 'config-error-summary' },
                        content: `Error configuring "${this.provider?.name ?? 'unknown'}" (${
                            this.provider?.id ?? 'unknown'
                        })`,
                    },
                    {
                        tagName: 'ul',
                        attr: { class: 'config-error-issues' },
                        content: this.issues.map(({ path, code, message }) => ({
                            tagName: 'li',
                            attr: { class: 'config-error-issue' },
                            content: `${path.join('.')} [${code}]: ${message}`,
                        })),
                    },
                ],
            });
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

export type ElementDescriptor = {
    tagName: string;
    attr: Record<string, string | number | boolean>;
    content?: string | ElementDescriptor | ElementDescriptor[];
};

export function renderElementDescriptor(descriptor: ElementDescriptor): string {
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
     * @param schema Schema to validate input options with.
     * @param options Input options.
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
                value: this.options.value,
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
            path: ['range'],
        });
    }
    if (value < rangeMin) {
        ctx.addIssue({
            code: 'too_small',
            message: 'value must be within range',
            inclusive: true,
            minimum: rangeMin,
            type: 'number',
            path: ['value'],
        });
    } else if (value > rangeMax) {
        ctx.addIssue({
            code: 'too_big',
            message: 'value must be within range',
            inclusive: true,
            maximum: rangeMax,
            type: 'number',
            path: ['value'],
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
                value: this.options.value,
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

// #region  Paragraph element
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
// #endregion
