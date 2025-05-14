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