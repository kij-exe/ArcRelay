export class X402Error extends Error {
    public readonly code: string;
  
    constructor(message: string, code = 'X402_ERROR') {
      super(message);
      this.name = this.constructor.name;
      this.code = code;
    }
  }
  
  export class DocsEntryNotFoundError extends X402Error {
    constructor(method: string, url: string) {
      super(`No pricing metadata found for ${method.toUpperCase()} ${url}`, 'DOCS_NOT_FOUND');
    }
  }
  
  export class PaymentOfferMissingError extends X402Error {
    constructor() {
      super('x402 response did not include any payment offers', 'PAYMENT_OFFER_MISSING');
    }
  }
  
  export class UnexpectedResponseError extends X402Error {
    public readonly status: number | undefined;
  
    constructor(message: string, status?: number) {
      super(message, 'UNEXPECTED_RESPONSE');
      this.status = status;
    }
  }
  
  export class WalletNotConfiguredError extends X402Error {
    constructor() {
      super('A wallet signer or payer address is required but was not provided', 'WALLET_NOT_CONFIGURED');
    }
  }