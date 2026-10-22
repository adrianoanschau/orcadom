export class ProviderAuthError extends Error {
  override readonly name = 'ProviderAuthError';

  constructor(
    message = 'Provider rejected the credentials',
    readonly reason?: string,
  ) {
    super(message);
  }
}

export class ProviderRateLimitError extends Error {
  override readonly name = 'ProviderRateLimitError';

  constructor(readonly retryAfter: Date) {
    super('Provider rate limit');
  }
}

export class ProviderUnavailableError extends Error {
  override readonly name = 'ProviderUnavailableError';

  constructor(message = 'Provider unavailable') {
    super(message);
  }
}
