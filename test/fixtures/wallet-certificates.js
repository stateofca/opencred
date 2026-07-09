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

// Google Wallet fixture whose leaf cert carries the Verifier Registrar
// binding extension 1.3.6.1.4.1.11129.10.1 for the rpMetadataBytes
// below. Self-signed, test-only. DO NOT USE IN PRODUCTION.
export const googleWalletMetadataBoundEntry = {
  wallet: 'google-wallet',
  id: 'google-metadata-bound-2026',
  type: 'ES256',
  displayName: 'Google Wallet metadata-bound test cert',
  privateKeyPem:
`-----BEGIN EC PRIVATE KEY-----
MHcCAQEEIBJgxOLfklmQJL/X66k46437uT5zaMpYZh8i4tuc5VHKoAoGCCqGSM49
AwEHoUQDQgAEN+lqLhWMGyQPEd+U+PqdyZgM9yBjuwJhDmx5dCLfANNdDZ3B9eY5
b8C3W0sEoN03TsVR+WuUeMY7Z1csXI8CyA==
-----END EC PRIVATE KEY-----
`,
  certificatePem:
`-----BEGIN CERTIFICATE-----
MIIBkDCCATWgAwIBAgIUQW/JFyN9UKhJMvPTzIQZTybPvQQwCgYIKoZIzj0EAwIw
HjEcMBoGA1UEAwwTR1cgUlAgTWV0YWRhdGEgVGVzdDAeFw0yNjA3MDkxOTQ3MDBa
Fw0yNjA4MDgxOTQ3MDBaMB4xHDAaBgNVBAMME0dXIFJQIE1ldGFkYXRhIFRlc3Qw
WTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAAQ36WouFYwbJA8R35T4+p3JmAz3IGO7
AmEObHl0It8A010NncH15jlvwLdbSwSg3TdOxVH5a5R4xjtnVyxcjwLIo1EwTzAM
BgNVHRMBAf8EAjAAMA4GA1UdDwEB/wQEAwIHgDAvBgkrBgEEAdZ5CgEEIgQgKRHy
bhlattcjImvYr1RqayR4R+V5DaT6aXp5FRCOhgAwCgYIKoZIzj0EAwIDSQAwRgIh
AKu3oQuR6/X+sLqR39zVkTBhxJw825toqhzYG7WOtK9UAiEA5JcYIvR5NYvHqMn4
7QwvfwpmUMVdOqGDZyyWYsNKvp0=
-----END CERTIFICATE-----
`,
  google: {
    rpMetadataBytes:
      '2BhYyqJuc2NoZW1hX3ZlcnNpb25idjFnZGlzcGxheaNsZGlzcGxheV9uYW1l' +
      'dERCLUNhRE1WIFFBIFZlcmlmaWVyaGxvZ29fdXJpeEdodHRwczovL3d3dy5k' +
      'aWdpdGFsYmF6YWFyLmNvbS9hc3NldHMvaW1hZ2VzL2RpZ2l0YWwtYmF6YWFy' +
      'LWxvZ290eXBlLnN2Z3Jwcml2YWN5X3BvbGljeV91cml4JWh0dHBzOi8vd3d3' +
      'LmRpZ2l0YWxiYXphYXIuY29tL3ByaXZhY3k'
  }
};
