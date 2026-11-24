// Stryker instruments a <script setup> by wrapping expressions in calls to helpers that it declares in the same script.
// Vue hoists the arguments of its compiler macros (defineProps, defineEmits, ...) out of setup(), so an instrumented
// argument refers to a local variable and the component no longer compiles: the initial test run crashes and nothing
// is mutated. Expressions inside a macro call are therefore left out of mutation.
import {declareValuePlugin, PluginKind} from '@stryker-mutator/api/plugin'

const VUE_MACROS = new Set(['defineProps', 'defineEmits', 'defineModel', 'defineExpose', 'defineOptions', 'defineSlots', 'withDefaults'])

const isMacroCall = node => node?.type === 'CallExpression' && node.callee.type === 'Identifier' && VUE_MACROS.has(node.callee.name)

export const strykerPlugins = [
    declareValuePlugin(PluginKind.Ignore, 'vue-macros', {
        shouldIgnore(path) {
            // an expression inside a macro call
            const macroCall = path.find(p => p.isCallExpression() && isMacroCall(p.node))
            if (macroCall) return `${macroCall.node.callee.name}() is hoisted out of setup() by Vue`

            // the statement that holds a macro call: Vue only treats a call as a macro while it is a top-level statement, so a
            // mutant that wraps or replaces the statement (`defineExpose(...)` inside an if/else) leaves a plain, undefined function
            const holdsMacro = (path.isExpressionStatement() && isMacroCall(path.node.expression))
                || (path.isVariableDeclaration() && path.node.declarations.some(d => isMacroCall(d.init)))
            return holdsMacro ? 'a statement holding a Vue compiler macro has to stay a top-level statement' : undefined
        },
    }),
]
