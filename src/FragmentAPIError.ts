export default class FragmentAPIError extends Error {
    // `error_code` is the server's machine-readable classification (e.g. TRANSFER_AMBIGUOUS,
    // ORDER_NOT_POSSIBLE); `details` the rest of its answer.
    constructor(message: string, public status?: number, public error_code: string | null = null, public details?: any) {
        super(message);
        this.name = "FragmentAPIError";
        this.status = status;
        this.error_code = error_code ?? null;
        this.details = details;
    }
}
