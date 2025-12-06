interface PayStarsOrderRequest {
  order_uuid: string;
  auth_key: string;
  cost: number;
  wallet_type?: string;
}

export function payStarsOrder(this: any, order_uuid: string, cost: number, authKey?: string, walletType?: string) {
  const req: PayStarsOrderRequest = {
    order_uuid,
    auth_key: this.getAuthKey(authKey),
    cost,
    wallet_type: walletType,
  };
  return this.post("/v2/buyStars/pay", req);
}
