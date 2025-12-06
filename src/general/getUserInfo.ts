export function getUserInfo(this: any, username: string, authKey?: string) {
  return this.get(`/v2/getUserInfo?username=${encodeURIComponent(username)}&auth_key=${encodeURIComponent(this.getAuthKey(authKey))}`);
}
