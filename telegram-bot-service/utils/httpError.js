export class HttpError extends Error {
  constructor(status, message, code = "") {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code || `HTTP_${status}`;
  }
}

export const createHttpError = (status, message, code = "") => new HttpError(status, message, code);
