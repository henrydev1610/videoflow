# Estados dos trabalhos

A função pura `canTransition` está em `packages/shared/src/index.ts` e é compartilhada sem dependência de banco ou fila.

| Origem | Destinos normais |
|---|---|
| PENDING | DOWNLOADING, FAILED, CANCELLED |
| DOWNLOADING | PROCESSING, FAILED, CANCELLED |
| PROCESSING | COMPLETED, FAILED, CANCELLED |
| COMPLETED | EXPIRED |
| FAILED, CANCELLED, EXPIRED | Nenhum |

FAILED → PENDING requer causa `retry`. DOWNLOADING/PROCESSING → PENDING requer causa `recovery` e lease vencida. Nenhum estado terminal retorna ao processamento por evento normal. Os testes cobrem todos os 49 pares de estados e condições especiais.

A função define permissões; aquisição de lease e compare-and-set no banco continuam obrigatórios para operações concorrentes. A execução de processos e recuperação pertencem à mudança de processamento e ainda não estão implementadas.
