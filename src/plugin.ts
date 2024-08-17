import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import * as t from '@babel/types';
import path from 'node:path';
import { Plugin } from 'vite';

interface PluginOptions {
    include?: RegExp;

    /**
     * Internal
     */
    __internal_importHelperModuleName?: string;
}

const hookFunctionName = '__collectModule';

export default function preloadPlugin({
    include = /\.(jsx|tsx|js|ts)$/,
    __internal_importHelperModuleName = 'vite-preload/__internal',
}: PluginOptions = {}): Plugin {
    const lazyImportedModules = new Set();
    const injectedModules = new Set();
    let count = 0;

    return {
        name: 'vite-preload',

        apply(config, { command }) {
            // Enable on SSR builds (--ssr) and dev servers
            return Boolean(config.build?.ssr) || command === 'serve';
        },

        async transform(code, id) {
            const relative = getRelativePath(id);

            const foundLazyImports = new Set<string>();

            if (include.test(id) && code.includes('lazy')) {
                const ast = parse(code, {
                    sourceType: 'module',
                    plugins: ['jsx', 'typescript'],
                });

                // Find React.lazy imported modules
                traverse.default(ast, {
                    CallExpression: (p) => {
                        if (isLazyExpression(p)) {
                            const argument = p.node.arguments[0];
                            if (t.isArrowFunctionExpression(argument)) {
                                const body = argument.body;
                                if (
                                    t.isCallExpression(body) &&
                                    t.isImport(body.callee)
                                ) {
                                    const modulePath = (
                                        body.arguments[0] as any
                                    ).value;

                                    foundLazyImports.add(modulePath);
                                }
                            }
                        }
                    },
                });
            }

            for (const importString of foundLazyImports) {
                const relative = path.resolve(path.dirname(id), importString);
                const resolved = await this.resolve(importString, id);

                if (!resolved) {
                    throw new Error(`Did not find imported module ${relative}`);
                }

                this.info(
                    `imports ${path.relative(process.cwd(), resolved.id)}`
                );

                lazyImportedModules.add(resolved.id);
                // await this.load({ id: resolved.id });
            }

            if (lazyImportedModules.has(id)) {
                const ast = parse(code, {
                    sourceType: 'module',
                    plugins: ['jsx', 'typescript'],
                });

                let injected = false;

                traverse.default(ast, {
                    ExportDefaultDeclaration(path) {
                        const declaration = path.node.declaration;

                        // Insert hook in `export default function() { ... }`
                        if (isFunctionComponent(declaration)) {
                            injectImport(
                                ast,
                                __internal_importHelperModuleName
                            );
                            injectHook(path.get('declaration'), relative);
                            injected = true;
                        } else if (t.isIdentifier(declaration)) {
                            // Insert hook in `function Component() { ... }; export default Component;`
                            const binding = path.scope.getBinding(
                                declaration.name
                            );
                            if (
                                binding &&
                                isFunctionComponent(binding.path.node)
                            ) {
                                injectImport(
                                    ast,
                                    __internal_importHelperModuleName
                                );
                                injectHook(binding.path, relative);
                                injected = true;
                            }
                        }
                    },
                });

                if (injected) {
                    this.info('Injected __collectModule in React component');
                    count++;
                    const output = generate.default(ast, {}, code);
                    injectedModules.add(id);
                    return {
                        code: output.code,
                        map: output.map,
                    };
                }
            }

            return null;
        },

        buildEnd() {
            const s = lazyImportedModules.difference(injectedModules);
            for (const z of s) {
                this.info(`${z} was not injected`);
            }
            this.info(`${count} hook calls injected`);
        },
    };
}

function injectHook(path, arg) {
    if (
        t.isFunctionDeclaration(path.node) ||
        t.isArrowFunctionExpression(path.node)
    ) {
        const hookCall = t.expressionStatement(
            t.callExpression(t.identifier(hookFunctionName), [
                // t.memberExpression(
                //   t.metaProperty(t.identifier('import'), t.identifier('meta')),
                //   t.identifier('filename')
                // ),
                t.stringLiteral(arg),
            ])
        );

        path.get('body').unshiftContainer('body', hookCall);
    }
}

function injectImport(ast, importHelper) {
    let alreadyImported = false;

    traverse.default(ast, {
        ImportDeclaration(path) {
            if (path.node.source.value === importHelper) {
                alreadyImported = true;
            }
        },
    });

    if (!alreadyImported) {
        const importDeclaration = t.importDeclaration(
            [
                t.importSpecifier(
                    t.identifier(hookFunctionName),
                    t.identifier(hookFunctionName)
                ),
            ],
            t.stringLiteral(importHelper)
        );

        ast.program.body.unshift(importDeclaration);
    }
}

function isFunctionComponent(node) {
    return (
        t.isFunctionDeclaration(node) ||
        t.isFunctionExpression(node) ||
        t.isArrowFunctionExpression(node)
    );
}

function isLazyExpression(p) {
    // Ensure p.node and p.node.callee exist before proceeding
    if (!p.node || !p.node.callee) {
        return false;
    }

    const callee = p.node.callee;

    // Check if it's a React.lazy expression
    const isReactLazy =
        t.isMemberExpression(callee) &&
        callee.object.name === 'React' &&
        callee.property.name === 'lazy';

    // Check if it's a standalone lazy or lazyWithPreload function call
    const isStandaloneLazy =
        t.isIdentifier(callee) &&
        (callee.name === 'lazy' || callee.name === 'lazyWithPreload');

    // Log the node for debugging

    // Return true if any of the conditions match
    return isReactLazy || isStandaloneLazy;
}

function getRelativePath(filePath) {
    return path.relative(process.cwd(), filePath).replace(/\\/g, '/');
}
