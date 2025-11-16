const { 
  generateEntitySecret, 
  registerEntitySecretCiphertext,
  initiateDeveloperControlledWalletsClient 
} = require('@circle-fin/developer-controlled-wallets');
const dotenv = require('dotenv');
const { mkdirSync } = require('fs');
const { join } = require('path');

dotenv.config();

const API_KEY = process.env.CIRCLE_API_KEY;
const ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET;

if (!API_KEY || !ENTITY_SECRET) {
  console.error('❌ Error: CIRCLE_API_KEY environment variable is required');
  console.error('Please set CIRCLE_API_KEY in your .env file');
  process.exit(1);
}

async function registerEntityAndCreateWalletSet() {
  try {
    console.log('🚀 Starting Entity Secret registration and Wallet Set creation...\n');

    // Step 1: Generate Entity Secret
    console.log('📝 Step 1: Generating Entity Secret...');
    const entitySecret = ENTITY_SECRET;
    console.log('✅ Entity Secret generated successfully');
    console.log(`   Entity Secret: ${entitySecret}\n`);

    // Step 2: Register Entity Secret
    console.log('🔐 Step 2: Registering Entity Secret...');
    // Create recovery file directory if it doesn't exist

    console.log('✅ Entity Secret registered successfully');

    // Step 3: Initialize Circle SDK client
    console.log('🔧 Step 3: Initializing Circle SDK client...');
    const circleClient = initiateDeveloperControlledWalletsClient({
      apiKey: API_KEY,
      entitySecret: entitySecret,
    });
    console.log('✅ Circle SDK client initialized\n');

    // Step 4: Create Wallet Set
    console.log('💼 Step 4: Creating Wallet Set...');
    const walletSetResponse = await circleClient.createWalletSet({
      name: 'ArcRelay Wallet Set',
    });

    if (!walletSetResponse.data?.walletSet) {
      throw new Error('Failed to create wallet set: No data returned');
    }

    const walletSet = walletSetResponse.data.walletSet;
    console.log('✅ Wallet Set created successfully\n');

    // Output summary
    console.log('='.repeat(60));
    console.log('📋 REGISTRATION SUMMARY');
    console.log('='.repeat(60));
    console.log('\n🔑 Entity Secret:');
    console.log(`   ${entitySecret}`);
    console.log('\n💼 Wallet Set:');
    console.log(`   ID: ${walletSet.id}`);
    console.log(`   Name: ${walletSet.name || 'ArcRelay Wallet Set'}`);
    console.log(`   Custody Type: ${walletSet.custodyType}`);
    console.log(`   Created: ${walletSet.createDate}`);
    console.log(`   Updated: ${walletSet.updateDate}`);
    console.log('\n' + '='.repeat(60));
    console.log('\n⚠️  IMPORTANT: Save these values securely!');
    console.log('   1. Entity Secret - Store in a password manager');
    console.log('   2. Recovery File - Store in a safe, separate location');
    console.log('   3. Wallet Set ID - Add to your .env file as CIRCLE_WALLET_SET_ID');
    console.log('\n📝 Add to your .env file:');
    console.log(`   CIRCLE_ENTITY_SECRET=${entitySecret}`);
    console.log(`   CIRCLE_WALLET_SET_ID=${walletSet.id}`);
    console.log('\n✅ Registration complete!\n');

  } catch (error) {
    console.error('\n❌ Error during registration:');
    console.error(error);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    process.exit(1);
  }
}

registerEntityAndCreateWalletSet();

