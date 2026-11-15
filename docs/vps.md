# Preparação futura para VPS Ubuntu

Este é um procedimento planejado; nenhum deploy remoto foi executado.

1. Instalar Docker Engine/Compose suportados; dimensionar RAM (8 GiB recomendados), CPU, disco e limites dos volumes.
2. Configurar DNS e certificado TLS com renovação monitorada. Adaptar a publicação do proxy para 80/443; redirecionar HTTP para HTTPS. Configurar ORIGIN exatamente com a origem HTTPS para cookies Secure. Não publicar PostgreSQL/Redis/worker/sandbox.
3. Substituir credenciais locais por segredos únicos; proteger arquivo/env/backup por permissões e um gerenciador de segredos. Não versionar segredos. Codificar caracteres reservados da senha na URL de conexão.
4. Firewall: somente 80/443 públicos e SSH restrito. Verificar regras Docker efetivas; não presumir que apenas o firewall do host bloqueia portas publicadas.
5. Preservar redes isoladas e gateway único. Confirmar bloqueios a metadata/cloud, host, redes privadas e conexões diretas do sandbox na VPS.
6. Backups cifrados externos do banco e artefatos coordenados; ensaiar restore num projeto separado. Definir RPO/RTO, retenção e alertas de falha do backup.
7. Monitorar health, idade das filas, falhas/tentativas, OOM, disco e validade TLS. Métricas detalhadas ficam internas. Logs não incluem capacidades nem URLs sensíveis.
8. Atualizar digests/bibliotecas somente após audit e suíte real. Registrar versões anteriores e compatibilidade do schema; rollback de imagem não reverte migration automaticamente.
9. Executar smoke e E2E autorizados após mudança, sem conteúdo de terceiros nem bypass de SSRF. Manter ambiente de teste isolado da produção.

A configuração local entrega HTTP em loopback. Não é uma configuração HTTPS de VPS pronta para publicar sem estas adaptações e verificações.
