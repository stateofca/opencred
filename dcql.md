6. Digital Credentials Query Language (DCQL)
The Digital Credentials Query Language (DCQL, pronounced [ˈdakl̩]) is a JSON-encoded query language that allows the Verifier to request Presentations that match the query. The Verifier MAY encode constraints on the combinations of Credentials and claims that are requested. The Wallet evaluates the query against the Credentials it holds and returns Presentations matching the query.

A valid DCQL query is defined as a JSON-encoded object with the following top-level properties:

credentials:
REQUIRED. A non-empty array of Credential Queries as defined in Section 6.1 that specify the requested Credentials.
credential_sets:
OPTIONAL. A non-empty array of Credential Set Queries as defined in Section 6.2 that specifies additional constraints on which of the requested Credentials to return.
Note: Future extensions may define additional properties both at the top level and in the rest of the DCQL data structure. Implementations MUST ignore any unknown properties.

6.1. Credential Query
A Credential Query is an object representing a request for a presentation of one or more matching Credentials.

Each entry in credentials MUST be an object with the following properties:

id:
REQUIRED. A string identifying the Credential in the response and, if provided, the constraints in credential_sets. The value MUST be a non-empty string consisting of alphanumeric, underscore (_), or hyphen (-) characters. Within the Authorization Request, the same id MUST NOT be present more than once.
format:
REQUIRED. A string that specifies the format of the requested Credential. Valid Credential Format Identifier values are defined in Appendix B.
multiple:
OPTIONAL. A boolean which indicates whether multiple Credentials can be returned for this Credential Query. If omitted, the default value is false.
meta:
REQUIRED. An object defining additional properties requested by the Verifier that apply to the metadata and validity data of the Credential. The properties of this object are defined per Credential Format. Examples of those are in Appendix B.3.5 and Appendix B.2.3. If empty, no specific constraints are placed on the metadata or validity of the requested Credential.
trusted_authorities:
OPTIONAL. A non-empty array of objects as defined in Section 6.1.1 that specifies expected authorities or trust frameworks that certify Issuers, that the Verifier will accept. Every Credential returned by the Wallet SHOULD match at least one of the conditions present in the corresponding trusted_authorities array if present.
Note that Verifiers must verify that the issuer of a received presentation is trusted on their own and this feature mainly aims to help data minimization by not revealing information that would likely be rejected.

require_cryptographic_holder_binding:
OPTIONAL. A boolean which indicates whether the Verifier requires a Cryptographic Holder Binding proof. The default value is true, i.e., a Verifiable Presentation with Cryptographic Holder Binding is required. If set to false, the Verifier accepts a Credential without Cryptographic Holder Binding proof.
claims:
OPTIONAL. A non-empty array of objects as defined in Section 6.3 that specifies claims in the requested Credential. Verifiers MUST NOT point to the same claim more than once in a single query. Wallets SHOULD ignore such duplicate claim queries.
claim_sets:
OPTIONAL. A non-empty array containing arrays of identifiers for elements in claims that specifies which combinations of claims for the Credential are requested. The rules for selecting claims to send are defined in Section 6.4.1.
Multiple Credential Queries in a request MAY request a presentation of the same Credential.

6.1.1. Trusted Authorities Query
A Trusted Authorities Query is an object representing information that helps to identify an authority or the trust framework that certifies Issuers. A Credential is identified as a match to a Trusted Authorities Query if it matches with one of the provided values in one of the provided types. How exactly the matching works is defined for the different types below.

Note that direct Issuer matching can also work using claim value matching if supported (e.g., value matching the iss claim in an SD-JWT) if the mechanisms for trusted_authorities are not applicable but might be less likely to work due to the constraints on value matching (see Section 6.4.1 for more details).

Each entry in trusted_authorities MUST be an object with the following properties:

type:
REQUIRED. A string uniquely identifying the type of information about the issuer trust framework. Types defined by this specification are listed below.
values:
REQUIRED. A non-empty array of strings, where each string (value) contains information specific to the used Trusted Authorities Query type that allows the identification of an issuer, a trust framework, or a federation that an issuer belongs to.
Below are descriptions for the different Type Identifiers (string), detailing how to interpret and perform the matching logic for each provided value.

Note that depending on the trusted authorities type used, the underlying mechanisms can have different privacy implications. More detailed privacy considerations for the trusted authorities can be found in Section 15.10.

6.1.1.1. Authority Key Identifier
Type:
"aki"
Value:
Contains the KeyIdentifier of the AuthorityKeyIdentifier as defined in Section 4.2.1.1 of [RFC5280], encoded as base64url. The raw byte representation of this element MUST match with the AuthorityKeyIdentifier element of an X.509 certificate in the certificate chain present in the Credential (e.g., in the header of an mdoc or SD-JWT). Note that the chain can consist of a single certificate and the Credential can include the entire X.509 chain or parts of it.
Below is a non-normative example of such an entry of type aki:

{
  "type": "aki",
  "values": ["s9tIpPmhxdiuNkHMEWNpYim8S8Y"]
}
6.1.1.2. ETSI Trusted List
Type:
"etsi_tl"
Value:
The identifier of a Trusted List as specified in ETSI TS 119 612 [ETSI.TL]. An ETSI Trusted List contains references to other Trusted Lists, creating a list of trusted lists, or entries for Trust Service Providers with corresponding service description and X.509 Certificates. The trust chain of a matching Credential MUST contain at least one X.509 Certificate that matches one of the entries of the Trusted List or its cascading Trusted Lists.
Below is a non-normative example of such an entry of type etsi_tl:

{
  "type": "etsi_tl",
  "values": ["https://lotl.example.com"]
}
6.1.1.3. OpenID Federation
Type:
"openid_federation"
Value:
The Entity Identifier as defined in Section 1 of [OpenID.Federation] that is bound to an entity in a federation. While this Entity Identifier could be any entity in that ecosystem, this entity would usually have the Entity Configuration of a Trust Anchor. A valid trust path, including the given Entity Identifier, must be constructible from a matching credential.
Below is a non-normative example of such an entry of type openid_federation:

{
  "type": "openid_federation",
  "values": ["https://trustanchor.example.com"]
}
6.2. Credential Set Query
A Credential Set Query is an object representing a request for one or more Credentials to satisfy a particular use case with the Verifier.

Each entry in credential_sets MUST be an object with the following properties:

options:
REQUIRED A non-empty array, where each value in the array is a list of Credential Query identifiers representing one set of Credentials that satisfies the use case. The value of each element in the options array is a non-empty array of identifiers which reference elements in credentials.
required:
OPTIONAL A boolean which indicates whether this set of Credentials is required to satisfy the particular use case at the Verifier. If omitted, the default value is true.
Before sending the presentation request, the Verifier SHOULD display to the End-User the purpose, context, or reason for the query to the Wallet.

6.3. Claims Query
Each entry in claims MUST be an object with the following properties:

id:
REQUIRED if claim_sets is present in the Credential Query; OPTIONAL otherwise. A string identifying the particular claim. The value MUST be a non-empty string consisting of alphanumeric, underscore (_), or hyphen (-) characters. Within the particular claims array, the same id MUST NOT be present more than once.
path:
REQUIRED The value MUST be a non-empty array representing a claims path pointer that specifies the path to a claim within the Credential, as defined in Section 7.
values:
OPTIONAL A non-empty array of strings, integers or boolean values that specifies the expected values of the claim. If the values property is present, the Wallet SHOULD return the claim only if the type and value of the claim both match exactly for at least one of the elements in the array. Details of the processing rules are defined in Section 6.4.1.
If a Wallet implements value matching and the Credential being matched is an ISO mdoc-based credential, the CBOR value used for matching MUST first be converted to JSON, following the advice given in Section 6.1 of [RFC8949]. The resulting JSON value is then used to match against the values property as specified above. When conversion according to these rules is not clearly defined, behavior is out of scope of this specification.

6.4. Selecting Claims and Credentials
The following section describes the logic that applies for selecting claims and for selecting credentials.

For formats supporting selective disclosure, these rules support selecting a minimal dataset to fulfill the Verifier's request in a privacy-friendly manner (see Section 15 for additional considerations). Wallets MUST NOT send selectively disclosable claims that have not been selected according to the rules below. A single Presentation of a Credential MAY contain more than the claims selected in the particular DCQL Credential Query if the same Credential is selected with the additional claims in a separate Credential Query in the same request, or the additional claims are not selectively disclosable.

6.4.1. Selecting Claims
The following rules apply for selecting claims via claims and claim_sets:

If claims is absent, the Verifier is requesting no claims that are selectively disclosable; the Wallet MUST return only the claims that are mandatory to present (e.g., SD-JWT and Key Binding JWT for a Credential of format IETF SD-JWT VC).
If claims is present, but claim_sets is absent, the Verifier requests all claims listed in claims.
If both claims and claim_sets are present, the Verifier requests one combination of the claims listed in claim_sets. The order of the options conveyed in the claim_sets array expresses the Verifier's preference for what is returned; the Wallet SHOULD return the first option that it can satisfy. If the Wallet cannot satisfy any of the options, it MUST NOT return any claims.
claim_sets MUST NOT be present if claims is absent.
When a Claims Query contains a restriction on the values of a claim, the Wallet SHOULD NOT return the claim if its value does not match according to the rules for values defined in Section 6.3, i.e., the claim should be treated the same as if it did not exist in the Credential. Implementing this restriction may not be possible in all cases, for example, if the Wallet does not have access to the claim value before presentation or user consent or if another component routing the request to the Wallet does not have access to the claim value. It is ultimately up to the Wallet and/or the End-User if the value matching request is followed. Therefore, Verifiers MUST treat restrictions expressed using values as a best-effort way to improve user privacy, but MUST NOT rely on it for security checks.

The purpose of the claim_sets syntax is to provide a way for a Verifier to describe alternative ways a given Credential can satisfy the request. The array ordering expresses the Verifier's preference for how to fulfill the request. The first element in the array is the most preferred and the last element in the array is the least preferred. Verifiers SHOULD use the principle of least information disclosure to influence how they order these options. For example, a proof of age request should prioritize requesting an attribute like age_over_18 over an attribute like birth_date. The claim_sets syntax is not intended to define options the End-User can choose from, see Section 6.4.3 for more information. The Wallet is recommended to return the first option it can satisfy since that is the preferred option from the Verifier. However, there can be reasons to deviate. Non-exhaustive examples of such reasons are:

scenarios where the Verifier did not order the options to minimize information disclosure
operational reasons why returning a different option than the first option has UX benefits for the Wallet.
If the Wallet cannot deliver all claims requested by the Verifier according to these rules, it MUST NOT return the respective Credential.

For Credential Formats that do not support selective disclosure, the case of both claims and claim_sets being absent is interpreted as requesting a presentation of the "full credential" since all claims are mandatory to present.

6.4.2. Selecting Credentials
The following rules apply for selecting Credentials via credentials and credential_sets:

If credential_sets is not provided, the Verifier requests presentations for all Credentials in credentials to be returned.
Otherwise, the Verifier requests presentations of Credentials to be returned satisfying

all of the Credential Set Queries in the credential_sets array where the required attribute is true or omitted, and
optionally, any of the other Credential Set Queries.
To satisfy a Credential Set Query, the Wallet MUST return presentations of a set of Credentials that match to one of the options inside the Credential Set Query.

Credentials not matching the respective constraints expressed within credentials MUST NOT be returned, i.e., they are treated as if they would not exist in the Wallet.

If the Wallet cannot deliver all non-optional Credentials requested by the Verifier according to these rules, it MUST NOT return any Credential(s).

6.4.3. User Interface Considerations
While this specification provides the mechanisms for requesting different sets of claims and Credentials, it does not define details about the user interface of the Wallet, for example, if and how End-Users can select which combination of Credentials to present. However, it is typically expected that the Wallet presents the End-User with a choice of which Credential(s) to present if multiple of the sets of Credentials in options can satisfy the request.