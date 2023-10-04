/* global navigator */
import * as polyfill from 'credential-handler-polyfill';

const recommendedHandlerOrigins = [
  'https://demo.1keep.com/'
];

/**
 * Gets credentials using CHAPI.
 *
 * @param {object} options - The options to use.
 * @param {object} options.queries - The credential queries to use.
 * @param {string} options.challenge - The challenge to use.
 * @param {string} options.domain - The domain to use.
 * @param {object} options.protocols - The protocol URLs to use (vcapi, OID4VP).
 * @returns {Promise} - A promise that resolves after CHAPI has received
 * the credentials.
 */
export async function getCredentials({protocols}) {
  await polyfill.loadOnce();

  if(Object.keys(protocols).length === 0) {
    throw new Error(`protocols is a required field`);
  }
  const options = {
    VerifiablePresentation: {},
    recommendedHandlerOrigins,
    protocols
  };
  return navigator.credentials.get({
    web: options
  });
}
