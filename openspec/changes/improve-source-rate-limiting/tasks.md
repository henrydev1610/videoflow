# Tasks: Source Rate Limiting

## 1. Classificacao de erros externos

- [x] 1.1 Implementar SOURCE_AUTH_REQUIRED no supervisor.
- [x] 1.2 Implementar SOURCE_RATE_LIMITED para HTTP 429.
- [x] 1.3 Definir precedencia de HTTP 429 sobre autenticacao.
- [x] 1.4 Integrar os codigos de erro com a API.
- [ ] 1.5 Criar testes automatizados de classificacao.
- [ ] 1.6 Verificar diagnosticos sanitizados de erros combinados.

## 2. Cooldown Redis

- [x] 2.1 Criar RedisSourceCooldown.
- [x] 2.2 Reutilizar a conexao Redis da API.
- [x] 2.3 Implementar cooldown compartilhado do YouTube.
- [x] 2.4 Preservar independencia de outras fontes.
- [x] 2.5 Implementar TTL e ativacao com NX.
- [x] 2.6 Integrar consulta e ativacao na rota de inspecao.
- [x] 2.7 Criar seis testes unitarios do modulo.
- [x] 2.8 Validar ativacao e expiracao manualmente no Redis.
- [ ] 2.9 Automatizar testes de integracao com Redis real.

## 3. API e Retry-After

- [x] 3.1 Retornar SOURCE_RATE_LIMITED com HTTP 429.
- [x] 3.2 Preservar Retry-After existente no error handler.
- [x] 3.3 Verificar manualmente HTTP 429 com cooldown ativo.
- [x] 3.4 Verificar ausencia de novas inspecoes no teste manual.
- [ ] 3.5 Testar Retry-After decrescente automaticamente.
- [ ] 3.6 Testar ausencia de novos jobs BullMQ.
- [ ] 3.7 Testar bloqueio e liberacao apos expiracao.
- [ ] 3.8 Testar falha do Redis e resposta HTTP 503.
- [ ] 3.9 Automatizar teste de isolamento entre fontes.

## 4. Concorrencia distribuida

- [ ] 4.1 Definir limite configuravel por fonte.
- [ ] 4.2 Implementar reserva atomica no Redis.
- [ ] 4.3 Implementar identificador de proprietario.
- [ ] 4.4 Implementar liberacao condicional segura.
- [ ] 4.5 Garantir liberacao em falhas e timeouts.
- [ ] 4.6 Garantir expiracao de reservas abandonadas.
- [ ] 4.7 Impedir rajadas apos expiracao do cooldown.
- [ ] 4.8 Testar solicitacoes concorrentes.
- [ ] 4.9 Testar recuperacao de reservas expiradas.

## 5. Compatibilidade de midia

- [x] 5.1 Instalar yt-dlp com dependencias padrao.
- [x] 5.2 Confirmar yt-dlp-ejs no sandbox.
- [x] 5.3 Habilitar runtime JavaScript Node.js.
- [x] 5.4 Preservar gateway e sandbox isolados.
- [ ] 5.5 Reexecutar regressao de processamento de midia.
- [ ] 5.6 Confirmar compatibilidade das fontes autorizadas.

## 6. Verificacao final

- [x] 6.1 Executar testes unitarios do cooldown.
- [x] 6.2 Executar typecheck.
- [x] 6.3 Executar ESLint.
- [x] 6.4 Executar verificacao Prettier.
- [x] 6.5 Confirmar build da API atualizada.
- [ ] 6.6 Executar regressao integrada completa.
- [ ] 6.7 Executar testes especializados de midia.
- [ ] 6.8 Executar testes HTTP automatizados do cooldown.
- [ ] 6.9 Validar todos os requisitos da nova spec.
- [ ] 6.10 Executar OpenSpec Verify.
- [ ] 6.11 Atualizar documentacao de verificacao.
- [ ] 6.12 Reconciliar dependencias com outras mudancas.
- [ ] 6.13 Confirmar ausencia de pendencias criticas.

## 7. Encerramento

- [ ] 7.1 Executar openspec validate --all --strict.
- [ ] 7.2 Confirmar todas as tarefas concluidas.
- [ ] 7.3 Aprovar o arquivamento da mudanca.
- [ ] 7.4 Consolidar as especificacoes oficiais.

## Observacoes

As tarefas marcadas como concluidas refletem as evidencias
tecnicas e os testes manuais ja realizados.

A nova implementacao nao remove as restricoes de acesso
impostas pelo YouTube.

A mudanca nao pode ser arquivada enquanto os requisitos
de concorrencia e os testes de integracao estiverem pendentes.