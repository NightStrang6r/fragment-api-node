interface CreatePremiumWithoutKYCOrderRequest {
  username: string;
  duration?: number;
  auth_key: string;
}

export function createPremiumWithoutKYCOrder(this: any, username: string, duration = 3, authKey?: string) {
  const req: CreatePremiumWithoutKYCOrderRequest = {
    username,
    duration,
    auth_key: this.getAuthKey(authKey)
  };
  return this.post("/v2/buyPremiumWithoutKYC/create", req);
}
