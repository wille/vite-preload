import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import _generate from '@babel/generator';
import * as t from '@babel/types';
import path from 'node:path';
import { Plugin } from 'vite';

function importDefault<T = any>(module: T): T {
    return module['default'] || module;
}

const traverse = importDefault(_traverse);
const generate = importDefault(_generate);

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

        apply(config) {
            // Enable on SSR builds (--ssr)
            return Boolean(config.build?.ssr);
        },

        async transform(code, id) {
            if (!include.test(id)) {
                return null;
            }

            const relative = getRelativePath(id);

            const foundLazyImports = new Set<string>();

            let ast;

            // Find dynamic imports
            if (code.includes(' import(')) {
                ast = parse(code, {
                    sourceType: 'module',
                    plugins: ['jsx', 'typescript'],
                });

                traverse(ast, {
                    Import(path) {
                        if (!path.parent['arguments']) {
                            return;
                        }

                        const importArgument = path.parent['arguments'][0];

                        if (importArgument) {
                            // Dynamic import of a dynamic module is not supported
                            if (importArgument.type === 'StringLiteral') {
                                foundLazyImports.add(importArgument.value);
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
                    `dynamically imports ${path.relative(process.cwd(), resolved.id)}`
                );

                lazyImportedModules.add(resolved.id);
            }

            if (lazyImportedModules.has(id)) {
                let injected = false;

                ast ||= parse(code, {
                    sourceType: 'module',
                    plugins: ['jsx', 'typescript'],
                });

                traverse(ast, {
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
                    const output = generate(ast, {}, code);
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

    traverse(ast, {
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

function getRelativePath(filePath) {
    return path.relative(process.cwd(), filePath).replace(/\\/g, '/');
}
