import expect from 'expect.js';
import {normalizeVpTokenDataIntegrity} from '../../common/utils.js';

describe('normalizeVpTokenDataIntegrity', () => {

  it('it should handle a JSON object and return an array with the \
object', () => {
    const vpObject = {test: 'data'};
    expect(normalizeVpTokenDataIntegrity(vpObject)).to.eql([vpObject]);
  });

  it('it should handle an array of JSON objects', () => {
    const vpObject1 = {test1: 'data1'};
    const vpObject2 = {test2: 'data2'};
    const vpArray = [vpObject1, vpObject2];
    expect(normalizeVpTokenDataIntegrity(vpArray)).to.eql([
      vpObject1,
      vpObject2
    ]);
  });

  it('it should return null for non-string, non-object, and non-array \
inputs', () => {
    const numberInput = 123;
    expect(normalizeVpTokenDataIntegrity(numberInput)).to.equal(null);
  });
});
