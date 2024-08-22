const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

// Sample code to parse
const code = `
import st from 's';
import * as s from 'z';
  const moduleA = import('a');
  const moduleB = import('z');
  const moduleC = import(getModuleName());
  import('moduleD').then(module => console.log(module));
`;

// Parse the code into an AST
const ast = parser.parse(code, {
  sourceType: 'module',
  // plugins: ['dynamicImport'],  // Enable the dynamicImport plugin
});

// Traverse the AST to find Import expressions
traverse(ast, {
  Import(path) {
    const importArgument = path.parent.arguments[0];

    if (importArgument) {
      if (importArgument.type === 'StringLiteral') {
        console.log(`Found dynamic import with value: ${importArgument.value}`);
      } else {
        console.log('Found dynamic import, but the value is dynamically computed');
      }
    }
  }
});