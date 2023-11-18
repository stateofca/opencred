import {describe, it} from 'mocha';
import {
  normalizeVpTokenDataIntegrity,
  normalizeVpTokenJWT
} from '../common/utils.js';
import expect from 'expect.js';

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

describe('normalizeVpTokenJWT', () => {
  it('it should decode a JWT encoded vp_token and return an array with \
header, payload and jwt', () => {
    const header = Buffer.from(
      JSON.stringify({alg: 'none'})
    ).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({claim: true})
    ).toString('base64url');
    const result = normalizeVpTokenJWT(`${header}.${payload}.b64signature`);
    expect(result[0]).to.have.property('header');
    expect(result[0]).to.have.property('payload');
    expect(result[0]).to.have.property('jwt');
  });

  it('it should handle an array of base64url encoded strings', () => {
    const header = Buffer.from(
      JSON.stringify({alg: 'none'})
    ).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({claim: true})
    ).toString('base64url');
    const jwt = `${header}.${payload}.b64signature`;
    const result = normalizeVpTokenJWT([jwt, jwt]);
    expect(result[0]).to.have.property('header');
    expect(result[0]).to.have.property('payload');
    expect(result[0]).to.have.property('jwt');
    expect(result[1]).to.have.property('header');
    expect(result[1]).to.have.property('payload');
    expect(result[1]).to.have.property('jwt');
  });

  it('it should return null for invalid base64 strings', () => {
    const invalidBase64 = 'invalidBase64';
    expect(normalizeVpTokenJWT(invalidBase64)).to.equal(null);
  });

  it('it should return null for non-string, non-object, and non-array \
inputs', () => {
    const numberInput = 123;
    expect(normalizeVpTokenJWT(numberInput)).to.equal(null);
  });
});
