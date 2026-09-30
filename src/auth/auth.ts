interface CreateAuthKeyRequest {
  fragment_cookies: string;
  seed: string;
}

import { warnV2 } from "../FragmentAPIClient.js";

export async function auth(this: any, fragmentCookies?: string, seed?: string) {
    warnV2();
    const req: CreateAuthKeyRequest = {
        fragment_cookies: this.getFragmentCookies(fragmentCookies),
        seed: this.getSeed(seed),
    };

    const resp = await this.post("/v2/auth", req);

    if (resp.auth_key) {
        this.authKey = resp.auth_key;
    } else {
        throw new Error("Error obtaining auth key");
    }

    return resp;
}