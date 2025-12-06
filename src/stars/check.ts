export function getStarsOrderStatus(this: any, order_uuid: string) {
  return this.get(`/v2/buyStars/check?uuid=${order_uuid}`);
}
