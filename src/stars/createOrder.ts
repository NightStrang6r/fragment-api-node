interface CreateStarsOrderRequest {
  username: string;
  amount: number;
  auth_key: string;
  show_sender?: boolean;
}

export function createStarsOrder(this: any, username: string, amount: number, authKey?: string, showSender = false) {
  const req: CreateStarsOrderRequest = {
    username,
    amount,
    auth_key: this.getAuthKey(authKey),
    show_sender: showSender,
  };
  return this.post("/v2/buyStars/create", req);
}
