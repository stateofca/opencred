import fs from 'node:fs';
import {httpClient} from '@digitalbazaar/http-client';

const main = async () => {
  const domain = process.argv[2];
  const url = `${domain}/audit-presentation`;
  const vpTokenData = JSON.parse(fs.readFileSync(
    './test/fixtures/audit/vpToken.json'
  ));
  const headers = {'Content-Type': 'application/json'};
  httpClient.extend({headers});

  let auditResponse;
  try {
    const response =
      await httpClient.post(url, {json: vpTokenData});
    auditResponse = response;
  } catch(error) {
    auditResponse = error;
  }

  console.log(JSON.stringify(auditResponse.data, null, 2));
};

main();
