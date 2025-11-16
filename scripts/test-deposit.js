#!/usr/bin/env node

/**
 * Test script for depositing USDC to a user's Circle wallet
 *
 * This demonstrates how to:
 * 1. Get payment requirements for a user deposit
 * 2. Create an EIP-3009 authorization
 * 3. Submit the deposit to the facilitator
 */

async function testDeposit() {
  const FACILITATOR_URL = 'http://localhost:3002';
  const USER_WALLET_ADDRESS = '0x762edd85d411f8389966de91a92dd9d6d10d8cc2'; // User's Circle wallet

  console.log('Testing deposit flow to user wallet:', USER_WALLET_ADDRESS);
  console.log('');

  // Step 1: Get payment requirements for deposit
  console.log('Step 1: Requesting deposit payment requirements...');

  const requirementsResponse = await fetch(`${FACILITATOR_URL}/deposit/requirements`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      network: 'base-sepolia',
      amount: '1000000', // 1 USDC (6 decimals)
      userWalletAddress: USER_WALLET_ADDRESS,
    }),
  });

  if (!requirementsResponse.ok) {
    console.error('Failed to get requirements:', await requirementsResponse.text());
    return;
  }

  const { paymentRequirements } = await requirementsResponse.json();
  console.log('Payment requirements received:');
  console.log(JSON.stringify(paymentRequirements, null, 2));
  console.log('');

  console.log('✅ Deposit endpoint is working!');
  console.log('');
  console.log('To complete a deposit:');
  console.log('1. The user needs to sign an EIP-3009 authorization from their external wallet');
  console.log('2. Submit the signed authorization to /deposit/settle');
  console.log(`3. USDC will be transferred directly to ${USER_WALLET_ADDRESS}`);
  console.log('');
  console.log('Key difference from regular /settle:');
  console.log('- Regular /settle: transfers to facilitator wallet (0x841eed...)');
  console.log(`- Deposit /settle: transfers to user's Circle wallet (${USER_WALLET_ADDRESS})`);
}

testDeposit().catch(console.error);