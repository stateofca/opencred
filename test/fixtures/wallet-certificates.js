/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

// Self-signed EC P-256 key pair + cert for test-only Apple Wallet
// reader-auth fixtures. DO NOT USE IN PRODUCTION.

export const appleWalletTestEntry = {
  wallet: 'apple-wallet',
  id: 'apple-test-2026',
  type: 'ES256',
  privateKeyPem:
`-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgJzn0OwQe2zdjnZZX
+ORnpB9WAKFyqnbdPZ7zkov2t3qhRANCAATNBcrRLNuFbJS7bu9+tdAQo2UXSOFS
jvCVpaORXyXz1iFAE2HbmbXMN7cgLbG3EBpCaaxvwFAmw/nXg/xF9gAc
-----END PRIVATE KEY-----
`,
  publicKeyPem:
`-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEzQXK0SzbhWyUu27vfrXQEKNlF0jh
Uo7wlaWjkV8l89YhQBNh25m1zDe3IC2xtxAaQmmsb8BQJsP514P8RfYAHA==
-----END PUBLIC KEY-----
`,
  certificatePem:
`-----BEGIN CERTIFICATE-----
MIIBwzCCAWmgAwIBAgIUB4b+3Il+B33nuljwfub3Ivai1aMwCgYIKoZIzj0EAwIw
NzEdMBsGA1UEAwwUb3BlbmNyZWQtdGVzdC1yZWFkZXIxFjAUBgNVBAoMDU9wZW5D
cmVkIFRlc3QwHhcNMjYwNDI5MDA1MzA1WhcNMzYwNDI2MDA1MzA1WjA3MR0wGwYD
VQQDDBRvcGVuY3JlZC10ZXN0LXJlYWRlcjEWMBQGA1UECgwNT3BlbkNyZWQgVGVz
dDBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABM0FytEs24VslLtu73610BCjZRdI
4VKO8JWlo5FfJfPWIUATYduZtcw3tyAtsbcQGkJprG/AUCbD+deD/EX2AByjUzBR
MB0GA1UdDgQWBBSwYCyfGO2IAb/UuXhvLGT57qXOKjAfBgNVHSMEGDAWgBSwYCyf
GO2IAb/UuXhvLGT57qXOKjAPBgNVHRMBAf8EBTADAQH/MAoGCCqGSM49BAMCA0gA
MEUCICDgF6hEXDI59fFqBgxdZSlMY1NiRHYAJnIs6Zy4b6J6AiEA+joCqG1LiBpw
R+Wh5s84sXDicWvzWbTRiN4aNHO5r90=
-----END CERTIFICATE-----
`,
  displayName: 'Apple Wallet test reader'
};

export const googleWalletTestEntry = {
  wallet: 'google-wallet',
  id: 'google-test-2026',
  type: 'ES256',
  privateKeyPem: appleWalletTestEntry.privateKeyPem,
  publicKeyPem: appleWalletTestEntry.publicKeyPem,
  certificatePem: appleWalletTestEntry.certificatePem,
  displayName: 'Google Wallet test cert'
};
