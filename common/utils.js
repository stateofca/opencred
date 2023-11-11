import {verify, verifyCredential} from '@digitalbazaar/vc';
import {generateId} from 'bnid';

export const createId = async (bitLength = 128) => {
  const id = await generateId({
    bitLength,
    encoding: 'base58',
    multibase: true,
    multihash: true
  });
  return id;
};

export const verifyUtils = {
  verify: async args => verify(args),
  verifyCredential: async args => verifyCredential(args)
};
