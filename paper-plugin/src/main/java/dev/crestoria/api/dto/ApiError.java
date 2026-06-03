package dev.crestoria.api.dto;

public final class ApiError extends RuntimeException {
    public final int status;
    public final String body;

    public ApiError(int status, String body) {
        super("API " + status + ": " + body);
        this.status = status;
        this.body = body;
    }
}
