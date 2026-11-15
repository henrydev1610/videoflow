import { LogController, type FastifyReply, type FastifyRequest } from 'fastify';

// Erros internos do framework também não devem registrar caminhos, URLs ou stacks.
export class SafeLogController extends LogController {
  constructor() {
    super({ disableRequestLogging: true });
  }
  private safe(request: FastifyRequest, code: string) {
    request.log.error(
      { code, requestId: request.id },
      'Falha interna de transporte',
    );
  }
  override defaultErrorLog(
    _error: Error,
    request: FastifyRequest,
    _reply: FastifyReply,
  ) {
    this.safe(request, 'REQUEST_ERROR');
  }
  override streamError(
    _error: Error,
    request: FastifyRequest,
    _reply: FastifyReply,
  ) {
    this.safe(request, 'STREAM_ERROR');
  }
  override writeHeadError(
    _error: Error,
    request: FastifyRequest,
    _reply: FastifyReply,
  ) {
    this.safe(request, 'HEADER_ERROR');
  }
  override serializerError(
    _error: Error,
    request: FastifyRequest,
    _reply: FastifyReply,
    _metadata: { statusCode: number },
  ) {
    this.safe(request, 'SERIALIZATION_ERROR');
  }
}
