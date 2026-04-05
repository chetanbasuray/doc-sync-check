import { extractSignatures } from '../src/extractor.js';

describe('AST Extractor', () => {
  it('should correctly extract function name and parameters', () => {
    const code = `
      export function testAuth(token: string, options?: any): boolean {
        return true;
      }
    `;
    const signatures = extractSignatures(code);
    expect(signatures).toHaveLength(1);
    expect(signatures[0].name).toBe('testAuth');
    expect(signatures[0].parameters).toEqual(['token: string', 'options?: any']);
    expect(signatures[0].returnType).toBe(': boolean');
  });

  it('should correctly assemble the full signature string', () => {
    const code = `
      export function getUser(id: number): any {
        return { name: "Test" };
      }
    `;
    const signatures = extractSignatures(code);
    expect(signatures[0].fullSignature).toBe('getUser(id: number): any');
  });
});
