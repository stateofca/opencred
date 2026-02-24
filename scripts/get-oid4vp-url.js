/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {decodeJwt} from 'jose';

const main = async () => {
  let launchUrl = process.argv[2];
  if(!launchUrl) {
    console.error('Usage: node scripts/get-oid4vp-url.js ' +
      '"openid4vp://?client_id=...&request_uri=..."');
    process.exit(1);
  }

  try {
    // Check if this is an interaction URL (http/https with iuv=1)
    const initialUrl = new URL(launchUrl);
    const isInteractionUrl = (initialUrl.protocol === 'http:' ||
      initialUrl.protocol === 'https:') &&
      initialUrl.searchParams.get('iuv') === '1';

    if(isInteractionUrl) {
      // Fetch the interaction URL
      const interactionResponse = await fetch(launchUrl);
      if(!interactionResponse.ok) {
        throw new Error(
          `HTTP error fetching interaction URL! status: ${
            interactionResponse.status}`);
      }

      // Parse JSON response and extract OID4VP value
      const interactionData = await interactionResponse.json();
      if(!interactionData.protocols?.OID4VP ||
        typeof interactionData.protocols.OID4VP !== 'string') {
        throw new Error(
          'OID4VP key not found or is not a string in interaction response');
      }

      // Use the extracted OID4VP URL as the launch URL
      launchUrl = interactionData.protocols.OID4VP;
      console.log('Extracted OID4VP URL from interaction:', launchUrl);
    }

    // Parse the launch URL and extract request_uri parameter
    const url = new URL(launchUrl);
    const requestUri = url.searchParams.get('request_uri');

    if(!requestUri) {
      throw new Error('request_uri parameter not found in launch URL');
    }

    // Decode the URL-encoded request_uri
    const decodedRequestUri = decodeURIComponent(requestUri);
    console.log('Decoded request_uri:', decodedRequestUri);

    // Fetch the URL
    const response = await fetch(decodedRequestUri);
    if(!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // Get the JWT string
    const jwtString = await response.text();
    console.log('\nJWT string:');
    console.log(jwtString);

    // Decode the JWT and log the payload
    const payload = decodeJwt(jwtString);
    console.log('\nJWT payload:');
    console.log(JSON.stringify(payload, null, 2));
  } catch(error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
};

main();

