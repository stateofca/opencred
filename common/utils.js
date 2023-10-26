import {generateId} from 'bnid';

export const createId = async () => {
  const id = await generateId({
    bitLength: 128,
    encoding: 'base58',
    multibase: true,
    multihash: true
  });
  return id;
};
