import { expect } from 'chai';
import { undent } from 'undent';

export function expectOutput(input: string, output: string) {
    expect(undent(input)).to.equal(undent(output));
}