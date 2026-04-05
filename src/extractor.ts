import { parse } from '@babel/parser';
import * as babelTraverse from '@babel/traverse';
import type { NodePath } from '@babel/traverse';
import type { ExportNamedDeclaration } from '@babel/types';

const traverse = ((babelTraverse as any).default?.default || (babelTraverse as any).default || babelTraverse) as any;

export interface FunctionSignature {
  name: string;
  parameters: string[];
  returnType: string;
  fullSignature: string;
}

export function extractSignatures(code: string): FunctionSignature[] {
  const signatures: FunctionSignature[] = [];
  
  try {
    const ast = parse(code, {
      sourceType: "module",
      plugins: ["typescript"]
    });

    traverse(ast, {
      // TypeScript now knows this is a type-only reference
      ExportNamedDeclaration(path: NodePath<ExportNamedDeclaration>) {
        const { declaration } = path.node;
        
        if (declaration && declaration.type === 'FunctionDeclaration') {
          const name = declaration.id?.name || 'anonymous';
          
          const parameters = declaration.params.map((param: any) => {
            return code.substring(param.start, param.end);
          });

          const returnType = declaration.returnType
            ? code.substring((declaration.returnType as any).start, (declaration.returnType as any).end)
            : '';

          const fullSignature = `${name}(${parameters.join(', ')})${returnType}`;

          signatures.push({
            name,
            parameters,
            returnType,
            fullSignature,
          });
        }
      }
    });
  } catch (e) {
    console.error("Parsing error:", e);
  }

  return signatures;
}