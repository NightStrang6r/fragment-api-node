interface CreatePremiumOrderRequest {
  username: string;
  duration?: number;
  auth_key: string;
  show_sender?: boolean;
}

export function createPremiumOrder(this: any, username: string, duration = 3, authKey?: string, showSender = false) {
  const req: CreatePremiumOrderRequest = {
    username,
    duration,
    auth_key: this.getAuthKey(authKey),
    show_sender: showSender,
  };
  return this.post("/v2/buyPremium/create", req);
}
