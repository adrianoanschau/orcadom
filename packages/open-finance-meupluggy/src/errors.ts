export class NotSupportedError extends Error {
  override readonly name = 'NotSupportedError';

  constructor(message = 'Meu Pluggy does not support this operation') {
    super(message);
  }
}
