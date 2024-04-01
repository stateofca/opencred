#!/bin/bash

domain=http://localhost:22080

curl\
  -H 'Content-Type: application/json'\
  -d @bin/data/vp_token.json\
  -X POST $domain/audit-presentation
