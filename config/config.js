import * as dotenv from 'dotenv';

dotenv.config();

// export any globals, etc. here as needed
export const client_id = process.env.CLIENT_ID;
export const client_secret = process.env.CLIENT_SECRET;
export const redirect_uri = process.env.REDIRECT_URI;
export const issuer = process.env.ISSUER;
