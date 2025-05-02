import { parse } from '@babel/parser';
import _traverse, { NodePath } from '@babel/traverse';
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
    /**
     * Internal
     */
    __internal_importHelperModuleName?: string;

    /**
     * Enables extensive build logs
     */
    debug?: boolean;
}

const hookFunctionName = '__collectModule';

// Modules to scan for dynamic imports
const include = /\.(jsx?|tsx?)$/;

// Dynamically import modules to try to inject hook into
const includeJsx = /\.(jsx|tsx)$/;

export default function preloadPlugin({
    __internal_importHelperModuleName = 'vite-preload/__internal',
    debug,
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

                if (!includeJsx.test(resolved.id)) {
                    continue;
                }

                if (debug) {
                    this.info(
                        `dynamically imports ${path.relative(process.cwd(), resolved.id)}`
                    );
                }

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
                        if (isReactFunctionComponent(declaration)) {
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
                            if (binding) {
                                // Right here we need to check if the binding is a declarator for the ArrowFunctionExpression. 
                                // This code creates the correct NodePath for the if statement and the injectHook function.
                                const expressionPath = t.isVariableDeclarator(binding.path.node) ? (binding.path as NodePath<t.VariableDeclarator>).get('init') : binding.path;
                                if (expressionPath.node && isReactFunctionComponent(expressionPath.node)) {
                                    injectImport(
                                        ast,
                                        __internal_importHelperModuleName
                                    );
                                    injectHook(expressionPath as NodePath, relative);
                                    injected = true;
                                }
                            }
                        }
                    },
                });

                if (injected) {
                    if (debug) {
                        this.info(
                            'Injected __collectModule in React component'
                        );
                    }
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
            if (debug) {
                const s = lazyImportedModules.difference(injectedModules);
                for (const z of s) {
                    this.warn(`${z} was not injected`);
                }
            }
            this.info(`${count} hook calls injected`);
        },
    };
}

function injectHook(path: NodePath, arg: string) {
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

        const bodyList = path.get('body');
        const body = Array.isArray(bodyList) ? bodyList[0] : bodyList;
        // While function declarations only have a block statement as body,
        // arrow functions allow both.
        if (t.isBlockStatement(body.node)) {
            (body as NodePath<t.BlockStatement>).unshiftContainer('body', hookCall);
        } else if (t.isExpression(body.node)) {
            path.set("body", t.blockStatement([
                hookCall,
                t.returnStatement(body.node)
            ]));
        }
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

function isReactFunctionComponent(node: t.Node) {
    return (
        t.isFunctionDeclaration(node) ||
        t.isFunctionExpression(node) ||
        t.isArrowFunctionExpression(node)
    );
}

function getRelativePath(filePath) {
    return path.relative(process.cwd(), filePath).replace(/\\/g, '/');
}
