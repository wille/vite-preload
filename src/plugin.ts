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
    let count = 0;

    return {
        name: 'vite-preload',

        apply(config, { command }) {
            // Enable on SSR builds (--ssr) and dev servers
            return Boolean(config.build?.ssr) || command === 'serve';
        },

        transform(code, id) {
            const relative = getRelativePath(id);

            if (include.test(id) && code.includes('React.lazy')) {
                const ast = parse(code, {
                    sourceType: 'module',
                    plugins: ['jsx', 'typescript'],
                });

                traverse.default(ast, {
                    CallExpression: (path) => {
                        if (
                            t.isMemberExpression(path.node.callee) &&
                            path.node.callee.object.name === 'React' &&
                            path.node.callee.property.name === 'lazy'
                        ) {
                            const argument = path.node.arguments[0];
                            if (t.isArrowFunctionExpression(argument)) {
                                const body = argument.body;
                                if (
                                    t.isCallExpression(body) &&
                                    t.isImport(body.callee)
                                ) {
                                    const modulePath = (
                                        body.arguments[0] as any
                                    ).value;

                                    // Shitty solution but handles index imports and imports with no extensions
                                    lazyImportedModules.add(
                                        modulePath + '.tsx'
                                    );
                                    lazyImportedModules.add(
                                        modulePath + '.jsx'
                                    );
                                    lazyImportedModules.add(
                                        modulePath + '/index.tsx'
                                    );
                                    lazyImportedModules.add(
                                        modulePath + '/index.jsx'
                                    );
                                    lazyImportedModules.add(modulePath);

                                    // Process every module that includes a React.lazy.
                                    lazyImportedModules.add(relative);
                                    this.info(
                                        `${relative} imports ${modulePath}`
                                    );
                                }
                            }
                        }
                    },
                });
            }

            if (lazyImportedModules.has(relative)) {
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
                    this.info('Injected __collectModule');
                    count++;
                    const output = generate.default(ast, {}, code);
                    return {
                        code: output.code,
                        map: output.map,
                    };
                } else {
                    this.warn('Did NOT inject __collectModule');
                }
            }

            return null;
        },

        buildEnd() {
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
    // Check if it's a function declaration or arrow function expression
    return (
        t.isFunctionDeclaration(node) ||
        t.isFunctionExpression(node) ||
        t.isArrowFunctionExpression(node)
    );
}

function getRelativePath(filePath) {
    return path.relative(process.cwd(), filePath).replace(/\\/g, '/');
}
