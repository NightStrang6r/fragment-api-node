interface CreateStarsWithoutKYCOrderRequest {
  username: string;
  amount: number;
  auth_key: string;
}

export function createStarsWithoutKYCOrder(this: any, username: string, amount: number, authKey?: string) {
  const req: CreateStarsWithoutKYCOrderRequest = {
    username,
    amount,
    auth_key: this.getAuthKey(authKey)
  };
  return this.post("/v2/buyStarsWithoutKYC/create", req);
}
