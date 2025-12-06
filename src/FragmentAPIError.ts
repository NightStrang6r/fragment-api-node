export default class FragmentAPIError extends Error {
    constructor(message: string, public status?: number) {
        super(message);
        this.name = "FragmentAPIError";
        this.status = status;
    }
}