interface CreateTonWithoutKYCOrderRequest {
  username: string;
  amount: number;
  auth_key: string;
}

export function createTonWithoutKYCOrder(this: any, username: string, amount: number, authKey?: string) {
  const req: CreateTonWithoutKYCOrderRequest = {
    username,
    amount,
    auth_key: this.getAuthKey(authKey)
  };
  return this.post("/v2/buyTonWithoutKYC/create", req);
}
