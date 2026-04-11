import { parse } from '@babel/parser';
import * as babelTraverse from '@babel/traverse';
import type { NodePath } from '@babel/traverse';
import type { ExportNamedDeclaration, FunctionDeclaration, Node } from '@babel/types';

// Normalize ESM/CJS interop while keeping typing for traverse
const traverseCandidate = (babelTraverse as any).default?.default
  ?? (babelTraverse as any).default
  ?? (babelTraverse as any);
const traverse = traverseCandidate as typeof babelTraverse.default;

type NodeWithSpan = Node & { start: number | null; end: number | null };

const sliceSpan = (node: NodeWithSpan, source: string): string => {
  if (node.start == null || node.end == null) return '';
  return source.slice(node.start, node.end);
};

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
      ExportNamedDeclaration(path: NodePath<ExportNamedDeclaration>) {
        const { declaration } = path.node;
        
        if (declaration && declaration.type === 'FunctionDeclaration') {
          const fnDecl = declaration as FunctionDeclaration;
          const name = fnDecl.id?.name ?? 'anonymous';
          
          const parameters = fnDecl.params.map((param) => sliceSpan(param as NodeWithSpan, code));

          const returnType = fnDecl.returnType
            ? sliceSpan(fnDecl.returnType as unknown as NodeWithSpan, code)
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
