export function ping(this: any) {
  return this.get("/v2/ping");
}
