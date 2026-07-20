import '@fortawesome/fontawesome-free/css/all.css'
import 'vuetify/styles'
import {aliases, fa} from 'vuetify/iconsets/fa'

// Composables
import {createVuetify} from 'vuetify'
import {DateTime} from "luxon";
import * as vuetifyLocales from "vuetify/locale";

// Production-time Vuetify configuration. Exported separately so test setup
// (vitest.setup.ts) can reuse the same theme / locale / icon aliases /
// defaults while attaching all components and directives explicitly — the
// test bundle has no vite-plugin-vuetify auto-import, so without explicit
// component registration tests would hit "Failed to resolve component"
// warnings on v-card / v-btn / v-dialog and selector queries return empty.
// https://vuetifyjs.com/en/introduction/why-vuetify/#feature-guides
export const vuetifyOptions = {
    display: {
        mobileBreakpoint: 'md',
    },
    defaults: {
        // disabled as this leads to cards overflowing if not careful, manually set on cards containing a multiselect until proper solution is found
        // VCard: {
        //     class: 'overflow-visible' // this is needed so that vue-multiselect options show above a card, vuetify uses overlay container to avoid this
        // },
        // without this action buttons are left aligned in normal cards but right aligned in dialogs (I think)
        VCardActions: {
            class: 'float-right'
        },
        // limiting max width of base container so UIs dont become too wide
        VContainer: {
            maxWidth: '1400px'
        },
        // always localize the date display of DateInputs
        // VDateInput: {
        //     displayFormat: (date: Date) => DateTime.fromJSDate(date).toLocaleString()
        // },
        // always use color for switches to properly see if enabled or not
        VSwitch: {
            color: 'primary'
        },
        // globally set the correct decimal seperator
        // VNumberInput: {
        //     decimalSeparator: 0.1.toLocaleString().replace(/\d/g, '')
        // }
    },
    locale: {
        locale: 'en',
        fallback: 'en',
        messages: vuetifyLocales,
    },
    theme: {
        defaultTheme: 'light',
        themes: {
            light: {
                colors: {
                    background: '#f5efea',
                    tandoor: '#ddbf86',
                    primary: '#b98766',
                    secondary: '#b55e4f',
                    success: '#82aa8b',
                    'on-success': '#000000',
                    info: '#385f84',
                    warning: '#eaaa21',
                    error: '#a7240e',

                    save: '#82aa8b',
                    create: '#82aa8b',
                    edit: '#385f84',
                    delete: '#a7240e',
                    cancel: '#eaaa21',

                    recipeImagePlaceholderBg: '#ffffff',
                },
            },
            dark: {
                colors: {
                    tandoor: '#ddbf86',
                    primary: '#b98766',
                    secondary: '#b55e4f',
                    success: '#82aa8b',
                    'on-success': '#000000',
                    info: '#385f84',
                    warning: '#eaaa21',
                    error: '#a7240e',

                    save: '#82aa8b',
                    create: '#82aa8b',
                    edit: '#385f84',
                    delete: '#a7240e',
                    cancel: '#eaaa21',

                    recipeImagePlaceholderBg: '#212121',
                },
            },
            // Bootswatch-3-derived palettes. nav (`tandoor`) follows each theme's
            // primary; save/create→success, edit→info, delete→error, cancel→warning.
            cerulean: {
                dark: false,
                colors: {
                    background: '#f2f7fb', surface: '#ffffff',
                    tandoor: '#2fa4e7', primary: '#2fa4e7', secondary: '#317eac',
                    success: '#73a839', info: '#033c73', warning: '#dd5600', error: '#c71c22',
                    save: '#73a839', create: '#73a839', edit: '#033c73', delete: '#c71c22', cancel: '#dd5600',
                    recipeImagePlaceholderBg: '#ffffff',
                },
            },
            flat: {
                dark: false,
                colors: {
                    background: '#ecf0f1', surface: '#ffffff',
                    tandoor: '#2c3e50', primary: '#2c3e50', secondary: '#18bc9c',
                    success: '#18bc9c', info: '#3498db', warning: '#f39c12', error: '#e74c3c',
                    save: '#18bc9c', create: '#18bc9c', edit: '#3498db', delete: '#e74c3c', cancel: '#f39c12',
                    recipeImagePlaceholderBg: '#ffffff',
                },
            },
            midnight: {
                dark: true,
                colors: {
                    background: '#222222', surface: '#2b2b2b',
                    tandoor: '#375a7f', primary: '#375a7f', secondary: '#00bc8c',
                    success: '#00bc8c', info: '#3498db', warning: '#f39c12', error: '#e74c3c',
                    save: '#00bc8c', create: '#00bc8c', edit: '#3498db', delete: '#e74c3c', cancel: '#f39c12',
                    recipeImagePlaceholderBg: '#2b2b2b',
                },
            },
            slate: {
                dark: true,
                colors: {
                    background: '#272b30', surface: '#2e3338',
                    tandoor: '#7a8288', primary: '#7a8288', secondary: '#5bc0de',
                    success: '#62c462', info: '#5bc0de', warning: '#f89406', error: '#ee5f5b',
                    save: '#62c462', create: '#62c462', edit: '#5bc0de', delete: '#ee5f5b', cancel: '#f89406',
                    recipeImagePlaceholderBg: '#2e3338',
                },
            },
        },
    },
    icons: {
        defaultSet: 'fa',
        aliases: {
            ...aliases,
            save: 'fa-solid fa-floppy-disk',
            delete: 'fa-solid fa-trash-can',
            edit: 'fa-solid fa-pencil',
            create: 'fa-solid fa-plus',
            upload: 'fa-solid fa-file-arrow-up',
            search: 'fa-solid fa-magnifying-glass',
            copy: 'fa-solid fa-copy',
            add: 'fa-solid fa-plus',
            close: 'fa-solid fa-xmark',
            help: 'fa-solid fa-info',
            settings: 'fa-solid fa-sliders',
            dragHandle: 'fa-solid fa-grip-vertical',
            spaces: 'fa-solid fa-database',
            shopping: 'fa-solid fa-cart-shopping',
            mealplan: 'fa-solid fa-calendar-days',
            recipes: 'fa-solid fa-book',
            books: 'fa-solid fa-book-bookmark',
            menu: 'fa-solid fa-ellipsis-vertical',
            import: 'fa-solid fa-globe',
            properties: 'fa-solid fa-database',
            pantry: 'fas fa-jar',
            automation: 'fa-solid fa-robot',
            ai: 'fa-solid fa-wand-magic-sparkles',
            reset: 'fa-solid fa-circle-xmark'
        },
        sets: {
            fa,
        },
    },
}

export default createVuetify(vuetifyOptions)

export type VDataTableUpdateOptions = {
    page: number;
    itemsPerPage?: number;
    search?: string;
    sortBy?: string;
    groupBy?: string;
}

const VUETIFY_LOCALES = new Set(Object.keys(vuetifyLocales))

const VUETIFY_LOCALE_MAP: Record<string, string> = {
    'nb-no': 'no',
    'nb': 'no',
    'pt-br': 'pt',
    'zh-hans': 'zhHans',
    'zh-hant': 'zhHant',
    'sr-cyrl': 'srCyrl',
    'sr-latn': 'srLatn',
}

export function toVuetifyLocale(djangoCode: string): string {
    const lc = djangoCode.toLowerCase()
    const mapped = VUETIFY_LOCALE_MAP[lc] || lc
    return VUETIFY_LOCALES.has(mapped) ? mapped : 'en'
}
