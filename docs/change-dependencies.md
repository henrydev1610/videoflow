# Dependências cruzadas de implementação

Reconciliação de 15/11/2026: a fundação avançou de 15/18 para 18/18 e mídia chegou a 22/22. Matriz, reinício integrado e segurança de gateway/sandbox comprovados. Os relatórios preservam o histórico e os adendos de verificação. Nenhuma mudança foi arquivada; dashboard e aceite final Docker continuam pendentes.

| Tarefa | Dependência para concluir | Evidência exigida |
|---|---|---|
| Fundação 1.1 | Dependências de mídia, dashboard e infraestrutura | Versões fixas, engines/peers, lockfile e npm ci em container; ferramentas reais com versão identificada |
| Fundação 5.1 | Mídia 2–4 e Docker: banco, fila, gateway e sandbox | Inspeção/conversão reais, isolamento e persistência após reinício |
| Fundação 5.2 | Fundação 5.1 e segurança de mídia/infra | Matriz completa anonymous-access/download-api/media-security e qualidade aprovada |
| Mídia 1–4 | Fundação implementada e infraestrutura mínima | Spool, rede restrita, ferramentas reais, PostgreSQL e Redis |
| Mídia 5.1–5.2 | Mídia 1–4 e composição de teste | Seis combinações de formato/qualidade, falhas, cancelamento, recuperação e verificação |
| Docker: aceite final | Mídia e dashboard | Composição completa, E2E, operação e recuperação |

A alternância entre infraestrutura mínima e mídia está expressamente prevista nos designs aprovados. Não representa dispensa de critérios nem alteração dos contratos. A tarefa 1.1 foi concluída após instalar também as dependências do dashboard e comprovar npm ci/probe em Docker. A tarefa 5.1 foi concluída com inspeção/conversão e reinício real da API. Frontend implementado e infraestrutura completa continuam pendentes em suas próprias mudanças; a preparação de manifests e redes de teste não conclui essas etapas. Nenhuma mudança será arquivada nesta execução.
