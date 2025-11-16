import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.CIRCLE_API_KEY;
const entitySecret = process.env.CIRCLE_ENTITY_SECRET;

if (!apiKey || !entitySecret) {
  throw new Error('CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET must be set in environment variables');
}

export const circleClient = initiateDeveloperControlledWalletsClient({
  apiKey,
  entitySecret,
});

