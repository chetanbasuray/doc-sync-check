import { extractSignatures } from '../src/extractor.js';

describe('AST Extractor', () => {
  it('extracts exported function signatures with normalized spacing', () => {
    const code = `
      export function testAuth(
        token: string,
        options?: any
      ): boolean {
        return true;
      }
    `;

    const signatures = extractSignatures(code);
    expect(signatures).toHaveLength(1);
    expect(signatures[0].name).toBe('testAuth');
    expect(signatures[0].parameters).toEqual(['token: string', 'options?: any']);
    expect(signatures[0].returnType).toBe(': boolean');
    expect(signatures[0].fullSignature).toBe('testAuth(token: string, options?: any): boolean');
  });

  it('extracts exported interfaces and includes property types', () => {
    const code = `
      export interface User<TMeta = string> {
        id: number;
        name?: string;
        serialize(format: 'json' | 'text'): string;
      }
    `;

    const signatures = extractSignatures(code);
    expect(signatures).toHaveLength(1);
    expect(signatures[0].name).toBe('User');
    expect(signatures[0].fullSignature).toContain('interface User<TMeta = string>');
    expect(signatures[0].fullSignature).toContain('id: number');
    expect(signatures[0].fullSignature).toContain("serialize(format: 'json' | 'text'): string");
  });

  it('extracts exported classes and skips private methods', () => {
    const code = `
      export class SessionManager<TContext> {
        private secret(v: string): void {}
        public create(id: string): Promise<void> { return Promise.resolve(); }
      }
    `;

    const signatures = extractSignatures(code);
    const full = signatures.map((sig) => sig.fullSignature);
    expect(full).toContain('class SessionManager<TContext>');
    expect(full).toContain('SessionManager.create(id: string): Promise<void>');
    expect(full.join(' ')).not.toContain('secret');
  });

  it('extracts overload and abstract class methods', () => {
    const code = `
      export abstract class Repo {
        abstract find(id: string): Promise<string>;
        find(id: number): Promise<string>;
        find(id: string | number): Promise<string> {
          return Promise.resolve(String(id));
        }
      }
    `;

    const signatures = extractSignatures(code).map((sig) => sig.fullSignature);
    expect(signatures).toContain('Repo.find(id: string): Promise<string>');
    expect(signatures).toContain('Repo.find(id: number): Promise<string>');
    expect(signatures).toContain('Repo.find(id: string | number): Promise<string>');
  });

  it('parses decorators and preserves decorator metadata in signatures', () => {
    const code = `
      function sealed(target: unknown): void {}
      function auditable(): MethodDecorator { return () => undefined; }

      @sealed
      export class BillingService {
        @auditable()
        public charge(amount: number): Promise<boolean> {
          return Promise.resolve(true);
        }
      }
    `;

    const signatures = extractSignatures(code).map((sig) => sig.fullSignature);
    expect(signatures).toContain('@sealed class BillingService');
    expect(signatures).toContain('@auditable() BillingService.charge(amount: number): Promise<boolean>');
  });

  it('extracts exported type aliases including generics', () => {
    const code = `
      export type ApiResponse<T> = {
        data: T;
        error?: string;
      };
    `;

    const signatures = extractSignatures(code);
    expect(signatures).toHaveLength(1);
    expect(signatures[0].name).toBe('ApiResponse');
    expect(signatures[0].fullSignature).toContain('type ApiResponse<T> =');
    expect(signatures[0].fullSignature).toContain('data: T');
  });
});
