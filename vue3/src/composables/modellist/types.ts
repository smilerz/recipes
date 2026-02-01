/**
 * Generic interfaces for enhanced model list capabilities.
 * When a Model provides these optional config fields, ModelListPage
 * activates enhanced rendering (configurable columns, filters, actions, settings).
 */

/**
 * Column display types for enhanced table rendering.
 * Used by ModelListColumnCell to determine how to render a cell.
 */
export type ModelColumnType = 'text' | 'number' | 'boolean-indicator' | 'status-chip' | 'action-menu'

/**
 * Filter control types for the filter panel.
 */
export type ModelFilterType = 'tristate' | 'model-select'

/**
 * Filter definition for a model list.
 * Each filter maps to a backend query parameter.
 */
export type ModelFilterDef = {
    /** Unique key, matches the backend query parameter name */
    key: string,
    /** Localization key for the filter label */
    labelKey: string,
    /** Type of filter control to render */
    type: ModelFilterType,
    /** Icon to display next to the filter (FontAwesome class) */
    icon?: string,
    /** For model-select type: the model name to use for lookup */
    modelName?: string,
    /** Group key for organizing filters in the panel */
    group?: string,
}

/**
 * Action definition for a model list.
 * Defines what actions are available in the context menu and as quick actions.
 */
export type ModelActionDef = {
    /** Unique key for this action */
    key: string,
    /** Localization key for the action label */
    labelKey: string,
    /** Icon to display (FontAwesome class) */
    icon: string,
    /** Whether this is a toggle action (shows active/inactive state) */
    isToggle?: boolean,
    /** For toggle actions: the data field to check for active state */
    toggleField?: string,
    /** Color when action is active (Vuetify color) */
    activeColor?: string,
    /** Color when action is inactive (Vuetify color) */
    inactiveColor?: string,
    /** Group key for organizing actions in the menu */
    group?: string,
    /** Whether this action requires confirmation */
    requiresConfirmation?: boolean,
    /** Route name to navigate to (instead of API action) */
    routeName?: string,
    /** Query params builder for route navigation */
    routeQuery?: (item: any) => Record<string, any>,
}

/**
 * Settings configuration for an enhanced model list.
 * Controls which features are available and their defaults.
 */
export type ModelListSettings = {
    /** Prefix for device settings keys (e.g., 'food' → 'food_hiddenColumns') */
    settingsKey: string,
    /** Whether the settings panel is available */
    settingsPanel: boolean,
    /** Whether tree view is available (requires model.isTree) */
    treeEnabled?: boolean,
    /** Whether a stats footer is available */
    statsFooter?: boolean,
    /** Whether a mobile-specific list layout is available */
    mobileList?: boolean,
}
