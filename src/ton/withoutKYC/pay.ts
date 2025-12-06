interface PayTonWithoutKYCOrderRequest {
  order_uuid: string;
  auth_key: string;
  cost: number;
  wallet_type?: string;
}

export function payTonWithoutKYCOrder(this: any, order_uuid: string, cost: number, authKey?: string, walletType?: string) {
  const req: PayTonWithoutKYCOrderRequest = {
    order_uuid,
    auth_key: this.getAuthKey(authKey),
    cost,
    wallet_type: walletType,
  };
  return this.post("/v2/buyTonWithoutKYC/pay", req);
}
