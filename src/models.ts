export class FragmentAPIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FragmentAPIError";
  }
}

export interface BuyStarsRequest {
  username: string;
  amount: number;
  fragment_cookies: string;
  seed: string;
  show_sender?: boolean;
}

export interface BuyStarsWithoutKYCRequest {
  username: string;
  amount: number;
  seed: string;
}

export interface BuyPremiumRequest {
  username: string;
  fragment_cookies: string;
  seed: string;
  duration?: number;
  show_sender?: boolean;
}

export interface BuyPremiumWithoutKYCRequest {
  username: string;
  seed: string;
  duration?: number;
}

export interface GetOrdersRequest {
  seed: string;
  limit?: number;
  offset?: number;
}

export interface CreateAuthKeyRequest {
  fragment_cookies: string;
  seed: string;
}

export interface CreatePremiumOrderRequest {
  username: string;
  duration?: number;
  fragment_cookies: string;
  show_sender?: boolean;
}

export interface CreatePremiumWithoutKYCOrderRequest {
  username: string;
  duration?: number;
}

export interface CreateStarsOrderRequest {
  username: string;
  amount: number;
  fragment_cookies: string;
  show_sender?: boolean;
}

export interface CreateStarsWithoutKYCOrderRequest {
  username: string;
  amount: number;
}

export interface PayPremiumOrderRequest {
  order_uuid: string;
  seed: string;
  fragment_cookies: string;
  cost: number;
  wallet_type?: string;
}

export interface PayPremiumWithoutKYCOrderRequest {
  order_uuid: string;
  seed: string;
  cost: number;
  wallet_type?: string;
}

export interface PayStarsOrderRequest {
  order_uuid: string;
  seed: string;
  fragment_cookies: string;
  cost: number;
  wallet_type?: string;
}

export interface PayStarsWithoutKYCOrderRequest {
  order_uuid: string;
  seed: string;
  cost: number;
  wallet_type?: string;
}