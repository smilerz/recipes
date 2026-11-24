// Stryker instruments a <script setup> by wrapping expressions in calls to helpers that it declares in the same script.
// Vue hoists the arguments of its compiler macros (defineProps, defineEmits, ...) out of setup(), so an instrumented
// argument refers to a local variable and the component no longer compiles: the initial test run crashes and nothing
// is mutated. Expressions inside a macro call are therefore left out of mutation.
import {declareValuePlugin, PluginKind} from '@stryker-mutator/api/plugin'

const VUE_MACROS = new Set(['defineProps', 'defineEmits', 'defineModel', 'defineExpose', 'defineOptions', 'defineSlots', 'withDefaults'])

export const strykerPlugins = [
    declareValuePlugin(PluginKind.Ignore, 'vue-macros', {
        shouldIgnore(path) {
            const macroCall = path.find(p => p.isCallExpression() && p.node.callee.type === 'Identifier' && VUE_MACROS.has(p.node.callee.name))
            return macroCall ? `${macroCall.node.callee.name}() is hoisted out of setup() by Vue` : undefined
        },
    }),
]
