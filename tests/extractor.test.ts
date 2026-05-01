import { extractSignatures } from '../src/extractor.js';

describe('AST Extractor (1.3.0 scope)', () => {
  it('supports namespaces and avoids name collisions across namespaces', () => {
    const code = `
      export namespace Auth {
        export function validate(token: string): boolean { return true; }
      }
      export namespace Billing {
        export function validate(token: string): boolean { return false; }
      }
    `;
    const signatures = extractSignatures(code).map((s) => s.fullSignature);
    expect(signatures).toContain('Auth.validate(token: string): boolean');
    expect(signatures).toContain('Billing.validate(token: string): boolean');
  });

  it('supports optional, rest, and default parameters with union/intersection types', () => {
    const code = `
      export function buildConfig(
        req: { id: string } & { role: string },
        mode?: 'safe' | 'fast',
        retries: number = 3,
        ...tags: string[]
      ): string | number {
        return mode ? 1 : 'ok';
      }
    `;
    const signatures = extractSignatures(code);
    expect(signatures[0].parameters.join(', ')).toContain('mode?');
    expect(signatures[0].parameters.join(', ')).toContain('retries =');
    expect(signatures[0].parameters.join(', ')).toContain('...tags');
    expect(signatures[0].fullSignature).toMatch(/: (string \| number|number \| string)/);
    expect(signatures[0].fullSignature).toContain('buildConfig(');
  });

  it('supports enums and exported constants', () => {
    const code = `
      export enum Status {
        Ready = 1,
        Busy
      }
      export const MAX_RETRIES = 5;
    `;
    const signatures = extractSignatures(code).map((s) => s.fullSignature);
    expect(signatures).toContain('enum Status { Ready=1, Busy }');
    expect(signatures).toContain('const MAX_RETRIES = 5');
  });

  it('infers return type when explicit annotation is missing', () => {
    const code = `
      export function compute(flag: boolean) {
        if (flag) return 1;
        return 'fallback';
      }
    `;
    const signatures = extractSignatures(code);
    expect(signatures[0].returnType).toBe(': number | string');
  });

  it('marks deprecated symbols using JSDoc tags', () => {
    const code = `
      /** @deprecated use \`next\` */
      export function legacy(value: string): string {
        return value;
      }
    `;
    const signatures = extractSignatures(code);
    expect(signatures[0].fullSignature.startsWith('[deprecated]')).toBe(true);
  });
});
