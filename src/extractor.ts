import { parseSync } from '@swc/core';

type Span = { start: number; end: number };
type AstNode = { type?: string; span?: Span; [key: string]: unknown };

const normalizeSpace = (value: string): string => value.replace(/\s+/g, ' ').trim();

const sliceSpan = (span: Span | undefined, source: string): string => {
  if (!span) return '';
  const start = Math.max(0, span.start - 1);
  const end = Math.max(start, span.end - 1);
  return normalizeSpace(source.slice(start, end));
};

const hasDeprecatedTag = (span: Span | undefined, source: string): boolean => {
  if (!span) return false;
  const start = Math.max(0, span.start - 600);
  const end = Math.max(0, span.start - 1);
  const leading = source.slice(start, end);
  return /@deprecated/i.test(leading);
};

const inferReturnType = (fn: AstNode | undefined): string => {
  const body = (fn?.body as AstNode | undefined)?.stmts as AstNode[] | undefined;
  if (!body || body.length === 0) return '';

  const kinds = new Set<string>();
  const addKindFromExpression = (node: AstNode | undefined): void => {
    if (!node) return;
    if (node.type === 'StringLiteral') kinds.add('string');
    else if (node.type === 'NumericLiteral') kinds.add('number');
    else if (node.type === 'BooleanLiteral') kinds.add('boolean');
    else if (node.type === 'NullLiteral') kinds.add('null');
    else if (node.type === 'ArrayExpression') kinds.add('unknown[]');
    else if (node.type === 'ObjectExpression') kinds.add('Record<string, unknown>');
    else kinds.add('unknown');
  };
  const visit = (node: AstNode | undefined): void => {
    if (!node) return;
    if (node.type === 'ReturnStatement') {
      const arg = node.argument as AstNode | undefined;
      if (!arg) {
        kinds.add('void');
        return;
      }
      if (arg.type === 'ConditionalExpression') {
        addKindFromExpression(arg.consequent as AstNode | undefined);
        addKindFromExpression(arg.alternate as AstNode | undefined);
        return;
      }
      addKindFromExpression(arg);
      return;
    }
    Object.values(node).forEach((value) => {
      if (!value) return;
      if (Array.isArray(value)) {
        value.forEach((item) => {
          if (item && typeof item === 'object') visit(item as AstNode);
        });
        return;
      }
      if (typeof value === 'object') visit(value as AstNode);
    });
  };

  body.forEach((statement) => visit(statement));

  if (kinds.size === 0) return '';
  if (kinds.size === 1) return `: ${[...kinds][0]}`;
  return `: ${[...kinds].sort().join(' | ')}`;
};

const getIdentifierName = (node: AstNode | undefined): string | null => {
  if (!node) return null;
  if (node.type === 'Identifier') return String(node.value);
  if (node.type === 'PrivateName') {
    const id = node.id as AstNode | undefined;
    if (id?.type === 'Identifier') return String(id.value);
  }
  return null;
};

const getParamText = (parameter: AstNode, source: string): string => {
  const full = sliceSpan(parameter.span, source).replace(/,$/, '');
  if (full) return full;

  const pattern = (parameter.pat as AstNode | undefined) ?? parameter;
  const fromIdentifier = (node: AstNode): string => {
    const name = getIdentifierName(node) ?? sliceSpan(node.span, source);
    const optional = node.optional ? '?' : '';
    const typeAnnotation = sliceSpan((node.typeAnnotation as AstNode | undefined)?.span, source);
    return normalizeSpace(`${name}${optional}${typeAnnotation}`);
  };

  if (pattern.type === 'Identifier') return fromIdentifier(pattern);
  if (pattern.type === 'AssignmentPattern') {
    const left = pattern.left as AstNode | undefined;
    const right = pattern.right as AstNode | undefined;
    return normalizeSpace(`${left ? fromIdentifier(left) : ''} = ${sliceSpan(right?.span, source)}`);
  }
  if (pattern.type === 'RestElement') {
    const arg = pattern.argument as AstNode | undefined;
    const argName = arg ? fromIdentifier(arg) : sliceSpan(pattern.span, source);
    const typeAnnotation = sliceSpan((pattern.typeAnnotation as AstNode | undefined)?.span, source);
    return normalizeSpace(`...${argName}${typeAnnotation}`);
  }

  return sliceSpan(parameter.span, source).replace(/,$/, '');
};

const decoratorsText = (node: AstNode, source: string): string => {
  const decorators = node.decorators as AstNode[] | undefined;
  if (!decorators || decorators.length === 0) return '';
  const text = decorators.map((d) => sliceSpan(d.span, source)).filter(Boolean).join(' ');
  return text ? `${text} ` : '';
};

const formatDeprecated = (deprecated: boolean, signature: string): string =>
  deprecated ? `[deprecated] ${signature}` : signature;
const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface FunctionSignature {
  name: string;
  parameters: string[];
  returnType: string;
  fullSignature: string;
}

export function extractSignatures(code: string): FunctionSignature[] {
  const signatures: FunctionSignature[] = [];
  let moduleAst: AstNode;

  try {
    moduleAst = parseSync(code, {
      syntax: 'typescript',
      decorators: true,
      target: 'es2022',
      comments: true,
    }) as unknown as AstNode;
  } catch (error) {
    console.error('Parsing error:', error);
    return signatures;
  }

  const addSignature = (
    name: string,
    params: string[],
    explicitReturn: string,
    deprecated: boolean,
    prefix = '',
    annotations = '',
    fallbackFn?: AstNode,
  ): void => {
    const returnType = explicitReturn || inferReturnType(fallbackFn);
    const combined = normalizeSpace(`${annotations}${prefix}${name}(${params.join(', ')})${returnType}`);
    signatures.push({
      name,
      parameters: params,
      returnType: normalizeSpace(returnType),
      fullSignature: formatDeprecated(deprecated, combined),
    });
  };

  const addTypeAlias = (declaration: AstNode, prefix = ''): void => {
    const id = declaration.id as AstNode | undefined;
    const typeName = getIdentifierName(id) ?? 'anonymousType';
    const typeParams = sliceSpan((declaration.typeParams as AstNode | undefined)?.span, code);
    const rhs = sliceSpan((declaration.typeAnnotation as AstNode | undefined)?.span, code);
    const deprecated = hasDeprecatedTag(declaration.span, code);
    const signature = normalizeSpace(`type ${prefix}${typeName}${typeParams} = ${rhs}`);
    signatures.push({
      name: `${prefix}${typeName}`,
      parameters: [],
      returnType: '',
      fullSignature: formatDeprecated(deprecated, signature),
    });
  };

  const addEnum = (declaration: AstNode, prefix = ''): void => {
    const id = declaration.id as AstNode | undefined;
    const enumName = getIdentifierName(id) ?? 'AnonymousEnum';
    const members = ((declaration.members as AstNode[] | undefined) ?? []).map((member) => {
      const key = getIdentifierName(member.id as AstNode | undefined) ?? sliceSpan((member.id as AstNode | undefined)?.span, code);
      const initNode = member.init as AstNode | undefined;
      const value = sliceSpan(initNode?.span, code) || String((initNode as { raw?: string; value?: unknown } | undefined)?.raw ?? (initNode as { value?: unknown } | undefined)?.value ?? '');
      return value ? `${key}=${value}` : key;
    });
    const deprecated = hasDeprecatedTag(declaration.span, code);
    const signature = normalizeSpace(`enum ${prefix}${enumName} { ${members.join(', ')} }`);
    signatures.push({
      name: `${prefix}${enumName}`,
      parameters: [],
      returnType: '',
      fullSignature: formatDeprecated(deprecated, signature),
    });
  };

  const addVariable = (declaration: AstNode, prefix = ''): void => {
    const kind = String(declaration.kind ?? 'const');
    const declarations = (declaration.declarations as AstNode[] | undefined) ?? [];
    declarations.forEach((item) => {
      const id = item.id as AstNode | undefined;
      if (id?.type !== 'Identifier') return;
      const init = sliceSpan((item.init as AstNode | undefined)?.span, code);
      const fallbackInit = String(
        ((item.init as { raw?: string; value?: unknown } | undefined)?.raw ??
          (item.init as { value?: unknown } | undefined)?.value ??
          ''),
      );
      const typeAnnotation = sliceSpan((id.typeAnnotation as AstNode | undefined)?.span, code);
      const deprecated = hasDeprecatedTag(item.span ?? declaration.span, code);
      const resolvedInit = init || fallbackInit;
      const signature = normalizeSpace(`${kind} ${prefix}${String(id.value)}${typeAnnotation}${resolvedInit ? ` = ${resolvedInit}` : ''}`);
      signatures.push({
        name: `${prefix}${String(id.value)}`,
        parameters: [],
        returnType: '',
        fullSignature: formatDeprecated(deprecated, signature),
      });
    });
  };

  const addInterface = (declaration: AstNode, prefix = ''): void => {
    const id = declaration.id as AstNode | undefined;
    const ifaceName = getIdentifierName(id) ?? 'AnonymousInterface';
    const typeParams = sliceSpan((declaration.typeParams as AstNode | undefined)?.span, code);
    const body = (declaration.body as AstNode | undefined)?.body as AstNode[] | undefined;
    const members: string[] = [];

    (body ?? []).forEach((member) => {
      if (member.type === 'TsPropertySignature') {
        members.push(sliceSpan(member.span, code));
      } else if (member.type === 'TsMethodSignature') {
        members.push(sliceSpan(member.span, code));
      } else if (member.type === 'TsIndexSignature') {
        members.push(sliceSpan(member.span, code));
      }
    });

    const deprecated = hasDeprecatedTag(declaration.span, code);
    const signature = normalizeSpace(`interface ${prefix}${ifaceName}${typeParams} { ${members.join('; ')} }`);
    signatures.push({
      name: `${prefix}${ifaceName}`,
      parameters: members,
      returnType: '',
      fullSignature: formatDeprecated(deprecated, signature),
    });
  };

  const addClass = (declaration: AstNode, prefix = ''): void => {
    const id = declaration.identifier as AstNode | undefined;
    const className = getIdentifierName(id) ?? 'AnonymousClass';
    const typeParams = sliceSpan((declaration.typeParams as AstNode | undefined)?.span, code);
    const annotations = decoratorsText(declaration, code);
    const deprecated = hasDeprecatedTag(declaration.span, code);
    const classSignature = normalizeSpace(`${annotations}class ${prefix}${className}${typeParams}`);
    signatures.push({
      name: `${prefix}${className}`,
      parameters: [],
      returnType: '',
      fullSignature: formatDeprecated(deprecated, classSignature),
    });

    const members = (declaration.body as AstNode[] | undefined) ?? [];
    members.forEach((member) => {
      if (member.type !== 'ClassMethod') return;
      const accessibility = member.accessibility as string | undefined;
      if (accessibility === 'private') return;
      const methodName = getIdentifierName(member.key as AstNode | undefined);
      if (!methodName) return;
      const params = ((member.function as AstNode | undefined)?.params as AstNode[] | undefined) ?? [];
      const parameterTexts = params.map((param) => getParamText(param, code));
      const explicitReturn = sliceSpan(((member.function as AstNode | undefined)?.returnType as AstNode | undefined)?.span, code);
      const memberDeprecated = hasDeprecatedTag(member.span, code);
      const memberAnnotations = decoratorsText(member, code);
      addSignature(
        `${prefix}${className}.${methodName}`,
        parameterTexts,
        explicitReturn,
        memberDeprecated,
        '',
        memberAnnotations,
        member.function as AstNode | undefined,
      );
    });
  };

  const addFunction = (declaration: AstNode, prefix = ''): void => {
    const id = declaration.identifier as AstNode | undefined;
    const fnName = getIdentifierName(id) ?? 'anonymous';
    const params = (declaration.params as AstNode[] | undefined) ?? [];
    const parameterTexts = params.map((param) => getParamText(param, code));
    const explicitReturn = sliceSpan((declaration.returnType as AstNode | undefined)?.span, code);
    const deprecated =
      hasDeprecatedTag(declaration.span, code) ||
      new RegExp(`/\\*\\*[\\s\\S]{0,500}@deprecated[\\s\\S]{0,500}\\*/\\s*export\\s+function\\s+${escapeRegExp(fnName)}\\b`, 'i').test(code);
    addSignature(`${prefix}${fnName}`, parameterTexts, explicitReturn, deprecated, '', '', declaration);
  };

  const handleDeclaration = (declaration: AstNode | undefined, namespacePrefix = ''): void => {
    if (!declaration) return;
    if (declaration.type === 'FunctionDeclaration') {
      addFunction(declaration, namespacePrefix);
      return;
    }
    if (declaration.type === 'ClassDeclaration') {
      addClass(declaration, namespacePrefix);
      return;
    }
    if (declaration.type === 'TsInterfaceDeclaration') {
      addInterface(declaration, namespacePrefix);
      return;
    }
    if (declaration.type === 'TsTypeAliasDeclaration') {
      addTypeAlias(declaration, namespacePrefix);
      return;
    }
    if (declaration.type === 'TsEnumDeclaration') {
      addEnum(declaration, namespacePrefix);
      return;
    }
    if (declaration.type === 'VariableDeclaration') {
      addVariable(declaration, namespacePrefix);
      return;
    }
    if (declaration.type === 'TsModuleDeclaration') {
      const namespaceName = getIdentifierName(declaration.id as AstNode | undefined) ?? 'namespace';
      const nextPrefix = `${namespacePrefix}${namespaceName}.`;
      const body = declaration.body as AstNode | undefined;
      if (!body) return;
      if (body.type === 'TsModuleBlock') {
        const items = (body.body as AstNode[] | undefined) ?? [];
        items.forEach((item) => {
          if (item.type === 'ExportDeclaration') {
            handleDeclaration(item.declaration as AstNode | undefined, nextPrefix);
          }
        });
      }
    }
  };

  const body = (moduleAst.body as AstNode[] | undefined) ?? [];
  body.forEach((item) => {
    if (item.type === 'ExportDeclaration') {
      handleDeclaration(item.declaration as AstNode | undefined);
    } else if (item.type === 'ExportDefaultDeclaration') {
      handleDeclaration(item.decl as AstNode | undefined);
    }
  });

  return signatures;
}
