import { parse } from '@babel/parser';
import * as traverseModule from '@babel/traverse';
import type { NodePath } from '@babel/traverse';
import type {
  ClassBody,
  ClassMethod,
  ClassPrivateMethod,
  Expression,
  ExportDefaultDeclaration,
  ExportNamedDeclaration,
  FunctionDeclaration,
  Identifier,
  Node,
  PrivateName,
  TSDeclareMethod,
  TSInterfaceBody,
  TSInterfaceDeclaration,
  TSMethodSignature,
  TSPropertySignature,
  TSTypeAliasDeclaration,
} from '@babel/types';

type NodeWithSpan = Node & { start: number | null; end: number | null };
type MaybeTraverse = { default?: unknown; traverse?: unknown };

const normalizeSpace = (value: string): string => value.replace(/\s+/g, ' ').trim();

const sliceSpan = (node: NodeWithSpan, source: string): string => {
  if (node.start == null || node.end == null) return '';
  return normalizeSpace(source.slice(node.start, node.end));
};

const keyName = (key: Identifier | PrivateName): string => {
  if (key.type === 'Identifier') return key.name;
  return key.id.name;
};

const typeParamsText = (node: { typeParameters?: Node | null }, source: string): string => {
  if (!node.typeParameters) return '';
  return sliceSpan(node.typeParameters as NodeWithSpan, source);
};

const typeAnnotationText = (
  node: { typeAnnotation?: Node | null; returnType?: Node | null },
  source: string,
): string => {
  if (node.typeAnnotation) return sliceSpan(node.typeAnnotation as NodeWithSpan, source);
  if (node.returnType) return sliceSpan(node.returnType as NodeWithSpan, source);
  return '';
};

const decoratorsText = (node: { decorators?: Node[] | null }, source: string): string => {
  if (!node.decorators || node.decorators.length === 0) return '';
  const text = node.decorators.map((decorator) => sliceSpan(decorator as NodeWithSpan, source)).join(' ');
  return text ? `${text} ` : '';
};

const methodParams = (params: Node[], source: string): string[] =>
  params.map((param) => sliceSpan(param as NodeWithSpan, source));

const hasIdentifierKey = (key: Expression | Identifier | PrivateName): key is Identifier =>
  key.type === 'Identifier';

const shouldSkipClassMember = (member: ClassMethod | TSDeclareMethod | ClassPrivateMethod): boolean => {
  if (member.type === 'ClassPrivateMethod') return true;
  if ('accessibility' in member && member.accessibility === 'private') return true;
  return false;
};

export interface FunctionSignature {
  name: string;
  parameters: string[];
  returnType: string;
  fullSignature: string;
}

export function extractSignatures(code: string): FunctionSignature[] {
  const signatures: FunctionSignature[] = [];
  const moduleCandidate = traverseModule as unknown as MaybeTraverse;
  const candidates = [
    moduleCandidate.default && (moduleCandidate.default as { default?: unknown }).default,
    moduleCandidate.default,
    moduleCandidate.traverse,
    traverseModule as unknown,
  ];
  const traverse = candidates.find(
    (candidate): candidate is typeof import('@babel/traverse').default => typeof candidate === 'function',
  ) ?? null;

  if (!traverse) {
    console.error('Parsing error: traverse not available');
    return signatures;
  }

  const addSignature = (
    name: string,
    parameters: string[],
    returnType: string,
    prefix = '',
    annotations = '',
  ): void => {
    const normalizedReturn = normalizeSpace(returnType);
    const combined = `${annotations}${prefix}${name}(${parameters.join(', ')})${normalizedReturn}`;
    signatures.push({
      name,
      parameters,
      returnType: normalizedReturn,
      fullSignature: normalizeSpace(combined),
    });
  };

  const addInterfaceSignatures = (declaration: TSInterfaceDeclaration): void => {
    const ifaceName = `${declaration.id.name}${typeParamsText(declaration, code)}`;
    const body = declaration.body as TSInterfaceBody;
    const props: string[] = [];

    body.body.forEach((member) => {
      if (member.type === 'TSPropertySignature') {
        const property = member as TSPropertySignature;
        if (!hasIdentifierKey(property.key)) return;
        const optional = property.optional ? '?' : '';
        const propertyType = typeAnnotationText(property as unknown as { typeAnnotation?: Node | null }, code);
        props.push(`${property.key.name}${optional}${propertyType}`);
      }

      if (member.type === 'TSMethodSignature') {
        const method = member as TSMethodSignature;
        if (!hasIdentifierKey(method.key)) return;
        const optional = method.optional ? '?' : '';
        const params = methodParams(method.parameters as unknown as Node[], code);
        const returnType = typeAnnotationText(method as unknown as { typeAnnotation?: Node | null }, code);
        props.push(`${method.key.name}${optional}(${params.join(', ')})${returnType}`);
      }
    });

    signatures.push({
      name: declaration.id.name,
      parameters: props,
      returnType: '',
      fullSignature: normalizeSpace(`interface ${ifaceName} { ${props.join('; ')} }`),
    });
  };

  const addClassSignatures = (className: string, body: ClassBody): void => {
    body.body.forEach((member) => {
      if (member.type !== 'ClassMethod' && member.type !== 'TSDeclareMethod') return;
      if (shouldSkipClassMember(member)) return;
      if (member.kind === 'constructor' || member.kind === 'get' || member.kind === 'set') return;
      if (!hasIdentifierKey(member.key)) return;

      const params = methodParams(member.params as Node[], code);
      const returnType = typeAnnotationText(member as unknown as { returnType?: Node | null }, code);
      const annotations = decoratorsText(member as unknown as { decorators?: Node[] | null }, code);
      addSignature(`${className}.${keyName(member.key)}`, params, returnType, '', annotations);
    });
  };

  const handleDeclaration = (declaration: Node | null | undefined): void => {
    if (!declaration) return;

    if (declaration.type === 'FunctionDeclaration') {
      const fnDecl = declaration as FunctionDeclaration;
      addSignature(
        fnDecl.id?.name ?? 'anonymous',
        methodParams(fnDecl.params as Node[], code),
        typeAnnotationText(fnDecl as unknown as { returnType?: Node | null }, code),
      );
      return;
    }

    if (declaration.type === 'TSInterfaceDeclaration') {
      addInterfaceSignatures(declaration as TSInterfaceDeclaration);
      return;
    }

    if (declaration.type === 'ClassDeclaration' && declaration.id) {
      const className = `${declaration.id.name}${typeParamsText(declaration, code)}`;
      const annotations = decoratorsText(declaration as unknown as { decorators?: Node[] | null }, code);
      signatures.push({
        name: declaration.id.name,
        parameters: [],
        returnType: '',
        fullSignature: normalizeSpace(`${annotations}class ${className}`),
      });
      addClassSignatures(declaration.id.name, declaration.body);
      return;
    }

    if (declaration.type === 'TSTypeAliasDeclaration') {
      const typeDecl = declaration as TSTypeAliasDeclaration;
      const typeName = `${typeDecl.id.name}${typeParamsText(typeDecl, code)}`;
      const rhs = sliceSpan(typeDecl.typeAnnotation as NodeWithSpan, code);
      signatures.push({
        name: typeDecl.id.name,
        parameters: [],
        returnType: '',
        fullSignature: normalizeSpace(`type ${typeName} = ${rhs}`),
      });
    }
  };

  try {
    const ast = parse(code, {
      sourceType: 'module',
      plugins: ['typescript', 'decorators-legacy'],
    });

    traverse(ast, {
      ExportNamedDeclaration(path: NodePath<ExportNamedDeclaration>) {
        handleDeclaration(path.node.declaration);
      },
      ExportDefaultDeclaration(path: NodePath<ExportDefaultDeclaration>) {
        handleDeclaration(path.node.declaration as Node);
      },
    });
  } catch (error) {
    console.error('Parsing error:', error);
  }

  return signatures;
}
