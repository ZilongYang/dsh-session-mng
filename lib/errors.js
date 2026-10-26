/**
 * One failure of a session-management operation, carrying the wire code, the
 * HTTP status the route answers with, and optional machine-readable details.
 *
 * @module dsh-session-mng/errors
 */

export class SessionMngError extends Error {
  /**
   * @param {string} code - stable wire code.
   * @param {string} message - human-readable reason.
   * @param {number} [status] - HTTP status the route answers with.
   * @param {object} [details] - optional machine-readable facts for the Client.
   */
  constructor(code, message, status = 400, details) {
    super(message)
    this.name = 'SessionMngError'
    this.code = code
    this.status = status
    if (details !== undefined) this.details = details
  }
}

/** Best-effort message of an unknown thrown value. */
export function messageOf(error) {
  if (error instanceof Error) return error.message
  return String(error)
}

/** Turn an unknown thrown value into a stable error envelope. */
export function toErrorPayload(error) {
  if (error instanceof SessionMngError) {
    return {
      code: error.code,
      message: error.message,
      status: error.status,
      ...(error.details === undefined ? {} : { details: error.details }),
    }
  }
  return { code: 'internal', message: messageOf(error), status: 500 }
}
